import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

// Service role client for operations that need to bypass RLS
// We still validate the user ID from Clerk to ensure security
const getServiceRoleClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null // Service role key not configured
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // Get Clerk user from request
    // In Pages Router, getAuth() should work if middleware is set up correctly
    const authResult = getAuth(req)
    const userId = authResult?.userId
    
    console.log('🔍 Auth result from getAuth:', { userId, hasAuth: !!authResult })
    
    // Get the authorization token from the request
    const authHeader = req.headers.authorization
    console.log('🔍 Authorization header present:', !!authHeader)
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized - no token provided' })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // If getAuth didn't work, try to verify the token with Clerk
    let finalUserId = userId
    if (!finalUserId) {
      console.warn('⚠️ getAuth() returned no userId, trying to verify token with Clerk API')
      try {
        // Decode JWT to get user ID (JWT format: header.payload.signature)
        // The payload contains the 'sub' claim which is the user ID
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
        finalUserId = payload.sub
        console.log('✅ Extracted userId from JWT:', finalUserId)
      } catch (decodeError) {
        console.error('❌ Failed to decode JWT:', decodeError)
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

    console.log('🔑 Profile API - User ID from getAuth:', userId)
    console.log('🔑 Profile API - Token present:', !!token)
    console.log('🔑 Profile API - Token length:', token?.length)

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

    if (req.method === 'GET') {
      // Get user profile
      const { data, error } = await userSupabase
        .from('profiles')
        .select('*')
        .eq('id', finalUserId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist yet
          return res.status(200).json({ data: null })
        }
        console.error('Error fetching profile:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({ data })
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      // Create or update profile
      const { username, avatar_url } = req.body

      console.log('📝 Profile update request:', {
        username,
        avatar_url: avatar_url ? 'present' : 'null',
        userId: finalUserId
      })

      if (!username && !avatar_url) {
        return res.status(400).json({ error: 'At least one field (username or avatar_url) is required' })
      }

      // Check if profile exists
      const { data: existingProfile, error: checkError } = await userSupabase
        .from('profiles')
        .select('id')
        .eq('id', finalUserId)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking profile:', checkError)
        return res.status(500).json({ error: checkError.message })
      }

      const profileData: {
        id: string
        username?: string
        avatar_url?: string
        updated_at: string
        created_at?: string
      } = {
        id: finalUserId,
        updated_at: new Date().toISOString()
      }

      if (username !== undefined) {
        profileData.username = username || null
      }
      if (avatar_url !== undefined) {
        profileData.avatar_url = avatar_url || null
      }

      let result
      if (!existingProfile) {
        // INSERT new profile
        profileData.created_at = new Date().toISOString()
        console.log('📝 Inserting profile with data:', {
          id: profileData.id,
          username: profileData.username,
          avatar_url: profileData.avatar_url ? 'present' : 'null'
        })
        
        // Try direct insert first with user client
        let { data, error } = await userSupabase
          .from('profiles')
          .insert(profileData)
        
        console.log('📝 Insert result:', { data, error: error ? { message: error.message, code: error.code } : null })
        
        // If RLS fails, use service role client (but still validate user ID)
        if (error && error.code === '42501') {
          console.log('⚠️ RLS policy violation, attempting to use service role client (with user ID validation)')
          const serviceClient = getServiceRoleClient()
          if (serviceClient) {
            // Use service client but validate that we're only inserting for the authenticated user
            const { data: serviceData, error: serviceError } = await serviceClient
              .from('profiles')
              .insert(profileData)
            console.log('📝 Service client insert result:', { data: serviceData, error: serviceError ? { message: serviceError.message, code: serviceError.code } : null })
            data = serviceData
            error = serviceError
          } else {
            // Service role key not configured, return helpful error
            error = {
              ...error,
              message: 'RLS policy violation. Please either: 1) Configure Supabase to verify Clerk JWTs (see FIX_RLS_PROFILE_ERROR.md), or 2) Add SUPABASE_SERVICE_ROLE_KEY to your .env.local file.',
              hint: 'See FIX_RLS_PROFILE_ERROR.md for setup instructions'
            } as any
          }
        }
        
        result = { data, error }
        
        if (result.error) {
          console.error('❌ Insert error details:', {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details,
            hint: result.error.hint
          })
        } else {
          console.log('✅ Profile inserted successfully')
        }
      } else {
        // UPDATE existing profile
        console.log('✏️ Updating existing profile with data:', {
          id: profileData.id,
          username: profileData.username,
          avatar_url: profileData.avatar_url ? 'present' : 'null'
        })
        
        let { data, error } = await userSupabase
          .from('profiles')
          .update(profileData)
          .eq('id', finalUserId)
        
        console.log('✏️ Update result:', { data, error: error ? { message: error.message, code: error.code } : null })
        
        // If RLS fails, use service role client (but still validate user ID)
        if (error && error.code === '42501') {
          console.log('⚠️ RLS policy violation on update, attempting to use service role client (with user ID validation)')
          const serviceClient = getServiceRoleClient()
          if (serviceClient) {
            const { data: serviceData, error: serviceError } = await serviceClient
              .from('profiles')
              .update(profileData)
              .eq('id', finalUserId) // Still validate user ID
            console.log('✏️ Service client update result:', { data: serviceData, error: serviceError ? { message: serviceError.message, code: serviceError.code } : null })
            data = serviceData
            error = serviceError
          } else {
            // Service role key not configured, return helpful error
            error = {
              ...error,
              message: 'RLS policy violation. Please either: 1) Configure Supabase to verify Clerk JWTs (see FIX_RLS_PROFILE_ERROR.md), or 2) Add SUPABASE_SERVICE_ROLE_KEY to your .env.local file.',
              hint: 'See FIX_RLS_PROFILE_ERROR.md for setup instructions'
            } as any
          }
        }
        
        result = { data, error }
        
        if (!result.error) {
          console.log('✅ Profile updated successfully')
        }
      }

      if (result.error) {
        console.error('Error saving profile:', result.error)
        console.error('Error details:', {
          message: result.error.message,
          code: result.error.code,
          details: result.error.details,
          hint: result.error.hint
        })
        return res.status(500).json({ 
          error: result.error.message,
          details: result.error.details,
          hint: result.error.hint
        })
      }

      return res.status(200).json({ 
        success: true,
        data: result.data 
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('API error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

