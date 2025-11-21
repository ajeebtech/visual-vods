import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Loader2, Trash2, Plus } from 'lucide-react'
import { useSession } from '@clerk/nextjs'

interface Session {
  id: string
  title: string
  created_at: string
  matches_data?: any
}

interface Project {
  id: string
  name: string
  description: string | null
  created_at: string
  session_ids?: string[]
}

interface EditProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project | null
  onSuccess?: () => void
}

export default function EditProjectModal({ isOpen, onClose, project, onSuccess }: EditProjectModalProps) {
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [projectSessions, setProjectSessions] = useState<Session[]>([])
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAddSessions, setShowAddSessions] = useState(false)
  const { session: clerkSession } = useSession()

  // Load project data when modal opens
  useEffect(() => {
    if (isOpen && project && clerkSession) {
      setProjectName(project.name)
      setProjectDescription(project.description || '')
      setSelectedSessions(new Set(project.session_ids || []))
      fetchAllSessions()
      fetchProjectSessions()
    }
  }, [isOpen, project, clerkSession])

  const fetchAllSessions = async () => {
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
        setAllSessions(data || [])
      } else {
        console.error('Error fetching sessions:', response.statusText)
      }
    } catch (error) {
      console.error('Error fetching sessions:', error)
    } finally {
      setIsLoadingSessions(false)
    }
  }

  const fetchProjectSessions = async () => {
    if (!project) return

    setIsLoading(true)
    try {
      const token = await clerkSession?.getToken({ template: 'supabase' })
      if (!token) {
        console.error('No token available')
        return
      }

      const response = await fetch(`/api/projects?id=${project.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const projectData = await response.json()
        const sessionIds = projectData.session_ids || []
        setSelectedSessions(new Set(sessionIds))
        
        // Get full session details for sessions in project
        const allSessionsResponse = await fetch('/api/sessions', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (allSessionsResponse.ok) {
          const allSessionsData = await allSessionsResponse.json()
          const projectSessionsList = allSessionsData.filter((s: Session) => 
            sessionIds.includes(s.id)
          )
          setProjectSessions(projectSessionsList)
        }
      } else {
        console.error('Error fetching project:', response.statusText)
      }
    } catch (error) {
      console.error('Error fetching project:', error)
    } finally {
      setIsLoading(false)
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

  const removeSession = (sessionId: string) => {
    setSelectedSessions(prev => {
      const newSet = new Set(prev)
      newSet.delete(sessionId)
      return newSet
    })
    setProjectSessions(prev => prev.filter(s => s.id !== sessionId))
  }

  const handleSave = async () => {
    if (!project) return

    if (!projectName.trim()) {
      alert('Please enter a project name')
      return
    }

    setIsSaving(true)
    try {
      const token = await clerkSession?.getToken({ template: 'supabase' })
      if (!token) {
        console.error('No token available')
        return
      }

      const response = await fetch('/api/projects', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: project.id,
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          session_ids: Array.from(selectedSessions)
        })
      })

      if (response.ok) {
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        alert(`Error updating project: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating project:', error)
      alert('Error updating project. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!project) return

    if (!confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      return
    }

    setIsSaving(true)
    try {
      const token = await clerkSession?.getToken({ template: 'supabase' })
      if (!token) {
        console.error('No token available')
        return
      }

      const response = await fetch(`/api/projects?id=${project.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        onSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        alert(`Error deleting project: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('Error deleting project. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen || !project) return null

  const availableSessions = allSessions.filter(s => !selectedSessions.has(s.id))

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Edit Project</h2>
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

            {/* Current Sessions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Sessions in Project ({selectedSessions.size})
                </label>
                <button
                  onClick={() => setShowAddSessions(!showAddSessions)}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Sessions
                </button>
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : projectSessions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border border-gray-200 rounded-lg">
                  <p>No sessions in this project</p>
                  <p className="text-sm mt-1">Click "Add Sessions" to add some</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {projectSessions.map((session) => {
                    const matchCount = session.matches_data && Array.isArray(session.matches_data) 
                      ? session.matches_data.length 
                      : 0

                    return (
                      <div
                        key={session.id}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
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
                        <button
                          onClick={() => removeSession(session.id)}
                          className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          title="Remove session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Add Sessions Panel */}
            {showAddSessions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
              >
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Available Sessions ({availableSessions.length})
                  </label>
                  <button
                    onClick={() => setShowAddSessions(false)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Done
                  </button>
                </div>
                
                {isLoadingSessions ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : availableSessions.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    All sessions are already in this project
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {availableSessions.map((session) => {
                      const isSelected = selectedSessions.has(session.id)
                      const matchCount = session.matches_data && Array.isArray(session.matches_data) 
                        ? session.matches_data.length 
                        : 0

                      return (
                        <button
                          key={session.id}
                          onClick={() => {
                            toggleSession(session.id)
                            // Add to projectSessions if selected
                            if (!isSelected) {
                              setProjectSessions(prev => [...prev, session])
                            }
                          }}
                          className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-white transition-colors rounded ${
                            isSelected ? 'bg-white' : ''
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected 
                              ? 'bg-gray-900 border-gray-900' 
                              : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {session.title || 'Untitled Session'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
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
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={handleDelete}
              disabled={isSaving}
              className="px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
            >
              Delete Project
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !projectName.trim()}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

