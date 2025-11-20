'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser, useSession } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, Trash2, Clock, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

interface Note {
  id: string
  session_id: string
  match_href: string
  vod_url: string
  timestamp_seconds: number
  note_text: string
  created_at: string
  updated_at: string
}

interface NotesPanelProps {
  sessionId: string | null
  matchHref: string
  vodUrl: string
  onTimestampClick: (seconds: number) => void
}

interface EditNoteFormProps {
  note: Note
  onSave: (text: string, timestamp: number) => void
  onCancel: () => void
}

function EditNoteForm({ note, onSave, onCancel }: EditNoteFormProps) {
  const [text, setText] = useState(note.note_text)
  const [timestamp, setTimestamp] = useState(note.timestamp_seconds)

  const formatTimestamp = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const parseTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':').map(Number)
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    return 0
  }

  return (
    <div className="space-y-2">
      <Input
        type="text"
        value={formatTimestamp(timestamp)}
        onChange={(e) => {
          const newTimestamp = parseTimestamp(e.target.value)
          if (!isNaN(newTimestamp) && newTimestamp >= 0) {
            setTimestamp(newTimestamp)
          }
        }}
        className="text-sm"
        placeholder="MM:SS or HH:MM:SS"
      />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-sm min-h-[60px]"
        placeholder="Note text..."
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onSave(text, timestamp)}
          className="flex-1"
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default function NotesPanel({ sessionId, matchHref, vodUrl, onTimestampClick }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newNoteText, setNewNoteText] = useState('')
  const [newTimestamp, setNewTimestamp] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null)

  // Format seconds to MM:SS or HH:MM:SS
  const formatTimestamp = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Parse timestamp string (MM:SS or HH:MM:SS) to seconds
  const parseTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':').map(Number)
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    return 0
  }

  // Get current time from YouTube player (if possible)
  const getCurrentTime = () => {
    // Try to get time from YouTube iframe
    if (youtubeIframeRef.current) {
      try {
        youtubeIframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'getCurrentTime' }),
          '*'
        )
      } catch (e) {
        // Cross-origin restrictions may prevent this
      }
    }
  }

  const { user } = useUser()
  const { session } = useSession()

  // Load notes for this session and match
  const loadNotes = async () => {
    if (!sessionId || !user || !session) return

    setIsLoading(true)
    try {
      const token = await session.getToken({ template: 'supabase' })
      
      if (!token) {
        setIsLoading(false)
        return
      }

      const response = await fetch(
        `/api/notes?session_id=${sessionId}&match_href=${encodeURIComponent(matchHref)}&vod_url=${encodeURIComponent(vodUrl)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setNotes(data)
      }
    } catch (error) {
      console.error('Error loading notes:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (sessionId && matchHref && vodUrl) {
      loadNotes()
    }
  }, [sessionId, matchHref, vodUrl])

  // Create a new note
  const handleAddNote = async () => {
    if (!sessionId || !newNoteText.trim() || !newTimestamp.trim()) return

    const timestampSeconds = parseTimestamp(newTimestamp)
    if (isNaN(timestampSeconds) || timestampSeconds < 0) {
      alert('Please enter a valid timestamp (MM:SS or HH:MM:SS)')
      return
    }

    try {
      if (!session) return
      const token = await session.getToken({ template: 'supabase' })
      
      if (!token) {
        alert('You must be logged in to add notes')
        return
      }

      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          match_href: matchHref,
          vod_url: vodUrl,
          timestamp_seconds: timestampSeconds,
          note_text: newNoteText.trim()
        })
      })

      if (response.ok) {
        const newNote = await response.json()
        setNotes([...notes, newNote].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds))
        setNewNoteText('')
        setNewTimestamp('')
        setIsAdding(false)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error adding note:', error)
      alert('Failed to add note')
    }
  }

  // Update a note
  const handleUpdateNote = async (noteId: string, text: string, timestamp: number) => {
    if (!sessionId || !text.trim()) return

    try {
      if (!session) return
      const token = await session.getToken({ template: 'supabase' })
      
      if (!token) {
        alert('You must be logged in to update notes')
        return
      }

      const response = await fetch('/api/notes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: noteId,
          note_text: text.trim(),
          timestamp_seconds: timestamp
        })
      })

      if (response.ok) {
        const updatedNote = await response.json()
        setNotes(notes.map(n => n.id === noteId ? updatedNote : n).sort((a, b) => a.timestamp_seconds - b.timestamp_seconds))
        setEditingId(null)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating note:', error)
      alert('Failed to update note')
    }
  }

  // Delete a note
  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return

    try {
      if (!session) return
      const token = await session.getToken({ template: 'supabase' })
      
      if (!token) {
        alert('You must be logged in to delete notes')
        return
      }

      const response = await fetch(`/api/notes?id=${noteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        setNotes(notes.filter(n => n.id !== noteId))
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting note:', error)
      alert('Failed to delete note')
    }
  }

  // Use current video time for timestamp
  const useCurrentTime = () => {
    // This would ideally get the current time from the YouTube player
    // For now, we'll use a placeholder - you can enhance this later
    const time = Math.floor(currentTime)
    setNewTimestamp(formatTimestamp(time))
  }

  if (!sessionId) {
    return (
      <div className="w-80 bg-white rounded-lg shadow-lg p-4">
        <p className="text-gray-500 text-sm">Session not saved. Notes will be available after saving the session.</p>
      </div>
    )
  }

  return (
    <div className="w-80 bg-white rounded-lg shadow-lg flex flex-col h-full max-h-[600px]">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
        <p className="text-xs text-gray-500 mt-1">Click timestamps to jump to that time</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <p className="text-gray-500 text-sm">Loading notes...</p>
        ) : notes.length === 0 && !isAdding ? (
          <p className="text-gray-500 text-sm">No notes yet. Add one to get started!</p>
        ) : (
          <>
            {notes.map((note) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                {editingId === note.id ? (
                  <EditNoteForm
                    note={note}
                    onSave={(text, timestamp) => {
                      handleUpdateNote(note.id, text, timestamp)
                      setEditingId(null)
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => onTimestampClick(note.timestamp_seconds)}
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(note.timestamp_seconds)}
                        <Play className="w-3 h-3" />
                      </button>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingId(note.id)}
                          className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.note_text}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </>
        )}
      </div>

      <div className="p-4 border-t">
        <AnimatePresence>
          {isAdding ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newTimestamp}
                  onChange={(e) => setNewTimestamp(e.target.value)}
                  placeholder="MM:SS or HH:MM:SS"
                  className="flex-1 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={useCurrentTime}
                  title="Use current video time"
                >
                  <Clock className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Add a note..."
                className="text-sm min-h-[80px]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!newNoteText.trim() || !newTimestamp.trim()}
                  className="flex-1"
                >
                  Add Note
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsAdding(false)
                    setNewNoteText('')
                    setNewTimestamp('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          ) : (
            <Button
              size="sm"
              onClick={() => setIsAdding(true)}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

