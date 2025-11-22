import { useState, useEffect, useRef } from 'react'
import { motion, PanInfo } from 'framer-motion'
import { ArrowLeft, Send, Image as ImageIcon, Smile, X, Users, Plus, ExternalLink } from 'lucide-react'
import { useSession, useUser, SignInButton } from '@clerk/nextjs'
import { User } from 'lucide-react'
import { useSupabase } from '@/lib/supabase-client'
import { useRouter } from 'next/router'
import CreateGroupChatModal from './CreateGroupChatModal'
import { getCached, setCached, getCacheKey, invalidateCache } from '@/lib/local-cache'

interface Message {
  id: string
  sender_id: string
  receiver_id: string
  conversation_id?: string | null
  content: string
  created_at: string
  read_at: string | null
}

interface CachedMessages {
  messages: Message[]
  readReceipts: Record<string, string>
  timestamp: number
  conversationId?: string
  friendId?: string
}

interface Conversation {
  conversationId?: string
  userId?: string // Legacy support
  type?: 'direct' | 'group'
  name: string
  username?: string // Legacy support
  avatar_url: string | null
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  participantCount?: number
}

interface MessagesPanelProps {
  friends: Array<{
    id: string
    friend: { id: string, username: string, avatar_url: string | null }
  }>
  onClose: () => void
  sessionToShare?: { id: string, title: string } | null
}

export default function MessagesPanel({ friends, onClose, sessionToShare }: MessagesPanelProps) {
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [readReceipts, setReadReceipts] = useState<Record<string, string>>({}) // userId -> last_read_at
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const { session: clerkSession } = useSession()
  const { user, isLoaded: isUserLoaded } = useUser()
  const { supabase } = useSupabase()
  const router = useRouter()
  const channelRef = useRef<any>(null)
  const conversationsRef = useRef<Conversation[]>([])

  // Parse session links from message content
  const parseSessionLink = (content: string): { sessionId: string | null, restOfContent: string } => {
    // Match URLs with sessionId parameter
    const sessionIdMatch = content.match(/[?&]sessionId=([a-zA-Z0-9-]+)/)
    if (sessionIdMatch) {
      return {
        sessionId: sessionIdMatch[1],
        restOfContent: content.replace(/https?:\/\/[^\s]+/g, '').trim() // Remove the full URL
      }
    }
    return { sessionId: null, restOfContent: content }
  }

  // Handle clicking on session link
  const handleSessionLinkClick = (sessionId: string) => {
    // Navigate to the session in the same tab
    router.push(`/?sessionId=${sessionId}`)
    // Close the messages panel
    onClose()
  }

  // Local cache helpers for messages (last 50 messages)
  const getMessagesCacheKey = (conversationId?: string, friendId?: string) => {
    if (conversationId) {
      return getCacheKey('messages', 'conv', conversationId)
    } else if (friendId) {
      return getCacheKey('messages', 'friend', friendId)
    }
    return getCacheKey('messages', 'unknown')
  }
  
  const getCachedMessages = (conversationId?: string, friendId?: string): { messages: Message[], readReceipts: Record<string, string> } => {
    const key = getMessagesCacheKey(conversationId, friendId)
    const cached = getCached<CachedMessages>(key)
      if (cached) {
          return {
        messages: cached.messages || [],
        readReceipts: cached.readReceipts || {}
          }
    }
    return { messages: [], readReceipts: {} }
  }
  
  const saveCachedMessages = (messages: Message[], readReceipts: Record<string, string>, conversationId?: string, friendId?: string) => {
    const key = getMessagesCacheKey(conversationId, friendId)
      const cacheData: CachedMessages = {
        messages: messages.slice(-50), // Only cache last 50 messages
        readReceipts,
        timestamp: Date.now(),
        conversationId,
        friendId
      }
    setCached(key, cacheData, 3600) // 1 hour
  }

  useEffect(() => {
    console.log('MessagesPanel rendered', { friendsCount: friends.length })
  }, [friends])

  // Fetch conversations (with optional loading state control)
  const fetchConversations = async (showLoading = false) => {
    if (!clerkSession) return

    const currentUserId = clerkSession.user?.id || ''
    const cacheKey = getCacheKey('conversations', currentUserId)

    // Try cache first
    const cached = getCached<{ conversations: Conversation[] }>(cacheKey)
    if (cached) {
      setConversations(cached.conversations || [])
      conversationsRef.current = cached.conversations || []
      return
    }

    if (showLoading) {
      setIsLoading(true)
    }
    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) return

      const response = await fetch('/api/messages?action=conversations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const convs = data.conversations || []
        // Cache the result
        setCached(cacheKey, data, 120) // 2 minutes
        setConversations(convs)
        conversationsRef.current = convs // Update ref
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
    }
  }

  // Update a single conversation in the list (optimistic update)
  const updateConversationInList = (conversationId: string, updates: Partial<Conversation>) => {
    setConversations(prev => prev.map(conv => {
      if (conv.conversationId === conversationId) {
        return { ...conv, ...updates }
      }
      return conv
    }))
    // Also update ref
    conversationsRef.current = conversationsRef.current.map(conv => {
      if (conv.conversationId === conversationId) {
        return { ...conv, ...updates }
      }
      return conv
    })
  }

  // Fetch messages for selected conversation or friend
  const fetchMessages = async (conversationId?: string, friendId?: string, useCache = true) => {
    if (!clerkSession) return

    const currentUserId = clerkSession.user?.id || ''

    // Load from cache first for instant display
    let hasCachedMessages = false
    if (useCache) {
      const cached = getCachedMessages(conversationId, friendId)
      if (cached.messages.length > 0) {
        // Apply same filtering to cached messages
        let filteredCachedMessages = cached.messages
        if (conversationId) {
          filteredCachedMessages = cached.messages.filter((msg: Message) => 
            msg.conversation_id === conversationId
          )
        } else if (friendId) {
          filteredCachedMessages = cached.messages.filter((msg: Message) => {
            const isBetweenUsers = 
              (msg.sender_id === currentUserId && msg.receiver_id === friendId) ||
              (msg.sender_id === friendId && msg.receiver_id === currentUserId)
            if (!isBetweenUsers) return false
            if (msg.conversation_id) {
              const isGroupChat = conversationsRef.current.find(
                c => c.conversationId === msg.conversation_id && c.type === 'group'
              )
              return !isGroupChat
            }
            return true
          })
        }
        if (filteredCachedMessages.length > 0) {
          hasCachedMessages = true
          setMessages(filteredCachedMessages)
          setReadReceipts(cached.readReceipts)
          // Scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }, 50)
        }
      }
    }

    // Only show loading if we don't have cached messages
    if (!hasCachedMessages) {
      setIsLoading(true)
    }
    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) return

      let url = '/api/messages?action=messages'
      if (conversationId) {
        url += `&conversationId=${conversationId}`
      } else if (friendId) {
        url += `&otherUserId=${friendId}`
      } else {
        return
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        let fetchedMessages = data.messages || []
        const fetchedReadReceipts = data.readReceipts || {}
        
        // Additional client-side filtering to prevent cross-contamination
        if (conversationId) {
          // For conversations, ensure all messages belong to this conversation
          fetchedMessages = fetchedMessages.filter((msg: Message) => 
            msg.conversation_id === conversationId
          )
        } else if (friendId) {
          // For direct messages, ensure:
          // 1. Message is between current user and friend
          // 2. Not a group chat message
          fetchedMessages = fetchedMessages.filter((msg: Message) => {
            // Must be between current user and friend
            const isBetweenUsers = 
              (msg.sender_id === currentUserId && msg.receiver_id === friendId) ||
              (msg.sender_id === friendId && msg.receiver_id === currentUserId)
            
            if (!isBetweenUsers) return false
            
            // If message has conversation_id, check it's not a group chat
            if (msg.conversation_id) {
              const isGroupChat = conversationsRef.current.find(
                c => c.conversationId === msg.conversation_id && c.type === 'group'
              )
              return !isGroupChat
            }
            
            // Legacy direct message (no conversation_id) is fine
            return true
          })
        }
        
        // Only update if messages actually changed (prevent unnecessary re-renders)
        setMessages(prev => {
          // Check if messages are actually different
          if (prev.length === fetchedMessages.length && 
              prev.every((msg, idx) => msg.id === fetchedMessages[idx]?.id)) {
            return prev // No change, return previous to prevent re-render
          }
          return fetchedMessages
        })
        setReadReceipts(fetchedReadReceipts)
        
        // Save to cache
        saveCachedMessages(fetchedMessages, fetchedReadReceipts, conversationId, friendId)
        
        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Send message
  const sendMessage = async () => {
    if ((!selectedFriend && !selectedConversation) || !messageInput.trim() || !clerkSession || isSending) return

    const content = messageInput.trim()
    const tempId = `temp-${Date.now()}`
    const currentUserId = clerkSession.user?.id || ''

    // Optimistically add message to UI
    const optimisticMessage: Message = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: selectedFriend || '',
      conversation_id: selectedConversation?.conversationId || null,
      content,
      created_at: new Date().toISOString(),
      read_at: null
    }
    setMessages(prev => [...prev, optimisticMessage])
    setMessageInput('')
    setIsSending(true)

    // Scroll to bottom
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)

    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== tempId))
        setMessageInput(content)
        return
      }

      const requestBody: any = {
        content
      }

      if (selectedConversation?.conversationId) {
        requestBody.conversation_id = selectedConversation.conversationId
      } else if (selectedFriend) {
        requestBody.receiver_id = selectedFriend
      } else {
        return
      }

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      })

      if (response.ok) {
        const newMessage = await response.json()
        // Replace optimistic message with real one
        setMessages(prev => prev.map(m => m.id === tempId ? newMessage : m))
        // Invalidate cache for this conversation
        if (selectedConversation?.conversationId) {
          invalidateCache(getCacheKey('messages', 'conv', selectedConversation.conversationId) + '*')
        } else if (selectedFriend) {
          invalidateCache(getCacheKey('messages', 'friend', selectedFriend) + '*')
        }
        invalidateCache(getCacheKey('conversations', currentUserId) + '*')
        // Update conversation list optimistically without full reload
        if (selectedConversation?.conversationId) {
          updateConversationInList(selectedConversation.conversationId, {
            lastMessage: newMessage.content,
            lastMessageTime: newMessage.created_at
          })
        }
        // Only fetch conversations in background (no loading state)
        fetchConversations(false)
      } else {
        const error = await response.json()
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== tempId))
        alert(error.error || 'Failed to send message')
        setMessageInput(content) // Restore message on error
      }
    } catch (error) {
      console.error('Error sending message:', error)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      alert('Failed to send message')
      setMessageInput(content) // Restore message on error
    } finally {
      setIsSending(false)
    }
  }

  // Load conversations on mount (with loading state)
  useEffect(() => {
    fetchConversations(true)
  }, [clerkSession])

  // Set up realtime subscription for messages
  useEffect(() => {
    if ((!selectedFriend && !selectedConversation) || !clerkSession || !supabase) return

    // Clean up previous subscriptions
    if (channelRef.current) {
      if (typeof channelRef.current === 'object' && 'messageChannel' in channelRef.current) {
        supabase.removeChannel(channelRef.current.messageChannel)
        if (channelRef.current.readReceiptChannel) {
          supabase.removeChannel(channelRef.current.readReceiptChannel)
        }
      } else {
        // Legacy: single channel
        supabase.removeChannel(channelRef.current as any)
      }
    }

    const currentUserId = clerkSession.user?.id || ''
    const conversationId = selectedConversation?.conversationId
    const friendId = selectedFriend

    // Subscribe to new messages in real-time
    // For direct messages, we need to filter by both sender and receiver to avoid group chat messages
    let filter = ''
    if (conversationId) {
      // For conversations, filter by conversation_id only
      filter = `conversation_id=eq.${conversationId}`
    } else if (friendId) {
      // For direct messages, filter by receiver_id to ensure it's a direct message to current user
      // This prevents group chat messages from appearing
      filter = `receiver_id=eq.${currentUserId}`
    }

    if (!filter) return

    const channel = supabase
      .channel(`messages:${conversationId || friendId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: filter
        },
        (payload) => {
          const newMessage = payload.new as Message
          // Only add if it's for the current user or conversation
          if (conversationId) {
            // For conversations, verify it matches the conversation_id
            if (newMessage.conversation_id === conversationId) {
              setMessages(prev => {
                const updated = [...prev, newMessage]
                // Update cache with new message
                saveCachedMessages(updated, readReceipts, conversationId, undefined)
                return updated
              })
              // Update conversation list optimistically
              updateConversationInList(conversationId, {
                lastMessage: newMessage.content,
                lastMessageTime: newMessage.created_at
              })
            }
          } else if (friendId && newMessage.receiver_id === currentUserId) {
            // For direct messages, we filtered by receiver_id, but still need to verify:
            // 1. The sender is the friend we're chatting with
            // 2. It's not a group chat message
            if (newMessage.sender_id === friendId) {
              // Check if this message has a conversation_id that's a group chat
              if (newMessage.conversation_id) {
                const isGroupChat = conversationsRef.current.find(
                  c => c.conversationId === newMessage.conversation_id && c.type === 'group'
                )
                // Only add if it's not a group chat
                if (!isGroupChat) {
                  setMessages(prev => {
                    const updated = [...prev, newMessage]
                    // Update cache
                    saveCachedMessages(updated, readReceipts, newMessage.conversation_id || undefined, friendId)
                    return updated
                  })
                  // Update conversation list optimistically if it's a direct message conversation
                  if (newMessage.conversation_id) {
                    updateConversationInList(newMessage.conversation_id, {
                      lastMessage: newMessage.content,
                      lastMessageTime: newMessage.created_at
                    })
                  }
                }
              } else {
                // Message has no conversation_id, it's a legacy direct message - add it
                setMessages(prev => {
                  const updated = [...prev, newMessage]
                  // Update cache
                  saveCachedMessages(updated, readReceipts, undefined, friendId)
                  return updated
                })
              }
            }
          }
        }
      )
      .subscribe()
    
    // Subscribe to read receipt updates (conversation_participants changes)
    // Only subscribe if we have a conversationId (not for legacy direct messages)
    if (conversationId) {
      const readReceiptChannel = supabase
        .channel(`read_receipts:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'conversation_participants',
            filter: `conversation_id=eq.${conversationId}`
          },
          (payload) => {
            const updated = payload.new as any
            if (updated && updated.last_read_at) {
              setReadReceipts(prev => {
                // Only update if the value actually changed
                if (prev[updated.user_id] === updated.last_read_at) {
                  return prev // No change, prevent re-render
                }
                const newReceipts = {
                  ...prev,
                  [updated.user_id]: updated.last_read_at
                }
                // Update cache asynchronously to avoid blocking render
                setTimeout(() => {
                  setMessages(currentMessages => {
                    saveCachedMessages(currentMessages, newReceipts, conversationId, undefined)
                    return currentMessages
                  })
                }, 0)
                return newReceipts
              })
            }
          }
        )
        .subscribe()
      
      // Store read receipt channel for cleanup
      channelRef.current = { messageChannel: channel, readReceiptChannel }
    } else {
      channelRef.current = { messageChannel: channel }
    }

    // Don't fetch here - handleSelectConversation/handleSelectFriend already calls fetchMessages
    // This effect is only for setting up realtime subscriptions

    return () => {
      if (channelRef.current) {
        if (typeof channelRef.current === 'object' && 'messageChannel' in channelRef.current) {
          supabase.removeChannel(channelRef.current.messageChannel)
          if (channelRef.current.readReceiptChannel) {
            supabase.removeChannel(channelRef.current.readReceiptChannel)
          }
        } else {
          // Legacy: single channel
          supabase.removeChannel(channelRef.current as any)
        }
        channelRef.current = null
      }
    }
  }, [selectedFriend, selectedConversation, clerkSession, supabase])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedFriendData = selectedFriend
    ? friends.find(f => f.friend.id === selectedFriend)?.friend
    : null

  // Handle conversation/friend selection
  const handleSelectConversation = (conversation: Conversation) => {
    setMessages([]) // Clear messages immediately when switching to prevent cross-contamination
    setSelectedFriend(null)
    setSelectedConversation(conversation)
    if (conversation.conversationId) {
      fetchMessages(conversation.conversationId)
    } else if (conversation.userId) {
      // Legacy: direct message
      setSelectedFriend(conversation.userId)
      fetchMessages(undefined, conversation.userId)
    }
  }

  const handleSelectFriend = (friendId: string) => {
    setMessages([]) // Clear messages immediately when switching to prevent cross-contamination
    setSelectedConversation(null)
    setSelectedFriend(friendId)
    fetchMessages(undefined, friendId)
  }

  // Combine group chats and direct message conversations
  const allConversations: Array<{
    id: string
    type: 'direct' | 'group'
    name: string
    avatar_url: string | null
    lastMessage: string
    lastMessageTime: string
    unreadCount: number
    conversationId?: string
    userId?: string
    participantCount?: number
  }> = []

  // Add group chats
  conversations
    .filter(c => c.type === 'group')
    .forEach(conv => {
      allConversations.push({
        id: conv.conversationId || '',
        type: 'group',
        name: conv.name,
        avatar_url: conv.avatar_url,
        lastMessage: conv.lastMessage,
        lastMessageTime: conv.lastMessageTime,
        unreadCount: conv.unreadCount,
        conversationId: conv.conversationId,
        participantCount: conv.participantCount
      })
    })

  // Add direct message conversations (from friends)
  friends.forEach(friend => {
    const conversation = conversations.find(c => c.userId === friend.friend.id)
    allConversations.push({
      id: friend.friend.id,
      type: 'direct',
      name: friend.friend.username,
      avatar_url: friend.friend.avatar_url,
      lastMessage: conversation?.lastMessage || '',
      lastMessageTime: conversation?.lastMessageTime || '',
      unreadCount: conversation?.unreadCount || 0,
      userId: friend.friend.id
    })
  })

  // Sort by last message time
  allConversations.sort((a, b) => {
    if (a.lastMessageTime && b.lastMessageTime) {
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    }
    if (a.lastMessageTime) return -1
    if (b.lastMessageTime) return 1
    return a.name.localeCompare(b.name)
  })

  // Show conversation view (group chat or direct message)
  if ((selectedFriend && selectedFriendData) || selectedConversation) {
    const displayName = selectedConversation?.name || selectedFriendData?.username || 'Unknown'
    const displayAvatar = selectedConversation?.avatar_url || selectedFriendData?.avatar_url || null
    const isGroup = selectedConversation?.type === 'group'
    
    return (
      <motion.div
        initial={{ x: 450, y: 650, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        exit={{ x: 450, y: 650, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag
        dragConstraints={{ left: 0, top: 0, right: 200, bottom: 200 }}
        dragElastic={0.1}
        onDragEnd={(event, info) => {
          if (info.offset.x > 150 || info.offset.y > 150) {
            onClose()
          }
        }}
        className="fixed w-96 h-[600px] bg-white rounded-3xl shadow-xl z-[9999] flex flex-col border border-gray-200 cursor-grab active:cursor-grabbing"
        style={{ bottom: '24px', right: '40px' }}
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 rounded-t-3xl">
          <button
            onClick={() => {
              setSelectedFriend(null)
              setSelectedConversation(null)
            }}
            className="text-gray-500 hover:text-gray-900 transition-all duration-200 hover:scale-110"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt={displayName}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-gray-100"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                {isGroup ? (
                  <Users className="w-5 h-5 text-gray-400" />
                ) : (
                  <User className="w-5 h-5 text-gray-400" />
                )}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-gray-900 font-medium text-sm truncate">{displayName}</p>
              {isGroup && selectedConversation?.participantCount ? (
                <p className="text-gray-400 text-xs truncate">{selectedConversation.participantCount} members</p>
              ) : selectedFriendData ? (
                <p className="text-gray-400 text-xs truncate">@{selectedFriendData.username}</p>
              ) : null}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto bg-gray-50/50 px-5 py-5 space-y-2.5"
        >
          {isLoading && messages.length === 0 ? (
            <div className="flex justify-center items-center h-full">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {messages.map((message) => {
                const isSent = message.sender_id === (clerkSession?.user?.id || '')
                const currentUserId = clerkSession?.user?.id || ''
                
                // Check if message has been seen (read receipt)
                let isSeen = false
                if (isSent && selectedConversation) {
                  // For sent messages, check if other participants have read it
                  const otherParticipants = Object.keys(readReceipts).filter(id => id !== currentUserId)
                  if (otherParticipants.length > 0) {
                    // Check if any other participant's last_read_at is after this message
                    const messageTime = new Date(message.created_at).getTime()
                    isSeen = otherParticipants.some(participantId => {
                      const lastRead = readReceipts[participantId]
                      return lastRead && new Date(lastRead).getTime() >= messageTime
                    })
                  }
                } else if (isSent && selectedFriend) {
                  // For direct messages, check if the friend has read it
                  const friendLastRead = readReceipts[selectedFriend]
                  if (friendLastRead) {
                    const messageTime = new Date(message.created_at).getTime()
                    isSeen = new Date(friendLastRead).getTime() >= messageTime
                  }
                }
                
                return (
                  <div
                    key={message.id}
                    className={`flex ${isSent ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                  >
                    <div
                      className={`max-w-[75%] rounded-3xl px-4 py-2.5 transition-all duration-200 ${isSent
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'bg-white text-gray-900 border border-gray-100 shadow-sm'
                        }`}
                    >
                      {(() => {
                        const { sessionId, restOfContent } = parseSessionLink(message.content)
                        return (
                          <>
                            {restOfContent && (
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed mb-2">
                                {restOfContent}
                              </p>
                            )}
                            {sessionId && (
                              <motion.button
                                onClick={() => handleSessionLinkClick(sessionId)}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                                  isSent
                                    ? 'bg-white/10 hover:bg-white/20 text-white'
                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                                }`}
                              >
                                <ExternalLink className="w-4 h-4" />
                                <span className="text-sm font-medium">Open Session</span>
                              </motion.button>
                            )}
                            {!sessionId && (
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                {message.content}
                              </p>
                            )}
                          </>
                        )
                      })()}
                      <div className={`flex items-center gap-1.5 mt-1.5 ${isSent ? 'justify-end' : 'justify-start'}`}>
                        <p className={`text-xs ${isSent ? 'text-gray-400' : 'text-gray-400'}`}>
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        {isSent && isSeen && (
                          <span className="text-xs text-blue-400 font-medium">Seen</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-100 px-4 py-4 rounded-b-3xl">
          <div className="flex items-center gap-2.5">
            <button className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110">
              <Smile className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Type a message..."
              className="flex-1 bg-gray-50 text-gray-900 placeholder-gray-400 px-4 py-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all duration-200"
            />
            <button
              onClick={sendMessage}
              disabled={!messageInput.trim() || isSending}
              className="text-gray-900 hover:text-gray-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-all duration-200 hover:scale-110"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ x: 450, y: 650, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      exit={{ x: 450, y: 650, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      drag
      dragConstraints={{ left: 0, top: 0, right: 200, bottom: 200 }}
      dragElastic={0.1}
      onDragEnd={(event, info) => {
        if (info.offset.x > 150 || info.offset.y > 150) {
          onClose()
        }
      }}
      className="fixed w-96 h-[600px] bg-white rounded-3xl shadow-xl z-[9999] flex flex-col border border-gray-200 cursor-grab active:cursor-grabbing"
      style={{ bottom: '24px', right: '40px' }}
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
        <h2 className="text-gray-900 font-medium text-lg">Messages</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateGroup(true)}
            className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110"
            title="Create Group Chat"
          >
            <Users className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {isLoading && allConversations.length === 0 ? (
          <div className="flex justify-center items-center h-full">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
          </div>
        ) : allConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            {isUserLoaded && !user ? (
              // Not logged in - show sign up button
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium text-base mb-1">Start messaging</p>
                  <p className="text-gray-500 text-sm mb-4">Sign in to start conversations with friends</p>
                </div>
                <SignInButton mode="modal">
                  <button className="px-6 py-2.5 bg-[#9146FF] hover:bg-[#772CE8] text-white rounded-lg font-medium transition-colors">
                    Sign In
                  </button>
                </SignInButton>
              </div>
            ) : (
              // Logged in but no conversations - show make friends message
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium text-base mb-1">No conversations yet</p>
                  <p className="text-gray-500 text-sm mb-4">Add friends to start messaging</p>
                </div>
            <button
              onClick={() => setShowCreateGroup(true)}
                  className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors"
            >
              Create a group chat
            </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {allConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => {
                  if (conv.type === 'group' && conv.conversationId) {
                    handleSelectConversation(conv as Conversation)
                  } else if (conv.type === 'direct' && conv.userId) {
                    handleSelectFriend(conv.userId)
                  }
                }}
                className="w-full px-5 py-4 hover:bg-white transition-all duration-200 flex items-center gap-3 group"
              >
                {conv.avatar_url ? (
                  <img
                    src={conv.avatar_url}
                    alt={conv.name}
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-gray-100 group-hover:ring-gray-200 transition-all duration-200"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-all duration-200">
                    {conv.type === 'group' ? (
                      <Users className="w-5 h-5 text-gray-400" />
                    ) : (
                      <User className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                )}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-gray-900 font-medium text-sm truncate">{conv.name}</p>
                    {conv.type === 'group' && conv.participantCount && (
                      <span className="text-xs text-gray-400">({conv.participantCount})</span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="text-gray-400 text-xs truncate mt-0.5">{conv.lastMessage}</p>
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <div className="bg-gray-900 text-white text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Group Chat Modal */}
      <CreateGroupChatModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        friends={friends}
        onSuccess={() => {
          fetchConversations(false) // Refresh list without showing loading
        }}
      />
    </motion.div>
  )
}

