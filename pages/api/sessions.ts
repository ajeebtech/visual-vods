import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // Get Clerk user from request
    // In Pages Router, getAuth() should work if middleware is set up correctly
    const authResult = getAuth(req)
    const userId = authResult?.userId
    
    console.log('Sessions API - Auth result from getAuth:', { userId, hasAuth: !!authResult })
    
    // Get the authorization token from the request
    const authHeader = req.headers.authorization
    console.log('Sessions API - Authorization header present:', !!authHeader)
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized - no token provided' })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // If getAuth didn't work, try to verify the token with Clerk
    let finalUserId = userId
    if (!finalUserId) {
      console.warn('getAuth() returned no userId, trying to verify token with Clerk API')
      try {
        // Decode JWT to get user ID (JWT format: header.payload.signature)
        // The payload contains the 'sub' claim which is the user ID
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
        finalUserId = payload.sub
        console.log('Extracted userId from JWT:', finalUserId)
      } catch (decodeError) {
        console.error('Failed to decode JWT:', decodeError)
        return res.status(401).json({ 
          error: 'Unauthorized - invalid token format' 
        })
      }
    }
    
    if (!finalUserId) {
      return res.status(401).json({ 
        error: 'Unauthorized - could not get user ID from request' 
      })
    }

    console.log('Sessions API - User ID:', finalUserId)
    console.log('Sessions API - Token present:', !!token)
    console.log('Sessions API - Token length:', token?.length)

    // Create a Supabase client with the Clerk JWT token for RLS
    // This ensures auth.jwt()->>'sub' works correctly in RLS policies
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    )

    if (req.method === 'POST') {
      // Create a new session
      const { team1_name, team1_id, team2_name, team2_id, tournament, player_name, matches_data, title } = req.body

      if (!matches_data) {
        return res.status(400).json({ error: 'matches_data is required' })
      }

      // Use the user-specific client so RLS policies can check auth.uid()
      const { data, error } = await userSupabase
        .from('sessions')
        .insert({
          user_id: finalUserId,
          team1_name,
          team1_id,
          team2_name,
          team2_id,
          tournament,
          player_name,
          matches_data,
          title: title || `${team1_name || ''}${team2_name ? ` vs ${team2_name}` : ''}${tournament ? ` - ${tournament}` : ''}`.trim() || 'Untitled Session'
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating session:', error)
        return res.status(500).json({ error: error.message })
      }

      // Invalidate cache after creating session
      try {
        const { invalidateCache, getCacheKey } = await import('../../lib/redis')
        await invalidateCache(getCacheKey('sessions', finalUserId))
      } catch (cacheError) {
        console.error('Error invalidating cache:', cacheError)
      }

      return res.status(201).json(data)
    }

    if (req.method === 'GET') {
      // Get all sessions for the user with caching
      const { id } = req.query
      const { getCached, getCacheKey } = await import('../../lib/redis')

      if (id) {
        // Get a specific session
        const cacheKey = getCacheKey('session', id as string)
        
        const session = await getCached(
          cacheKey,
          async () => {
            const { data, error } = await userSupabase
              .from('sessions')
              .select('*')
              .eq('id', id as string)
              .single()

            if (error) {
              throw error
            }

            if (!data) {
              return null
            }

            return data
          },
          60 // 1 minute TTL
        )

        if (!session) {
          return res.status(404).json({ error: 'Session not found' })
        }

        return res.status(200).json(session)
      } else {
        // Get sessions for the user with pagination
        const limit = parseInt(req.query.limit as string) || 5
        const offset = parseInt(req.query.offset as string) || 0
        
        const cacheKey = getCacheKey('sessions', finalUserId, limit, offset)
        
        const result = await getCached(
          cacheKey,
          async () => {
            console.log('Fetching sessions for user:', finalUserId, 'limit:', limit, 'offset:', offset)
            
            // Get total count
            const { count, error: countError } = await userSupabase
              .from('sessions')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', finalUserId)

            if (countError) {
              console.error('Error counting sessions:', countError)
            }

            // Get paginated sessions
            const { data, error } = await userSupabase
              .from('sessions')
              .select('*')
              .eq('user_id', finalUserId) // Explicitly filter by user_id
              .order('created_at', { ascending: false })
              .range(offset, offset + limit - 1)

            if (error) {
              throw error
            }

            return {
              sessions: data || [],
              hasMore: (count || 0) > offset + (data?.length || 0),
              total: count || 0
            }
          },
          60 // 1 minute TTL (sessions change frequently)
        )

        console.log('Fetched', result?.sessions?.length || 0, 'sessions for user')
        return res.status(200).json(result)
      }
    }

    if (req.method === 'PUT') {
      // Update a session
      const { id, title, matches_data } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const updateData: any = {}
      if (title !== undefined) updateData.title = title
      if (matches_data !== undefined) updateData.matches_data = matches_data

      const { data, error } = await userSupabase
        .from('sessions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating session:', error)
        return res.status(500).json({ error: error.message })
      }

      // Invalidate cache after updating session
      try {
        const { invalidateCache, getCacheKey } = await import('../../lib/redis')
        await invalidateCache(getCacheKey('sessions', finalUserId))
        await invalidateCache(getCacheKey('session', id))
      } catch (cacheError) {
        console.error('Error invalidating cache:', cacheError)
      }

      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      // Delete a session
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const { error } = await userSupabase
        .from('sessions')
        .delete()
        .eq('id', id as string)

      if (error) {
        console.error('Error deleting session:', error)
        return res.status(500).json({ error: error.message })
      }

      // Invalidate cache after deleting session
      try {
        const { invalidateCache, getCacheKey } = await import('../../lib/redis')
        await invalidateCache(getCacheKey('sessions', finalUserId))
        await invalidateCache(getCacheKey('session', id as string))
      } catch (cacheError) {
        console.error('Error invalidating cache:', cacheError)
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in sessions API:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

