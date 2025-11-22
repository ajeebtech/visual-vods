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

  let finalUserId: string | null = null
  let token: string | null = null

  try {
    // Attempt to get Clerk user from request using clerkMiddleware
    const authResult = getAuth(req)
    finalUserId = authResult?.userId
    console.log('Notes API - Auth result from getAuth:', { userId: finalUserId, hasAuth: !!authResult })
    
    // If getAuth() didn't return a userId, try to decode the JWT manually
    if (!finalUserId) {
      console.warn('getAuth() returned no userId, trying to decode JWT manually')
      const authHeader = req.headers.authorization
      if (authHeader) {
        token = authHeader.replace('Bearer ', '')
        try {
          // Decode the token to get the user ID (sub claim)
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
          finalUserId = payload.sub
          console.log('Extracted userId from JWT:', finalUserId)
        } catch (jwtError) {
          console.error('Failed to decode JWT:', jwtError)
        }
      } else {
        console.warn('No Authorization header found for manual JWT decoding.')
      }
    }

    if (!finalUserId) {
      return res.status(401).json({ error: 'Unauthorized - could not get user ID from request' })
    }

    // Get the authorization token from the request (if not already extracted)
    if (!token) {
      const authHeader = req.headers.authorization
      if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized - no token provided' })
      }
      token = authHeader.replace('Bearer ', '')
    }

    console.log('Notes API - Final User ID:', finalUserId)
    console.log('Notes API - Token present:', !!token)

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
      // Create a new note
      const { session_id, match_href, vod_url, timestamp_seconds, note_text } = req.body

      if (!session_id || !match_href || !vod_url || timestamp_seconds === undefined || !note_text) {
        return res.status(400).json({ error: 'All fields are required' })
      }

      // Round timestamp to integer since database column is INTEGER
      const roundedTimestamp = Math.round(Number(timestamp_seconds))

      // Verify session belongs to user (RLS will handle this, but we check for better error messages)
      const { data: session, error: sessionError } = await userSupabase
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .single()

      if (sessionError || !session) {
        return res.status(404).json({ error: 'Session not found' })
      }

      // Use the user-specific client so RLS policies can check auth.uid()
      const { data, error } = await userSupabase
        .from('notes')
        .insert({
          session_id,
          user_id: finalUserId, // Use finalUserId here
          match_href,
          vod_url,
          timestamp_seconds: roundedTimestamp, // Use rounded timestamp
          note_text
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating note:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(201).json(data)
    }

    if (req.method === 'GET') {
      // Get notes for a session and match
      const { session_id, match_href, vod_url } = req.query

      if (!session_id) {
        return res.status(400).json({ error: 'session_id is required' })
      }

      // Get session and verify access (user owns it OR is friends with owner)
      const { data: session, error: sessionError } = await userSupabase
        .from('sessions')
        .select('id, user_id')
        .eq('id', session_id as string)
        .single()

      if (sessionError || !session) {
        return res.status(404).json({ error: 'Session not found' })
      }

      // If user doesn't own the session, check if they're friends
      if (session.user_id !== finalUserId) {
        const { data: friendships, error: friendError } = await userSupabase
          .from('friends')
          .select('*')
          .or(`and(requester_id.eq.${finalUserId},addressee_id.eq.${session.user_id}),and(requester_id.eq.${session.user_id},addressee_id.eq.${finalUserId})`)
          .eq('status', 'accepted')

        if (friendError || !friendships || friendships.length === 0) {
          return res.status(403).json({ error: 'Access denied - you must be friends with the session owner' })
        }
      }

      // Fetch notes
      let query = userSupabase
        .from('notes')
        .select('*')
        .eq('session_id', session_id as string)
        .order('timestamp_seconds', { ascending: true })

      if (match_href) {
        query = query.eq('match_href', match_href as string)
      }

      if (vod_url) {
        query = query.eq('vod_url', vod_url as string)
      }

      const { data: notes, error } = await query

      if (error) {
        console.error('Error fetching notes:', error)
        return res.status(500).json({ error: error.message })
      }

      // Fetch usernames and avatars for all unique user_ids
      const userIds = Array.from(new Set((notes || []).map((note: any) => note.user_id)))
      const profilesMap: Record<string, { username: string; avatar_url: string | null }> = {}

      if (userIds.length > 0) {
        const { data: profiles } = await userSupabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)

        if (profiles) {
          profiles.forEach((profile: any) => {
            profilesMap[profile.id] = {
              username: profile.username || 'Unknown',
              avatar_url: profile.avatar_url || null
            }
          })
        }
      }

      // Transform data to include username and avatar_url
      const notesWithProfile = (notes || []).map((note: any) => ({
        ...note,
        username: profilesMap[note.user_id]?.username || 'Unknown',
        avatar_url: profilesMap[note.user_id]?.avatar_url || null
      }))

      return res.status(200).json(notesWithProfile)
    }

    if (req.method === 'PUT') {
      // Update a note
      const { id, timestamp_seconds, note_text } = req.body

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const updateData: any = {}
      // Round timestamp to integer if provided
      if (timestamp_seconds !== undefined) updateData.timestamp_seconds = Math.round(Number(timestamp_seconds))
      if (note_text !== undefined) updateData.note_text = note_text

      const { data, error } = await userSupabase
        .from('notes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating note:', error)
        return res.status(500).json({ error: error.message })
      }

      if (!data) {
        return res.status(404).json({ error: 'Note not found' })
      }

      return res.status(200).json(data)
    }

    if (req.method === 'DELETE') {
      // Delete a note
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'id is required' })
      }

      const { error } = await userSupabase
        .from('notes')
        .delete()
        .eq('id', id as string)

      if (error) {
        console.error('Error deleting note:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in notes API:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

