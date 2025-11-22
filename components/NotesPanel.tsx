'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser, useSession } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, MessageSquare } from 'lucide-react'
import { getCached, setCached, getCacheKey, invalidateCache } from '@/lib/local-cache'
import { Button } from '@heroui/button'

interface Note {
  id: string
  session_id: string
  match_href: string
  vod_url: string
  timestamp_seconds: number
  note_text: string
  username: string
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

interface NotesPanelProps {
  sessionId: string | null
  matchHref: string
  vodUrl: string
  onTimestampClick: (seconds: number) => void
  youtubeIframeRef?: React.RefObject<HTMLIFrameElement>
}

export default function NotesPanel({ 
  sessionId, 
  matchHref, 
  vodUrl, 
  onTimestampClick,
  youtubeIframeRef 
}: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('no timestamp')
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const updateTimestampRef = useRef<(() => void) | null>(null)

  const { user } = useUser()
  const { session: clerkSession } = useSession()

  // Format seconds to MM:SS or HH:MM:SS
  const formatTimestamp = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get actual current time from YouTube player using postMessage
  useEffect(() => {
    if (!youtubeIframeRef?.current) {
      setCurrentTimestamp('no timestamp')
      setCurrentTimeSeconds(0)
      return
    }

    const iframe = youtubeIframeRef.current

    // Function to get current time from YouTube
    const getCurrentTime = (): Promise<number | null> => {
      return new Promise((resolve) => {
        if (!iframe?.contentWindow) {
          resolve(null)
          return
        }

        let resolved = false
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            window.removeEventListener('message', handleResponse)
            resolve(null)
          }
        }, 500)

        const handleResponse = (event: MessageEvent) => {
          if (!event.origin.includes('youtube.com')) return
          
          try {
            let data: any
            if (typeof event.data === 'string') {
              try {
                data = JSON.parse(event.data)
              } catch {
                return
              }
            } else {
              data = event.data
            }

            // YouTube sends time info in various formats
            if (data.info?.currentTime !== undefined) {
              const time = data.info.currentTime
              if (!resolved && !isNaN(time) && time >= 0) {
                resolved = true
                clearTimeout(timeout)
                window.removeEventListener('message', handleResponse)
                resolve(time)
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }

        window.addEventListener('message', handleResponse)

        // Request current time using YouTube's postMessage API
        try {
          // Method 1: Standard getCurrentTime command
          iframe.contentWindow.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'getCurrentTime',
              args: []
            }),
            '*'
          )

          // Method 2: Request info
          iframe.contentWindow.postMessage(
            JSON.stringify({
              event: 'listening',
              id: Math.random().toString(36),
              channel: 'widget'
            }),
            '*'
          )
        } catch (e) {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            window.removeEventListener('message', handleResponse)
            resolve(null)
          }
        }
      })
    }

    // Function to update timestamp
    const updateTimestamp = async () => {
      const currentTime = await getCurrentTime()
      if (currentTime !== null && !isNaN(currentTime)) {
        setCurrentTimeSeconds(currentTime)
        setCurrentTimestamp(formatTimestamp(currentTime))
      } else {
        // Fallback: extract from URL
        try {
          if (iframe?.src) {
            const url = new URL(iframe.src)
            const startParam = url.searchParams.get('start')
            if (startParam) {
              const time = parseFloat(startParam)
              if (!isNaN(time) && time >= 0) {
                setCurrentTimeSeconds(time)
                setCurrentTimestamp(formatTimestamp(time))
              } else {
                setCurrentTimestamp('no timestamp')
              }
            } else {
              setCurrentTimestamp('no timestamp')
            }
          }
        } catch (e) {
          setCurrentTimestamp('no timestamp')
        }
      }
    }

    // Store update function
    updateTimestampRef.current = updateTimestamp

    // Listen for YouTube messages to update time automatically
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com')) return
      
      try {
        let data: any
        if (typeof event.data === 'string') {
          try {
            data = JSON.parse(event.data)
          } catch {
            return
          }
        } else {
          data = event.data
        }

        // Update when we receive time info
        if (data.info?.currentTime !== undefined) {
          const time = data.info.currentTime
          if (!isNaN(time) && time >= 0) {
            setCurrentTimeSeconds(time)
            setCurrentTimestamp(formatTimestamp(time))
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }

    window.addEventListener('message', handleMessage)

    // Initial update
    updateTimestamp()

    return () => {
      updateTimestampRef.current = null
      window.removeEventListener('message', handleMessage)
    }
  }, [youtubeIframeRef])

  // Load notes for this session and match
  const loadNotes = async () => {
    if (!sessionId || !user || !clerkSession) return

    const cacheKey = getCacheKey('notes', sessionId, matchHref, vodUrl)
    
    // Try cache first
    const cached = getCached<Note[]>(cacheKey)
    if (cached) {
      setNotes(cached)
      return
    }

    setIsLoading(true)
    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      
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
        // Cache the result
        setCached(cacheKey, data || [], 60) // 1 minute
        setNotes(data || [])
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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notes])

  // Create a new note
  const handleAddNote = async () => {
    if (!sessionId || !newNoteText.trim() || !user || !clerkSession) return

    // Round to integer since database column is INTEGER
    const timestampSeconds = Math.round(currentTimeSeconds || 0)

    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      
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
        // Add username and avatar from current user (API should return it, but fallback to user data)
        const noteWithProfile = {
          ...newNote,
          username: newNote.username || user.username || user.firstName || 'You',
          avatar_url: newNote.avatar_url || user.imageUrl || null
        }
        
        // Update local state with new note
        const updatedNotes = [...notes, noteWithProfile].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
        setNotes(updatedNotes)
        setNewNoteText('')
        
        // Update cache with the new note list instead of invalidating
        const cacheKey = getCacheKey('notes', sessionId, matchHref, vodUrl)
        setCached(cacheKey, updatedNotes, 60) // 1 minute TTL
        
        // Invalidate matches-with-notes cache so border appears
        invalidateCache(getCacheKey('matches-with-notes', sessionId) + '*')
        
        // Dispatch event to trigger refresh of matches-with-notes in other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('notes-updated', { 
            detail: { sessionId, matchHref } 
          }))
        }
        
        // Scroll to bottom to show new message
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error adding note:', error)
      alert('Failed to add note')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddNote()
    }
  }

  if (!sessionId) {
    return (
      <div className="w-80 bg-black rounded-lg flex flex-col h-full max-h-[600px] border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">NOTES</h3>
          <p className="text-xs text-gray-400 mt-1">0 msgs</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-gray-500 text-sm text-center">Session not saved. Notes will be available after saving the session.</p>
        </div>
      </div>
    )
  }

  const username = user?.username || user?.firstName || 'You'

  return (
    <div className="w-80 bg-black rounded-lg flex flex-col h-full max-h-[600px] border border-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-lg font-semibold text-white">NOTES</h3>
        <p className="text-xs text-gray-400 mt-1">{notes.length} msgs</p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">Loading notes...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 border-2 border-gray-700 rounded-lg mb-4 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-sm">No messages yet</p>
          </div>
        ) : (
          notes.map((note) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 group p-2 rounded-lg transition-all duration-200 hover:bg-[#9146FF]/10 hover:border-l-2 hover:border-[#9146FF] hover:pl-3"
            >
              {/* Timestamp - clickable */}
              <button
                onClick={() => onTimestampClick(note.timestamp_seconds)}
                className="text-xs text-gray-400 group-hover:text-[#9146FF] transition-colors flex-shrink-0 min-w-[60px] text-left"
              >
                {formatTimestamp(note.timestamp_seconds)}
              </button>
              
              {/* Avatar and Username */}
              <div className="flex items-center gap-2 flex-shrink-0 min-w-[100px]">
                {note.avatar_url ? (
                  <img
                    src={note.avatar_url}
                    alt={note.username || 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                    onError={(e) => {
                      // Hide image if it fails to load
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-700 group-hover:bg-[#9146FF]/20 flex items-center justify-center transition-colors">
                    <span className="text-xs text-gray-400 group-hover:text-[#9146FF] transition-colors">
                      {(note.username || 'U')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-xs text-gray-300 group-hover:text-[#9146FF] transition-colors">
                  {note.username || 'Unknown'}
                </span>
              </div>
              
              {/* Message */}
              <p className="text-sm text-gray-200 group-hover:text-white flex-1 break-words transition-colors">
                {note.note_text}
              </p>
            </motion.div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        <textarea
          value={newNoteText}
          onChange={(e) => {
            setNewNoteText(e.target.value)
            // Update timestamp to current video time when user types
            if (updateTimestampRef.current) {
              updateTimestampRef.current()
            }
          }}
          onFocus={() => {
            // Update timestamp to current video time when user focuses
            if (updateTimestampRef.current) {
              updateTimestampRef.current()
            }
          }}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-gray-600 resize-none min-h-[60px]"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">{currentTimestamp}</p>
          <motion.div
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Button
            onClick={handleAddNote}
              isDisabled={!newNoteText.trim()}
              className="bg-[#9146FF] hover:bg-[#772CE8] text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              size="sm"
              startContent={<Send className="w-4 h-4" />}
            >
              Send
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
