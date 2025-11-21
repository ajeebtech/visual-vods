import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Loader2, Users } from 'lucide-react'
import { useSession } from '@clerk/nextjs'

interface Friend {
  id: string
  friend: {
    id: string
    username: string
    avatar_url: string | null
  }
}

interface CreateGroupChatModalProps {
  isOpen: boolean
  onClose: () => void
  friends: Friend[]
  onSuccess?: () => void
}

export default function CreateGroupChatModal({ isOpen, onClose, friends, onSuccess }: CreateGroupChatModalProps) {
  const [groupName, setGroupName] = useState('')
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const { session: clerkSession } = useSession()

  const toggleFriend = (friendId: string) => {
    setSelectedFriends(prev => {
      const newSet = new Set(prev)
      if (newSet.has(friendId)) {
        newSet.delete(friendId)
      } else {
        newSet.add(friendId)
      }
      return newSet
    })
  }

  const handleCreate = async () => {
    if (!groupName.trim()) {
      alert('Please enter a group name')
      return
    }

    if (selectedFriends.size === 0) {
      alert('Please select at least one friend to add to the group')
      return
    }

    setIsCreating(true)
    try {
      const token = await clerkSession?.getToken({ template: 'supabase' })
      if (!token) {
        console.error('No token available')
        return
      }

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'create_group',
          name: groupName.trim(),
          participant_ids: Array.from(selectedFriends)
        })
      })

      if (response.ok) {
        // Reset form
        setGroupName('')
        setSelectedFriends(new Set())
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        alert(`Error creating group chat: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating group chat:', error)
      alert('Error creating group chat. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">Create Group Chat</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Group Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Name *
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900 placeholder:text-gray-400"
                autoFocus
              />
            </div>

            {/* Friends Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Friends ({selectedFriends.size} selected)
              </label>
              
              {friends.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No friends available</p>
                  <p className="text-sm mt-1">Add friends first to create a group chat</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {friends.map((friend) => {
                    const isSelected = selectedFriends.has(friend.friend.id)

                    return (
                      <button
                        key={friend.id}
                        onClick={() => toggleFriend(friend.friend.id)}
                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                          isSelected ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected 
                            ? 'bg-gray-900 border-gray-900' 
                            : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        {friend.friend.avatar_url ? (
                          <img
                            src={friend.friend.avatar_url}
                            alt={friend.friend.username}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <Users className="w-4 h-4 text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {friend.friend.username}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating || !groupName.trim() || selectedFriends.size === 0}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Group'
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

