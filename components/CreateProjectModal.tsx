import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Loader2 } from 'lucide-react'
import { useSession } from '@clerk/nextjs'

interface Session {
  id: string
  title: string
  created_at: string
  matches_data?: any
}

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { session: clerkSession } = useSession()

  // Fetch sessions when modal opens
  useEffect(() => {
    if (isOpen && clerkSession) {
      fetchSessions()
    }
  }, [isOpen, clerkSession])

  const fetchSessions = async () => {
    setIsLoadingSessions(true)
    try {
      const token = await clerkSession?.getToken({ template: 'supabase' })
      if (!token) {
        console.error('No token available')
        return
      }

      const response = await fetch('/api/sessions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSessions(data || [])
      } else {
        console.error('Error fetching sessions:', response.statusText)
      }
    } catch (error) {
      console.error('Error fetching sessions:', error)
    } finally {
      setIsLoadingSessions(false)
    }
  }

  const toggleSession = (sessionId: string) => {
    setSelectedSessions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }

  const handleCreate = async () => {
    if (!projectName.trim()) {
      alert('Please enter a project name')
      return
    }

    if (selectedSessions.size === 0) {
      alert('Please select at least one session')
      return
    }

    setIsCreating(true)
    try {
      const token = await clerkSession?.getToken({ template: 'supabase' })
      if (!token) {
        console.error('No token available')
        return
      }

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          session_ids: Array.from(selectedSessions)
        })
      })

      if (response.ok) {
        // Reset form
        setProjectName('')
        setProjectDescription('')
        setSelectedSessions(new Set())
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        alert(`Error creating project: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Error creating project. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Create New Project</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project Name *
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Project Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional)
              </label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Enter project description..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
              />
            </div>

            {/* Sessions Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Sessions * ({selectedSessions.size} selected)
              </label>
              
              {isLoadingSessions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No sessions available</p>
                  <p className="text-sm mt-1">Create some sessions first</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {sessions.map((session) => {
                    const isSelected = selectedSessions.has(session.id)
                    const matchCount = session.matches_data && Array.isArray(session.matches_data) 
                      ? session.matches_data.length 
                      : 0

                    return (
                      <button
                        key={session.id}
                        onClick={() => toggleSession(session.id)}
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
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {session.title || 'Untitled Session'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                              {new Date(session.created_at).toLocaleDateString()}
                            </p>
                            {matchCount > 0 && (
                              <>
                                <span className="text-gray-300">•</span>
                                <p className="text-xs text-gray-500">
                                  {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                                </p>
                              </>
                            )}
                          </div>
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
              disabled={isCreating || !projectName.trim() || selectedSessions.size === 0}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

