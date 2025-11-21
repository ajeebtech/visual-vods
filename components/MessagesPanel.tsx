import { useState, useEffect, useRef } from 'react'
import { motion, PanInfo } from 'framer-motion'
import { ArrowLeft, Send, Image as ImageIcon, Smile, X } from 'lucide-react'
import { useSession } from '@clerk/nextjs'
import { User } from 'lucide-react'
import { useSupabase } from '@/lib/supabase-client'

interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  read_at: string | null
}

interface Conversation {
  userId: string
  username: string
  avatar_url: string | null
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
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
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
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

  // Fetch messages for selected friend
  const fetchMessages = async (friendId: string) => {
    if (!clerkSession) return

    setIsLoading(true)
    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) return

      const response = await fetch(`/api/messages?action=messages&otherUserId=${friendId}`, {
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
    if (!selectedFriend || !messageInput.trim() || !clerkSession || isSending) return

    const content = messageInput.trim()
    const tempId = `temp-${Date.now()}`
    const currentUserId = clerkSession.user?.id || ''

    // Optimistically add message to UI
    const optimisticMessage: Message = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: selectedFriend,
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

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receiver_id: selectedFriend,
          content
        })
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
    if (!selectedFriend || !clerkSession || !supabase) return

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    // Subscribe to new messages in real-time
    const channel = supabase
      .channel(`messages:${selectedFriend}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${selectedFriend}`
        },
        (payload) => {
          const newMessage = payload.new as Message
          if (newMessage.receiver_id === (clerkSession.user?.id || '')) {
            setMessages(prev => [...prev, newMessage])
            fetchConversations()
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    // Initial fetch
    fetchMessages(selectedFriend)

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [selectedFriend, clerkSession, supabase])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedFriendData = selectedFriend
    ? friends.find(f => f.friend.id === selectedFriend)?.friend
    : null

  // Combine friends and conversations (show all friends, mark those with conversations)
  const friendsWithConversations = friends.map(friend => {
    const conversation = conversations.find(c => c.userId === friend.friend.id)
    return {
      ...friend,
      lastMessage: conversation?.lastMessage,
      lastMessageTime: conversation?.lastMessageTime,
      unreadCount: conversation?.unreadCount || 0
    }
  })

  // Sort by last message time or alphabetically
  friendsWithConversations.sort((a, b) => {
    if (a.lastMessageTime && b.lastMessageTime) {
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    }
    if (a.lastMessageTime) return -1
    if (b.lastMessageTime) return 1
    return a.friend.username.localeCompare(b.friend.username)
  })

  if (selectedFriend && selectedFriendData) {
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
            onClick={() => setSelectedFriend(null)}
            className="text-gray-500 hover:text-gray-900 transition-all duration-200 hover:scale-110"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {selectedFriendData.avatar_url ? (
              <img
                src={selectedFriendData.avatar_url}
                alt={selectedFriendData.username}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-gray-100"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                <User className="w-5 h-5 text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-gray-900 font-medium text-sm truncate">{selectedFriendData.username}</p>
              <p className="text-gray-400 text-xs truncate">@{selectedFriendData.username}</p>
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
          <button className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110">
            <Send className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Friends List */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {isLoading && friendsWithConversations.length === 0 ? (
          <div className="flex justify-center items-center h-full">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
          </div>
        ) : friendsWithConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-sm">No friends to message</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {friendsWithConversations.map((friend) => (
              <button
                key={friend.id}
                onClick={() => setSelectedFriend(friend.friend.id)}
                className="w-full px-5 py-4 hover:bg-white transition-all duration-200 flex items-center gap-3 group"
              >
                {friend.friend.avatar_url ? (
                  <img
                    src={friend.friend.avatar_url}
                    alt={friend.friend.username}
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-gray-100 group-hover:ring-gray-200 transition-all duration-200"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-all duration-200">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-gray-900 font-medium text-sm truncate">{friend.friend.username}</p>
                  {friend.lastMessage && (
                    <p className="text-gray-400 text-xs truncate mt-0.5">{friend.lastMessage}</p>
                  )}
                </div>
                {friend.unreadCount > 0 && (
                  <div className="bg-gray-900 text-white text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center">
                    {friend.unreadCount > 9 ? '9+' : friend.unreadCount}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

