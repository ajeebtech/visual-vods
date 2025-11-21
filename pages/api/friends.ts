import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

// Service role client for operations that need to bypass RLS
const getServiceRoleClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    // Get Clerk user from request
    const authResult = getAuth(req)
    const userId = authResult?.userId
    
    // Get the authorization token from the request
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized - no token provided' })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // If getAuth didn't work, try to decode JWT
    let finalUserId = userId
    if (!finalUserId) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
        finalUserId = payload.sub
      } catch (decodeError) {
        return res.status(401).json({ error: 'Unauthorized - invalid token format' })
      }
    }
    
    if (!finalUserId) {
      return res.status(401).json({ error: 'Unauthorized - could not get user ID' })
    }

    // Create Supabase client with JWT
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // SEARCH USERS BY USERNAME
    if (req.method === 'GET' && req.query.action === 'search') {
      const { query } = req.query
      
      if (!query || typeof query !== 'string' || query.trim().length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' })
      }

      const searchQuery = query.trim().toLowerCase()
      
      console.log('Searching for users with query:', searchQuery)
      
      // Search profiles by username (case-insensitive partial match)
      // Filter out null usernames
      let { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .not('username', 'is', null) // Exclude users without usernames
        .ilike('username', `%${searchQuery}%`)
        .neq('id', finalUserId) // Exclude current user
        .limit(20)

      // If RLS blocks the query, try with service role client
      if (error && (error.code === '42501' || error.message?.includes('row-level security'))) {
        console.log('RLS blocked search, trying with service role client')
        const serviceClient = getServiceRoleClient()
        if (serviceClient) {
          const { data: serviceProfiles, error: serviceError } = await serviceClient
            .from('profiles')
            .select('id, username, avatar_url')
            .not('username', 'is', null)
            .ilike('username', `%${searchQuery}%`)
            .neq('id', finalUserId)
            .limit(20)
          
          if (!serviceError) {
            profiles = serviceProfiles
            error = null
          } else {
            console.error('Error with service client search:', serviceError)
            error = serviceError
          }
        }
      }

      if (error) {
        console.error('Error searching users:', error)
        return res.status(500).json({ error: error.message })
      }

      console.log('Search results:', profiles?.length || 0, 'users found')
      if (profiles && profiles.length > 0) {
        console.log('Sample results:', profiles.slice(0, 3).map((p: any) => ({ id: p.id, username: p.username })))
      } else {
        console.log('No users found. Checking if any profiles exist...')
        // Debug: Check if there are any profiles at all
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('id, username')
          .limit(5)
        console.log('Total profiles in DB (sample):', allProfiles?.length || 0)
        if (allProfiles && allProfiles.length > 0) {
          console.log('Sample profiles:', allProfiles.map((p: any) => ({ id: p.id, username: p.username })))
        }
      }

      return res.status(200).json({ users: profiles || [] })
    }

    // GET FRIEND REQUESTS (pending, accepted, or all)
    if (req.method === 'GET' && req.query.action === 'requests') {
      const { status } = req.query
      
      // Get friend requests where user is requester or addressee
      // First get the friend requests
      const { data: requests, error: requestsError } = await supabase
        .from('friends')
        .select('*')
        .or(`requester_id.eq.${finalUserId},addressee_id.eq.${finalUserId}`)
      
      if (requestsError) {
        console.error('Error fetching friend requests:', requestsError)
        return res.status(500).json({ error: requestsError.message })
      }

      // Get unique user IDs
      const userIds = new Set<string>()
      requests?.forEach((req: any) => {
        userIds.add(req.requester_id)
        userIds.add(req.addressee_id)
      })

      // Fetch profiles for all users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', Array.from(userIds))

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError)
        return res.status(500).json({ error: profilesError.message })
      }

      // Create a map of user profiles
      const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]))

      // Transform requests with profile data
      let query = requests || []

      // Filter by status if provided
      let filteredRequests = requests || []
      if (status && typeof status === 'string' && ['pending', 'accepted', 'rejected'].includes(status)) {
        filteredRequests = filteredRequests.filter((req: any) => req.status === status)
      }

      // Sort by created_at descending
      filteredRequests = filteredRequests.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      // Transform data to include friend info
      const transformed = filteredRequests.map((req: any) => {
        const isRequester = req.requester_id === finalUserId
        const friendId = isRequester ? req.addressee_id : req.requester_id
        const friend = profilesMap.get(friendId)
        
        return {
          id: req.id,
          status: req.status,
          created_at: req.created_at,
          updated_at: req.updated_at,
          isRequester,
          friend: {
            id: friend?.id,
            username: friend?.username || 'Unknown',
            avatar_url: friend?.avatar_url || null
          }
        }
      })

      return res.status(200).json({ requests: transformed })
    }

    // GET FRIENDS LIST (accepted friends only)
    if (req.method === 'GET' && req.query.action === 'list') {
      const limit = parseInt(req.query.limit as string) || 20
      const offset = parseInt(req.query.offset as string) || 0
      
      // Get total count first
      const { count, error: countError } = await supabase
        .from('friends')
        .select('*', { count: 'exact', head: true })
        .or(`requester_id.eq.${finalUserId},addressee_id.eq.${finalUserId}`)
        .eq('status', 'accepted')

      if (countError) {
        console.error('Error counting friends:', countError)
      }

      // Fetch paginated friends
      const { data: requests, error } = await supabase
        .from('friends')
        .select('*')
        .or(`requester_id.eq.${finalUserId},addressee_id.eq.${finalUserId}`)
        .eq('status', 'accepted')
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching friends:', error)
        return res.status(500).json({ error: error.message })
      }

      // Get unique user IDs
      const userIds = new Set<string>()
      requests?.forEach((req: any) => {
        userIds.add(req.requester_id)
        userIds.add(req.addressee_id)
      })

      // Fetch profiles for all users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', Array.from(userIds))

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError)
        return res.status(500).json({ error: profilesError.message })
      }

      // Create a map of user profiles
      const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]))

      // Transform data to include friend info
      const friends = (requests || []).map((req: any) => {
        const isRequester = req.requester_id === finalUserId
        const friendId = isRequester ? req.addressee_id : req.requester_id
        const friend = profilesMap.get(friendId)
        
        return {
          id: req.id,
          friend: {
            id: friend?.id,
            username: friend?.username || 'Unknown',
            avatar_url: friend?.avatar_url || null
          }
        }
      })

      return res.status(200).json({ 
        friends,
        hasMore: (count || 0) > offset + friends.length,
        total: count || 0
      })
    }

    // SEND FRIEND REQUEST
    if (req.method === 'POST' && req.query.action === 'send') {
      const { addressee_id } = req.body

      if (!addressee_id || typeof addressee_id !== 'string') {
        return res.status(400).json({ error: 'addressee_id is required' })
      }

      if (addressee_id === finalUserId) {
        return res.status(400).json({ error: 'Cannot send friend request to yourself' })
      }

      // Check if user exists
      const { data: addressee, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', addressee_id)
        .single()

      if (userError || !addressee) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Check if friend request already exists
      const { data: existing, error: checkError } = await supabase
        .from('friends')
        .select('*')
        .or(`and(requester_id.eq.${finalUserId},addressee_id.eq.${addressee_id}),and(requester_id.eq.${addressee_id},addressee_id.eq.${finalUserId})`)
        .single()

      if (existing) {
        if (existing.status === 'pending') {
          return res.status(400).json({ error: 'Friend request already exists' })
        }
        if (existing.status === 'accepted') {
          return res.status(400).json({ error: 'Already friends' })
        }
        // If rejected, allow sending a new request
      }

      // Create friend request
      const { data, error } = await supabase
        .from('friends')
        .insert({
          requester_id: finalUserId,
          addressee_id: addressee_id,
          status: 'pending'
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating friend request:', error)
        // Try with service role client if RLS fails
        if (error.code === '42501') {
          const serviceClient = getServiceRoleClient()
          if (serviceClient) {
            const { data: serviceData, error: serviceError } = await serviceClient
              .from('friends')
              .insert({
                requester_id: finalUserId,
                addressee_id: addressee_id,
                status: 'pending'
              })
              .select()
              .single()
            
            if (serviceError) {
              return res.status(500).json({ error: serviceError.message })
            }
            return res.status(201).json(serviceData)
          }
        }
        return res.status(500).json({ error: error.message })
      }

      return res.status(201).json(data)
    }

    // ACCEPT/REJECT FRIEND REQUEST
    if (req.method === 'PUT' && req.query.action === 'respond') {
      const { request_id, status } = req.body

      if (!request_id || typeof request_id !== 'string') {
        return res.status(400).json({ error: 'request_id is required' })
      }

      if (!status || !['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be "accepted" or "rejected"' })
      }

      // Verify the request exists and user is the addressee
      const { data: request, error: fetchError } = await supabase
        .from('friends')
        .select('*')
        .eq('id', request_id)
        .eq('addressee_id', finalUserId)
        .eq('status', 'pending')
        .single()

      if (fetchError || !request) {
        return res.status(404).json({ error: 'Friend request not found or already processed' })
      }

      // Update the request
      const { data, error } = await supabase
        .from('friends')
        .update({ status })
        .eq('id', request_id)
        .select()
        .single()

      if (error) {
        console.error('Error updating friend request:', error)
        // Try with service role client if RLS fails
        if (error.code === '42501') {
          const serviceClient = getServiceRoleClient()
          if (serviceClient) {
            const { data: serviceData, error: serviceError } = await serviceClient
              .from('friends')
              .update({ status })
              .eq('id', request_id)
              .select()
              .single()
            
            if (serviceError) {
              return res.status(500).json({ error: serviceError.message })
            }
            return res.status(200).json(serviceData)
          }
        }
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json(data)
    }

    // DELETE/CANCEL FRIEND REQUEST
    if (req.method === 'DELETE') {
      const { request_id } = req.query

      if (!request_id || typeof request_id !== 'string') {
        return res.status(400).json({ error: 'request_id is required' })
      }

      // Verify the request exists and user is requester or addressee
      const { data: request, error: fetchError } = await supabase
        .from('friends')
        .select('*')
        .eq('id', request_id)
        .or(`requester_id.eq.${finalUserId},addressee_id.eq.${finalUserId}`)
        .single()

      if (fetchError || !request) {
        return res.status(404).json({ error: 'Friend request not found' })
      }

      // Delete the request
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', request_id)

      if (error) {
        console.error('Error deleting friend request:', error)
        // Try with service role client if RLS fails
        if (error.code === '42501') {
          const serviceClient = getServiceRoleClient()
          if (serviceClient) {
            const { error: serviceError } = await serviceClient
              .from('friends')
              .delete()
              .eq('id', request_id)
            
            if (serviceError) {
              return res.status(500).json({ error: serviceError.message })
            }
            return res.status(200).json({ success: true })
          }
        }
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in friends API:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

