import { useState, useEffect, useRef } from 'react'
import { motion, PanInfo } from 'framer-motion'
import { ArrowLeft, Send, Image as ImageIcon, Smile, X, Users, Plus } from 'lucide-react'
import { useSession } from '@clerk/nextjs'
import { User } from 'lucide-react'
import { useSupabase } from '@/lib/supabase-client'
import CreateGroupChatModal from './CreateGroupChatModal'

interface Message {
  id: string
  sender_id: string
  receiver_id: string
  conversation_id?: string | null
  content: string
  created_at: string
  read_at: string | null
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
}

export default function MessagesPanel({ friends, onClose }: MessagesPanelProps) {
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const { session: clerkSession } = useSession()
  const { supabase } = useSupabase()
  const channelRef = useRef<any>(null)

  useEffect(() => {
    console.log('MessagesPanel rendered', { friendsCount: friends.length })
  }, [friends])

  // Fetch conversations
  const fetchConversations = async () => {
    if (!clerkSession) return

    setIsLoading(true)
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
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch messages for selected conversation or friend
  const fetchMessages = async (conversationId?: string, friendId?: string) => {
    if (!clerkSession) return

    setIsLoading(true)
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
        setMessages(data.messages || [])
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
        await fetchConversations()
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

  // Load conversations on mount
  useEffect(() => {
    fetchConversations()
  }, [clerkSession])

  // Set up realtime subscription for messages
  useEffect(() => {
    if ((!selectedFriend && !selectedConversation) || !clerkSession || !supabase) return

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const currentUserId = clerkSession.user?.id || ''
    const conversationId = selectedConversation?.conversationId
    const friendId = selectedFriend

    // Subscribe to new messages in real-time
    let filter = ''
    if (conversationId) {
      filter = `conversation_id=eq.${conversationId}`
    } else if (friendId) {
      filter = `sender_id=eq.${friendId}`
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
            if (newMessage.conversation_id === conversationId) {
              setMessages(prev => [...prev, newMessage])
              fetchConversations()
            }
          } else if (newMessage.receiver_id === currentUserId) {
            setMessages(prev => [...prev, newMessage])
            fetchConversations()
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    // Initial fetch
    if (conversationId) {
      fetchMessages(conversationId)
    } else if (friendId) {
      fetchMessages(undefined, friendId)
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
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
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                      <p className={`text-xs mt-1.5 ${isSent ? 'text-gray-400' : 'text-gray-400'}`}>
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
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
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-sm">No conversations yet</p>
            <button
              onClick={() => setShowCreateGroup(true)}
              className="mt-2 text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Create a group chat
            </button>
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
          fetchConversations()
        }}
      />
    </motion.div>
  )
}

