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

    // GET CONVERSATIONS (list of people you've messaged or been messaged by, including group chats)
    if (req.method === 'GET' && req.query.action === 'conversations') {
      // Get all conversations user is part of
      const { data: userConversations, error: convError } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', finalUserId)

      if (convError) {
        console.error('Error fetching user conversations:', convError)
        return res.status(500).json({ error: convError.message })
      }

      const conversationIds = (userConversations || []).map((uc: any) => uc.conversation_id)

      if (conversationIds.length === 0) {
        return res.status(200).json({ conversations: [] })
      }

      // Get conversation details
      const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)

      if (conversationsError) {
        console.error('Error fetching conversations:', conversationsError)
        return res.status(500).json({ error: conversationsError.message })
      }

      // Get last message for each conversation
      const { data: lastMessages, error: messagesError } = await supabase
        .from('messages')
        .select('conversation_id, content, created_at, sender_id, read_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })

      if (messagesError) {
        console.error('Error fetching last messages:', messagesError)
      }

      // Group last messages by conversation
      const lastMessageMap = new Map<string, any>()
      lastMessages?.forEach((msg: any) => {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg)
        }
      })

      // Get participants for group chats (need this first to determine group vs direct)
      const { data: allParticipants, error: participantsError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', conversationIds)

      const participantsMap = new Map<string, string[]>()
      allParticipants?.forEach((p: any) => {
        if (!participantsMap.has(p.conversation_id)) {
          participantsMap.set(p.conversation_id, [])
        }
        participantsMap.get(p.conversation_id)!.push(p.user_id)
      })

      // Determine which conversations are group chats
      const groupChatMap = new Map<string, boolean>()
      conversations?.forEach((conv: any) => {
        const participantCount = participantsMap.get(conv.id)?.length || 0
        // A conversation is a group chat if it has type 'group' OR has more than 2 participants OR has a name
        groupChatMap.set(conv.id, conv.type === 'group' || participantCount > 2 || !!conv.name)
      })

      // Get unread counts
      // For group chats, count messages where sender is not current user and read_at is null
      // For direct messages, count messages where receiver_id = current user and read_at is null
      const { data: allUnreadMessages, error: unreadError } = await supabase
        .from('messages')
        .select('conversation_id, receiver_id, sender_id')
        .in('conversation_id', conversationIds)
        .is('read_at', null)

      const unreadCountMap = new Map<string, number>()
      allUnreadMessages?.forEach((msg: any) => {
        const isGroupChat = groupChatMap.get(msg.conversation_id) || false
        if (isGroupChat) {
          // For group chats, count if sender is not current user
          if (msg.sender_id !== finalUserId) {
            unreadCountMap.set(msg.conversation_id, (unreadCountMap.get(msg.conversation_id) || 0) + 1)
          }
        } else {
          // For direct messages, count if receiver_id = current user
          if (msg.receiver_id === finalUserId) {
            unreadCountMap.set(msg.conversation_id, (unreadCountMap.get(msg.conversation_id) || 0) + 1)
          }
        }
      })

      // Get profiles for all participants
      const allParticipantIds = Array.from(new Set(allParticipants?.map((p: any) => p.user_id) || []))
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', allParticipantIds)

      const profilesMap = new Map((profiles || []).map((p: any) => [p.id, p]))

      // Transform conversations
      const transformedConversations = (conversations || []).map((conv: any) => {
        const lastMessage = lastMessageMap.get(conv.id)
        const participants = participantsMap.get(conv.id) || []
        const otherParticipants = participants.filter((id: string) => id !== finalUserId)
        
        // Determine if this is a group chat
        const isGroupChat = groupChatMap.get(conv.id) || false
        const conversationType = conv.type || (isGroupChat ? 'group' : 'direct')
        
        // For direct messages, show the other person's info
        // For group chats, show group name
        let displayName = conv.name || 'Group Chat'
        let avatar_url: string | null = null
        
        if (conversationType === 'direct' && otherParticipants.length === 1) {
          const otherUser = profilesMap.get(otherParticipants[0])
          displayName = otherUser?.username || 'Unknown'
          avatar_url = otherUser?.avatar_url || null
        } else if (conversationType === 'group' || isGroupChat) {
          // For group chats, use the conversation name or default to 'Group Chat'
          displayName = conv.name || 'Group Chat'
          // For group chats, you could show a group icon or first participant's avatar
          if (otherParticipants.length > 0) {
            const firstOther = profilesMap.get(otherParticipants[0])
            avatar_url = firstOther?.avatar_url || null
          }
        }

        return {
          conversationId: conv.id,
          type: conversationType,
          name: displayName,
          avatar_url,
          lastMessage: lastMessage?.content || '',
          lastMessageTime: lastMessage?.created_at || conv.created_at,
          unreadCount: unreadCountMap.get(conv.id) || 0,
          participantCount: participants.length,
          // For direct messages, include userId of the other participant
          userId: conversationType === 'direct' && otherParticipants.length === 1 ? otherParticipants[0] : undefined
        }
      })

      // Sort by last message time
      transformedConversations.sort((a, b) => 
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      )

      return res.status(200).json({ conversations: transformedConversations })
    }

    // GET MESSAGES for a specific conversation
    if (req.method === 'GET' && req.query.action === 'messages') {
      const { conversationId, otherUserId } = req.query

      // Support both conversation-based (new) and user-based (legacy) messaging
      if (conversationId && typeof conversationId === 'string') {
        // Verify user is part of this conversation first
        const { data: userParticipant } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('conversation_id', conversationId)
          .eq('user_id', finalUserId)
          .single()
        
        if (!userParticipant) {
          return res.status(403).json({ error: 'You are not part of this conversation' })
        }
        
        // Get cursor for pagination (Instagram-style infinite scroll)
        const cursor = req.query.cursor as string | undefined
        const limit = parseInt(req.query.limit as string) || 50
        
        // Build query with cursor-based pagination
        // Strictly filter by conversation_id to ensure no cross-contamination
        let query = supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId) // Strict filter - only this conversation
          .order('created_at', { ascending: false }) // Newest first for pagination
          .limit(limit)
        
        // If cursor provided, get messages before that timestamp
        if (cursor) {
          query = query.lt('created_at', cursor)
        }
        
        const { data: messages, error } = await query

        if (error) {
          console.error('Error fetching messages:', error)
          return res.status(500).json({ error: error.message })
        }

        // Reverse to show oldest first (for display)
        const sortedMessages = (messages || []).reverse()
        
        // Get next cursor (oldest message timestamp for pagination)
        const nextCursor = sortedMessages.length > 0 
          ? sortedMessages[0].created_at 
          : null
        const hasMore = (messages || []).length === limit

        // Mark conversation as read (Instagram-style: update last_read_at in conversation_participants)
        // This is more efficient than updating individual messages
        const now = new Date().toISOString()
        await supabase
          .from('conversation_participants')
          .update({ last_read_at: now })
          .eq('conversation_id', conversationId)
          .eq('user_id', finalUserId)
        
        // Also update read_at on messages for backward compatibility
        const { data: conversation } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .single()
        
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select('user_id, last_read_at')
          .eq('conversation_id', conversationId)
        
        const isGroupChat = (participants?.length || 0) > 2 || conversation?.name
        
        if (isGroupChat) {
          // For group chats, mark messages where sender is not current user and read_at is null
          await supabase
            .from('messages')
            .update({ read_at: now })
            .eq('conversation_id', conversationId)
            .neq('sender_id', finalUserId)
            .is('read_at', null)
        } else {
          // For direct messages, mark messages where receiver_id = current user
          await supabase
            .from('messages')
            .update({ read_at: now })
            .eq('conversation_id', conversationId)
            .eq('receiver_id', finalUserId)
            .is('read_at', null)
        }

        // Get read receipts (last_read_at from conversation_participants)
        const readReceipts = new Map<string, string>()
        participants?.forEach((p: any) => {
          if (p.last_read_at) {
            readReceipts.set(p.user_id, p.last_read_at)
          }
        })

        return res.status(200).json({ 
          messages: sortedMessages,
          nextCursor,
          hasMore,
          readReceipts: Object.fromEntries(readReceipts)
        })
      } else if (otherUserId && typeof otherUserId === 'string') {
        // Legacy: Get messages between current user and other user (direct message)
        // First, get all group chat conversation IDs to exclude them
        const { data: allUserConversations } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', finalUserId)
        
        const userConversationIds = (allUserConversations || []).map((uc: any) => uc.conversation_id)
        
        // Get group chat IDs (conversations with type='group' or more than 2 participants)
        let groupChatIds: string[] = []
        if (userConversationIds.length > 0) {
          const { data: userConvs } = await supabase
            .from('conversations')
            .select('id, type')
            .in('id', userConversationIds)
          
          const groupConvs = userConvs?.filter((c: any) => c.type === 'group') || []
          groupChatIds = groupConvs.map((c: any) => c.id)
          
          // Also check for conversations with more than 2 participants
          const { data: participantCounts } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .in('conversation_id', userConversationIds)
          
          const participantMap = new Map<string, number>()
          participantCounts?.forEach((p: any) => {
            participantMap.set(p.conversation_id, (participantMap.get(p.conversation_id) || 0) + 1)
          })
          
          participantMap.forEach((count, convId) => {
            if (count > 2 && !groupChatIds.includes(convId)) {
              groupChatIds.push(convId)
            }
          })
        }
        
        // Get messages between the two users
        const { data: allMessages, error } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${finalUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${finalUserId})`)
          .order('created_at', { ascending: true })
          .limit(100)
        
        // Filter out group chat messages
        const messages = (allMessages || []).filter((msg: any) => {
          // If message has no conversation_id, it's a direct message (legacy)
          if (!msg.conversation_id) return true
          // If conversation_id is not in group chat IDs, it's a direct message conversation
          return !groupChatIds.includes(msg.conversation_id)
        })

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
      } else {
        return res.status(400).json({ error: 'conversationId or otherUserId is required' })
      }
    }

    // CREATE GROUP CHAT
    if (req.method === 'POST' && req.body.action === 'create_group') {
      const { name, participant_ids } = req.body

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name is required' })
      }

      if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
        return res.status(400).json({ error: 'participant_ids is required and must be a non-empty array' })
      }

      // Verify all participants are friends (skip if participant is the current user)
      for (const participantId of participant_ids) {
        // Skip checking if user is trying to add themselves
        if (participantId === finalUserId) {
          continue
        }

        const { data: friendship, error: friendshipError } = await supabase
          .from('friends')
          .select('*')
          .or(`and(requester_id.eq.${finalUserId},addressee_id.eq.${participantId}),and(requester_id.eq.${participantId},addressee_id.eq.${finalUserId})`)
          .eq('status', 'accepted')
          .maybeSingle()

        if (friendshipError) {
          console.error('Error checking friendship:', friendshipError)
          return res.status(500).json({ error: 'Error verifying friendship status' })
        }

        if (!friendship) {
          // Get username for better error message
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', participantId)
            .maybeSingle()
          
          const username = profile?.username || participantId
          return res.status(403).json({ error: `${username} is not your friend. Please add them as a friend first.` })
        }
      }

      // Create conversation
      // Try with user client first, fallback to service role if RLS fails
      let conversation
      let convError
      
      const { data: convData, error: userError } = await supabase
        .from('conversations')
        .insert({
          name: name.trim(),
          type: 'group',
          created_by: finalUserId
        })
        .select()
        .single()

      if (userError) {
        console.error('Error creating conversation with user client:', userError)
        // Try with service role client if RLS fails
        if (userError.code === '42501' || userError.message.includes('row-level security')) {
          const serviceClient = getServiceRoleClient()
          if (serviceClient) {
            const { data: serviceData, error: serviceError } = await serviceClient
              .from('conversations')
              .insert({
                name: name.trim(),
                type: 'group',
                created_by: finalUserId
              })
              .select()
              .single()
            
            if (serviceError) {
              console.error('Error creating conversation with service client:', serviceError)
              return res.status(500).json({ error: serviceError.message })
            }
            conversation = serviceData
          } else {
            return res.status(500).json({ error: userError.message })
          }
        } else {
          return res.status(500).json({ error: userError.message })
        }
      } else {
        conversation = convData
      }

      // Add creator and participants
      const participants = [
        { conversation_id: conversation.id, user_id: finalUserId },
        ...participant_ids.map((id: string) => ({
          conversation_id: conversation.id,
          user_id: id
        }))
      ]

      // Use service role client for inserting participants to avoid RLS issues
      const serviceClient = getServiceRoleClient()
      if (!serviceClient) {
        // Delete conversation if we can't add participants
        await supabase.from('conversations').delete().eq('id', conversation.id)
        return res.status(500).json({ error: 'Service role client not available' })
      }

      const { error: participantsError } = await serviceClient
        .from('conversation_participants')
        .insert(participants)

      if (participantsError) {
        console.error('Error adding participants:', participantsError)
        // Delete conversation if adding participants fails
        await serviceClient.from('conversations').delete().eq('id', conversation.id)
        return res.status(500).json({ error: participantsError.message })
      }

      return res.status(201).json(conversation)
    }

    // ADD PARTICIPANTS TO GROUP
    if (req.method === 'POST' && req.body.action === 'add_participants') {
      const { conversation_id, participant_ids } = req.body

      if (!conversation_id || typeof conversation_id !== 'string') {
        return res.status(400).json({ error: 'conversation_id is required' })
      }

      if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
        return res.status(400).json({ error: 'participant_ids is required and must be a non-empty array' })
      }

      // Verify user is part of the conversation
      const { data: userParticipant } = await supabase
        .from('conversation_participants')
        .select('*')
        .eq('conversation_id', conversation_id)
        .eq('user_id', finalUserId)
        .single()

      if (!userParticipant) {
        return res.status(403).json({ error: 'You are not part of this conversation' })
      }

      // Verify all participants are friends (skip if participant is the current user)
      for (const participantId of participant_ids) {
        // Skip checking if user is trying to add themselves
        if (participantId === finalUserId) {
          continue
        }

        const { data: friendship, error: friendshipError } = await supabase
          .from('friends')
          .select('*')
          .or(`and(requester_id.eq.${finalUserId},addressee_id.eq.${participantId}),and(requester_id.eq.${participantId},addressee_id.eq.${finalUserId})`)
          .eq('status', 'accepted')
          .maybeSingle()

        if (friendshipError) {
          console.error('Error checking friendship:', friendshipError)
          return res.status(500).json({ error: 'Error verifying friendship status' })
        }

        if (!friendship) {
          // Get username for better error message
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', participantId)
            .maybeSingle()
          
          const username = profile?.username || participantId
          return res.status(403).json({ error: `${username} is not your friend. Please add them as a friend first.` })
        }
      }

      // Add participants
      const newParticipants = participant_ids.map((id: string) => ({
        conversation_id,
        user_id: id
      }))

      const { error: participantsError } = await supabase
        .from('conversation_participants')
        .insert(newParticipants)

      if (participantsError) {
        console.error('Error adding participants:', participantsError)
        return res.status(500).json({ error: participantsError.message })
      }

      return res.status(200).json({ success: true })
    }

    // SEND MESSAGE
    if (req.method === 'POST') {
      const { conversation_id, receiver_id, content } = req.body

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'content is required and cannot be empty' })
      }

      // Support both conversation-based (new) and user-based (legacy) messaging
      if (conversation_id && typeof conversation_id === 'string') {
        // Verify user is part of the conversation
        const { data: userParticipant } = await supabase
          .from('conversation_participants')
          .select('*')
          .eq('conversation_id', conversation_id)
          .eq('user_id', finalUserId)
          .single()

        if (!userParticipant) {
          return res.status(403).json({ error: 'You are not part of this conversation' })
        }

        // Get conversation details to check if it's a group chat
        const { data: conversation } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', conversation_id)
          .single()

        // Get all participants to determine if it's a group chat
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversation_id)

        const isGroupChat = (participants?.length || 0) > 2 || conversation?.name

        // For group chats, create a single message with receiver_id set to first other participant (workaround for NOT NULL and CHECK constraints)
        // For direct messages (2 participants), set receiver_id to the other participant
        let messageToInsert: any = {
          sender_id: finalUserId,
          conversation_id: conversation_id,
          content: content.trim()
        }

        if (isGroupChat) {
          // For group chats, set receiver_id to the first other participant (workaround for constraints)
          // We'll identify group messages by checking conversation_id and conversation type, not receiver_id
          const otherParticipants = participants?.filter((p: any) => p.user_id !== finalUserId) || []
          if (otherParticipants.length > 0) {
            messageToInsert.receiver_id = otherParticipants[0].user_id
          } else {
            // This shouldn't happen, but fallback to avoid constraint violation
            // If somehow no other participants, we can't create the message
            return res.status(400).json({ error: 'Group chat must have at least one other participant' })
          }
        } else if (participants && participants.length === 2) {
          // For direct messages, set receiver_id to the other participant
          const otherParticipant = participants.find((p: any) => p.user_id !== finalUserId)
          if (otherParticipant) {
            messageToInsert.receiver_id = otherParticipant.user_id
          } else {
            // This shouldn't happen for direct messages
            return res.status(400).json({ error: 'Direct message must have another participant' })
          }
        } else {
          // This shouldn't happen
          return res.status(400).json({ error: 'Invalid conversation configuration' })
        }

        const { data, error } = await supabase
          .from('messages')
          .insert([messageToInsert])
          .select()

        if (error) {
          console.error('Error creating message:', error)
          // Try with service role client if RLS fails
          if (error.code === '42501') {
            const serviceClient = getServiceRoleClient()
            if (serviceClient) {
              const { data: serviceData, error: serviceError } = await serviceClient
                .from('messages')
                .insert([messageToInsert])
                .select()
              
              if (serviceError) {
                return res.status(500).json({ error: serviceError.message })
              }
              return res.status(201).json(serviceData?.[0] || serviceData)
            }
          }
          return res.status(500).json({ error: error.message })
        }

        return res.status(201).json(data?.[0] || data)
      } else if (receiver_id && typeof receiver_id === 'string') {
        // Legacy: Direct message
        if (receiver_id === finalUserId) {
          return res.status(400).json({ error: 'Cannot send message to yourself' })
        }

        // Verify users are friends
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
      } else {
        return res.status(400).json({ error: 'conversation_id or receiver_id is required' })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('Error in messages API:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

