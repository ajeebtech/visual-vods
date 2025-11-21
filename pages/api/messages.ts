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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT')
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

    // GET CONVERSATIONS (list of people you've messaged or been messaged by)
    if (req.method === 'GET' && req.query.action === 'conversations') {
      // Get all unique conversations (people you've messaged with)
      const { data: messages, error } = await supabase
        .from('messages')
        .select('sender_id, receiver_id, content, created_at, read_at')
        .or(`sender_id.eq.${finalUserId},receiver_id.eq.${finalUserId}`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching conversations:', error)
        return res.status(500).json({ error: error.message })
      }

      // Group messages by conversation partner
      const conversationsMap = new Map<string, {
        userId: string
        lastMessage: string
        lastMessageTime: string
        unreadCount: number
      }>()

      messages?.forEach((msg: any) => {
        const partnerId = msg.sender_id === finalUserId ? msg.receiver_id : msg.sender_id
        
        if (!conversationsMap.has(partnerId)) {
          conversationsMap.set(partnerId, {
            userId: partnerId,
            lastMessage: msg.content,
            lastMessageTime: msg.created_at,
            unreadCount: 0
          })
        } else {
          const conv = conversationsMap.get(partnerId)!
          // Update if this is a more recent message
          if (new Date(msg.created_at) > new Date(conv.lastMessageTime)) {
            conv.lastMessage = msg.content
            conv.lastMessageTime = msg.created_at
          }
        }

        // Count unread messages
        if (msg.receiver_id === finalUserId && !msg.read_at) {
          const conv = conversationsMap.get(partnerId)!
          conv.unreadCount++
        }
      })

      // Get profiles for all conversation partners
      const userIds = Array.from(conversationsMap.keys())
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds)

      const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]))

      // Transform to include profile info
      const conversations = Array.from(conversationsMap.values()).map(conv => ({
        ...conv,
        username: profilesMap.get(conv.userId)?.username || 'Unknown',
        avatar_url: profilesMap.get(conv.userId)?.avatar_url || null
      }))

      // Sort by last message time
      conversations.sort((a, b) => 
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      )

      return res.status(200).json({ conversations })
    }

    // GET MESSAGES for a specific conversation
    if (req.method === 'GET' && req.query.action === 'messages') {
      const { otherUserId } = req.query

      if (!otherUserId || typeof otherUserId !== 'string') {
        return res.status(400).json({ error: 'otherUserId is required' })
      }

      // Get messages between current user and other user
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${finalUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${finalUserId})`)
        .order('created_at', { ascending: true })
        .limit(100)

      if (error) {
        console.error('Error fetching messages:', error)
        return res.status(500).json({ error: error.message })
      }

      // Mark messages as read
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('receiver_id', finalUserId)
        .eq('sender_id', otherUserId)
        .is('read_at', null)

      return res.status(200).json({ messages: messages || [] })
    }

    // SEND MESSAGE
    if (req.method === 'POST') {
      const { receiver_id, content } = req.body

      if (!receiver_id || typeof receiver_id !== 'string') {
        return res.status(400).json({ error: 'receiver_id is required' })
      }

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'content is required and cannot be empty' })
      }

      if (receiver_id === finalUserId) {
        return res.status(400).json({ error: 'Cannot send message to yourself' })
      }

      // Verify users are friends (optional check - you can remove this if you want to allow messaging anyone)
      const { data: friendship } = await supabase
        .from('friends')
        .select('*')
        .or(`and(requester_id.eq.${finalUserId},addressee_id.eq.${receiver_id}),and(requester_id.eq.${receiver_id},addressee_id.eq.${finalUserId})`)
        .eq('status', 'accepted')
        .single()

      if (!friendship) {
        return res.status(403).json({ error: 'You can only message your friends' })
      }

      // Create message
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: finalUserId,
          receiver_id: receiver_id,
          content: content.trim()
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating message:', error)
        // Try with service role client if RLS fails
        if (error.code === '42501') {
          const serviceClient = getServiceRoleClient()
          if (serviceClient) {
            const { data: serviceData, error: serviceError } = await serviceClient
              .from('messages')
              .insert({
                sender_id: finalUserId,
                receiver_id: receiver_id,
                content: content.trim()
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

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in messages API:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

