'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play } from 'lucide-react'
import { useUser, useSession } from '@clerk/nextjs'
import { getCached, setCached, getCacheKey } from '@/lib/local-cache'
import { cn } from '@/lib/utils'

interface VODLink {
  url: string
  platform: 'youtube' | 'twitch' | 'other'
  embedUrl?: string
  mapName?: string // Map name extracted from match header note
}

interface Match {
  href: string
  matchId?: string
  vodLinks: VODLink[]
  hasVODs: boolean
}

interface MatchGridProps {
  matches: Match[]
  sessionId?: string | null
}

// Helper to get YouTube thumbnail from video ID or URL
const getYouTubeThumbnail = (url: string): string | null => {
  let videoId: string | null = null
  
  if (url.includes('youtu.be/')) {
    const match = url.match(/youtu\.be\/([^?&]+)/)
    videoId = match ? match[1] : null
  } else if (url.includes('youtube.com/watch')) {
    const match = url.match(/[?&]v=([^&]+)/)
    videoId = match ? match[1] : null
  } else if (url.includes('youtube.com/embed/')) {
    const match = url.match(/embed\/([^?&]+)/)
    videoId = match ? match[1] : null
  }
  
  if (videoId) {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }
  
  return null
}

// Helper to get Twitch thumbnail
const getTwitchThumbnail = (url: string): string | null => {
  const videoMatch = url.match(/twitch\.tv\/videos\/(\d+)/)
  if (videoMatch) {
    // Twitch VOD thumbnails are harder to get, we'll use a placeholder
    return null
  }
  return null
}

export default function MatchGrid({ matches, sessionId }: MatchGridProps) {
  const { user } = useUser()
  const { session: clerkSession } = useSession()
  const [matchesWithNotes, setMatchesWithNotes] = useState<Set<string>>(new Set())
  const [displayCount, setDisplayCount] = useState(20)
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [selectedVOD, setSelectedVOD] = useState<VODLink | null>(null)
  
  // Fetch matches that have notes
  useEffect(() => {
    const fetchMatchesWithNotes = async () => {
      if (!sessionId || !user || !clerkSession) return

      try {
        const token = await clerkSession.getToken({ template: 'supabase' })
        if (!token) return

        const cacheKey = getCacheKey('matches-with-notes', sessionId)
        const cached = getCached<string[] | Set<string>>(cacheKey)
        if (cached) {
          // Convert array to Set if needed (Sets don't serialize to JSON)
          const notesSet = cached instanceof Set ? cached : new Set(cached)
          setMatchesWithNotes(notesSet)
          return
        }

        // Fetch all notes for this session
        const response = await fetch(`/api/notes?session_id=${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const notes = await response.json()
          // Create a Set of match_hrefs that have notes
          const matchHrefsWithNotes = new Set<string>()
          notes.forEach((note: any) => {
            if (note.match_href) {
              matchHrefsWithNotes.add(note.match_href)
            }
          })
          console.log(`[MatchGrid] Found ${matchHrefsWithNotes.size} matches with notes:`, Array.from(matchHrefsWithNotes))
          console.log(`[MatchGrid] Current matches:`, matches.map(m => m.href))
          setMatchesWithNotes(matchHrefsWithNotes)
          // Store as array since Sets don't serialize to JSON
          setCached(cacheKey, Array.from(matchHrefsWithNotes), 300) // Cache for 5 minutes
        }
      } catch (error) {
        console.error('Error fetching matches with notes:', error)
      }
    }

    fetchMatchesWithNotes()
    
    // Listen for notes-updated event to refresh
    const handleNotesUpdated = (event: CustomEvent) => {
      if (event.detail?.sessionId === sessionId) {
        console.log('[MatchGrid] Notes updated, refreshing matches-with-notes')
        // Force refresh by bypassing cache
        const refreshNotes = async () => {
          if (!sessionId || !user || !clerkSession) return
          try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) return
            
            const response = await fetch(`/api/notes?session_id=${sessionId}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })
            
            if (response.ok) {
              const notes = await response.json()
              const matchHrefsWithNotes = new Set<string>()
              notes.forEach((note: any) => {
                if (note.match_href) {
                  matchHrefsWithNotes.add(note.match_href)
                }
              })
              console.log(`[MatchGrid] Refreshed - Found ${matchHrefsWithNotes.size} matches with notes:`, Array.from(matchHrefsWithNotes))
              setMatchesWithNotes(matchHrefsWithNotes)
              const cacheKey = getCacheKey('matches-with-notes', sessionId)
              setCached(cacheKey, Array.from(matchHrefsWithNotes), 300)
            }
          } catch (error) {
            console.error('Error refreshing matches with notes:', error)
          }
        }
        refreshNotes()
      }
    }
    
    window.addEventListener('notes-updated', handleNotesUpdated as EventListener)
    
    return () => {
      window.removeEventListener('notes-updated', handleNotesUpdated as EventListener)
    }
  }, [sessionId, user, clerkSession, matches])
  
  // Filter matches that have VODs
  const matchesWithVODs = matches.filter(m => m.hasVODs)
  const displayedMatches = matchesWithVODs.slice(0, displayCount)
  const hasMore = matchesWithVODs.length > displayCount
  
  const handleLoadMore = () => {
    setDisplayCount(prev => prev + 20)
  }
  
  const handleThumbnailClick = (match: Match) => {
    // Use the first VOD link
    if (match.vodLinks.length > 0) {
      setSelectedMatch(match)
      setSelectedVOD(match.vodLinks[0])
    }
  }
  
  const closeEmbed = () => {
    setSelectedMatch(null)
    setSelectedVOD(null)
  }
  
  return (
    <>
      <div className="pl-20 pt-20 pb-32">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Match VODs ({matchesWithVODs.length} available)
          </h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {displayedMatches.map((match, index) => {
              const firstVOD = match.vodLinks[0]
              let thumbnail: string | null = null
              
              if (firstVOD.platform === 'youtube') {
                thumbnail = getYouTubeThumbnail(firstVOD.url)
              } else if (firstVOD.platform === 'twitch') {
                thumbnail = getTwitchThumbnail(firstVOD.url)
              }
              
              // Purple gradient background as fallback
              const bgGradient = `linear-gradient(135deg, rgba(147, 51, 234, 0.8) 0%, rgba(79, 70, 229, 0.8) 100%)`
              
              const hasNotes = matchesWithNotes.has(match.href)
              
              return (
                <motion.div
                  key={match.matchId || index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "relative aspect-video rounded-lg overflow-hidden cursor-pointer group",
                    hasNotes && "border-4 border-orange-500"
                  )}
                  onClick={() => handleThumbnailClick(match)}
                >
                  {/* Thumbnail or purple gradient background */}
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={`Match ${match.matchId}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to purple gradient if image fails to load
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent) {
                          parent.style.background = bgGradient
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ background: bgGradient }}
                    />
                  )}
                  
                  {/* Overlay with play button */}
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-colors flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-8 h-8 text-white ml-1" fill="white" />
                    </div>
                  </div>
                  
                  {/* Platform badge */}
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-black/60 text-white backdrop-blur-sm">
                      {firstVOD.platform === 'youtube' ? 'YT' : firstVOD.platform === 'twitch' ? 'TW' : 'VOD'}
                    </span>
                  </div>
                  
                  {/* Match ID badge */}
                  {match.matchId && (
                    <div className="absolute bottom-2 left-2">
                      <span className="px-2 py-1 text-xs font-semibold rounded bg-black/60 text-white backdrop-blur-sm">
                        #{match.matchId}
                      </span>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
          
          {/* Load More button */}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <motion.button
                onClick={handleLoadMore}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-shadow"
              >
                Load More ({matchesWithVODs.length - displayCount} remaining)
              </motion.button>
            </div>
          )}
        </div>
      </div>
      
      {/* Embed Modal */}
      <AnimatePresence>
        {selectedMatch && selectedVOD && selectedVOD.embedUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
            onClick={closeEmbed}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-6xl aspect-video bg-black rounded-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={closeEmbed}
                className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
              
              {/* Embed iframe */}
              <iframe
                src={selectedVOD.embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={`Match ${selectedMatch.matchId} VOD`}
              />
              
              {/* VOD selector if multiple VODs */}
              {selectedMatch.vodLinks.length > 1 && (
                <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto">
                  {selectedMatch.vodLinks.map((vod, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedVOD(vod)}
                      className={`px-3 py-1 rounded text-sm font-medium whitespace-nowrap ${
                        selectedVOD === vod
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {vod.mapName || (vod.platform === 'youtube' ? 'YouTube' : vod.platform === 'twitch' ? 'Twitch' : 'VOD')} {vod.mapName ? '' : index + 1}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

