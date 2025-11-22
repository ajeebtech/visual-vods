import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, User, Check, Send } from 'lucide-react'
import { useSession } from '@clerk/nextjs'

interface ShareSessionModalProps {
  isOpen: boolean
  onClose: () => void
  session: { id: string, title: string } | null
  friends: Array<{
    id: string
    friend: { id: string, username: string, avatar_url: string | null }
  }>
}

interface Conversation {
  conversationId?: string
  type?: 'direct' | 'group'
  name: string
  avatar_url: string | null
  participantCount?: number
}

export default function ShareSessionModal({ isOpen, onClose, session, friends }: ShareSessionModalProps) {
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())
  const [selectedType, setSelectedType] = useState<'friend' | 'conversation'>('friend')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const { session: clerkSession } = useSession()

  // Fetch conversations when modal opens
  useEffect(() => {
    if (isOpen && clerkSession) {
      fetchConversations()
    }
  }, [isOpen, clerkSession])

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
        const groupChats = (data.conversations || []).filter((c: Conversation) => c.type === 'group')
        setConversations(groupChats)
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleRecipient = (id: string) => {
    setSelectedRecipients(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleShare = async () => {
    if (!session || selectedRecipients.size === 0 || !clerkSession) return

    setIsSending(true)
    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) return

      const shareUrl = `${window.location.origin}/?sessionId=${session.id}`
      const shareText = `Check out this session: ${session.title || 'Untitled Session'}\n${shareUrl}`

      // Send to all selected recipients
      const sendPromises = Array.from(selectedRecipients).map(async (recipientId) => {
        const isGroupChat = conversations.some(c => c.conversationId === recipientId)
        
        const requestBody: any = {
          content: shareText
        }

        if (isGroupChat) {
          requestBody.conversation_id = recipientId
        } else {
          requestBody.receiver_id = recipientId
        }

        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to send message')
        }

        return response.json()
      })

      await Promise.all(sendPromises)
      
      // Reset and close
      setSelectedRecipients(new Set())
      onClose()
      alert(`Session shared with ${selectedRecipients.size} recipient(s)!`)
    } catch (error) {
      console.error('Error sharing session:', error)
      alert(`Error sharing session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen || !session) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Share Session</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Session Info */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <p className="text-sm text-gray-600">Sharing:</p>
            <p className="text-base font-medium text-gray-900 mt-1">{session.title || 'Untitled Session'}</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => {
                setSelectedType('friend')
                setSelectedRecipients(new Set())
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                selectedType === 'friend'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <User className="w-4 h-4" />
                Friends ({friends.length})
              </div>
            </button>
            <button
              onClick={() => {
                setSelectedType('conversation')
                setSelectedRecipients(new Set())
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                selectedType === 'conversation'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-4 h-4" />
                Group Chats ({conversations.length})
              </div>
            </button>
          </div>

          {/* Recipients List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {selectedType === 'friend' ? (
              isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
              ) : friends.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No friends to share with</p>
              ) : (
                friends.map((friend) => {
                  const isSelected = selectedRecipients.has(friend.friend.id)
                  return (
                    <motion.button
                      key={friend.friend.id}
                      onClick={() => toggleRecipient(friend.friend.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                        isSelected
                          ? 'bg-indigo-50 border-2 border-indigo-600'
                          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <div className="relative">
                        {friend.friend.avatar_url ? (
                          <img
                            src={friend.friend.avatar_url}
                            alt={friend.friend.username}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <User className="w-6 h-6 text-gray-600" />
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900">{friend.friend.username}</p>
                      </div>
                    </motion.button>
                  )
                })
              )
            ) : (
              isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No group chats to share with</p>
              ) : (
                conversations.map((conversation) => {
                  const isSelected = selectedRecipients.has(conversation.conversationId || '')
                  return (
                    <motion.button
                      key={conversation.conversationId}
                      onClick={() => toggleRecipient(conversation.conversationId || '')}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                        isSelected
                          ? 'bg-indigo-50 border-2 border-indigo-600'
                          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <div className="relative">
                        {conversation.avatar_url ? (
                          <img
                            src={conversation.avatar_url}
                            alt={conversation.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-indigo-600" />
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900">{conversation.name}</p>
                        {conversation.participantCount && (
                          <p className="text-xs text-gray-500">{conversation.participantCount} members</p>
                        )}
                      </div>
                    </motion.button>
                  )
                })
              )
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {selectedRecipients.size > 0
                ? `${selectedRecipients.size} recipient${selectedRecipients.size > 1 ? 's' : ''} selected`
                : 'Select recipients to share'}
            </p>
            <motion.button
              onClick={handleShare}
              disabled={selectedRecipients.size === 0 || isSending}
              whileHover={{ scale: selectedRecipients.size > 0 ? 1.05 : 1 }}
              whileTap={{ scale: selectedRecipients.size > 0 ? 0.95 : 1 }}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                selectedRecipients.size > 0 && !isSending
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Share
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

