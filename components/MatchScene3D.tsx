'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap } from 'lucide-react'
import * as THREE from 'three'
import { useUser, useSession } from '@clerk/nextjs'
import NotesPanel from '@/components/NotesPanel'
import RoundTimeline from '@/components/RoundTimeline'
import { getCached, setCached, getCacheKey } from '@/lib/local-cache'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Round {
  round: number
  start: number
  end: number
  duration: number
}

interface VODLink {
  url: string
  platform: 'youtube' | 'twitch' | 'other'
  embedUrl?: string
  mapName?: string // Map name extracted from match header note
}

interface MatchInfo {
  team1: {
    name: string
    logo: string | null
  }
  team2: {
    name: string
    logo: string | null
  }
  score: {
    team1: number
    team2: number
  }
  winner: 1 | 2 | null
}

interface Match {
  href: string
  matchId?: string
  date?: string // ISO date string
  vodLinks: VODLink[]
  hasVODs: boolean
  matchInfo?: MatchInfo
}

interface MatchScene3DProps {
  matches: Match[]
  team1Name?: string
  team1Id?: string
  team2Name?: string
  team2Id?: string
  tournament?: string
  playerName?: string
  initialSessionId?: string | null
  onAllThumbnailsLoaded?: () => void
  sessionOwner?: { username: string, avatar_url: string | null, user_id: string } | null
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

// Generate scattered positions with older matches further back
function generateMatchPositions(count: number): Array<[number, number, number]> {
  const positions: Array<[number, number, number]> = []
  const spread = 5 // Reduced spread - how far to spread on x and y axes
  const minDistance = 1.8 // Minimum distance between thumbnails to avoid overlap
  const usedPositions: Array<[number, number]> = []

  for (let i = 0; i < count; i++) {
    let attempts = 0
    let x: number = 0
    let y: number = 0
    let validPosition = false

    // Try to find a position that doesn't overlap
    while (!validPosition && attempts < 50) {
      // Scatter randomly on x and y, but closer together
      x = (Math.random() - 0.5) * spread * 2
      y = (Math.random() - 0.5) * spread * 2

      // Check if this position is too close to existing positions
      validPosition = usedPositions.every(([usedX, usedY]) => {
        const distance = Math.sqrt((x - usedX) ** 2 + (y - usedY) ** 2)
        return distance >= minDistance
      })

      attempts++
    }

    // If we couldn't find a non-overlapping position, use a grid-based fallback
    if (!validPosition) {
      const cols = Math.ceil(Math.sqrt(count))
      const row = Math.floor(i / cols)
      const col = i % cols
      x = (col - (cols - 1) / 2) * minDistance
      y = (row - (count / cols - 1) / 2) * minDistance
    }

    usedPositions.push([x, y])

    // Calculate z-depth: latest 20 matches (first 20 after sorting newest-first) are closer to camera
    let z: number
    if (i < 20) {
      // Latest 20 matches: closer to camera (0 to -3)
      z = -Math.random() * 3
    } else {
      // Older matches: further back (-3 to -15, with older ones further)
      const age = i - 20 // How many matches after the latest 20
      const maxDepth = -3 - (age * 0.4) // Each older match goes further back
      z = -3 - Math.random() * Math.min(12, maxDepth + 3)
    }

    positions.push([x, y, z])
  }

  return positions
}

// 3D Match Tile Component with fade-in animation
function MatchTile({
  position,
  thumbnail,
  match,
  onSelect,
  index,
  onThumbnailLoad,
  isVisible,
  hasNotes = false,
}: {
  position: [number, number, number]
  thumbnail: string | null
  match: Match
  onSelect: () => void
  index: number
  onThumbnailLoad?: (index: number) => void
  isVisible: boolean
  hasNotes?: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const borderGroupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const opacityRef = useRef(0)
  const [shouldAnimate, setShouldAnimate] = useState(false)
  const animationStartTime = useRef<number | null>(null)
  const targetScaleRef = useRef(1.0)
  const currentScaleRef = useRef(1.0)

  // Load texture
  useEffect(() => {
    let currentTexture: THREE.Texture | null = null
    let isMounted = true

    if (thumbnail) {
      const loader = new THREE.TextureLoader()
      loader.load(
        thumbnail,
        (tex) => {
          if (!isMounted) {
            tex.dispose()
            return
          }
          tex.colorSpace = THREE.SRGBColorSpace
          currentTexture = tex
          setTexture(tex)
          // Notify parent that this thumbnail loaded
          if (onThumbnailLoad) {
            onThumbnailLoad(index)
          }
        },
        undefined,
        (error) => {
          if (isMounted) {
            console.error(`Error loading thumbnail for match ${match.matchId}:`, error)
            setTexture(null)
          }
        }
      )
    } else {
      setTexture(null)
    }

    return () => {
      isMounted = false
      if (currentTexture) {
        currentTexture.dispose()
      }
    }
  }, [thumbnail, match.matchId, index])

  // Trigger fade-in animation when tile becomes visible
  useEffect(() => {
    if (isVisible) {
      // Small delay based on index for staggered effect
      const delay = index * 30 // 30ms per index
      const timer = setTimeout(() => {
        setShouldAnimate(true)
        animationStartTime.current = null // Reset for new animation
      }, delay)

      return () => clearTimeout(timer)
    } else {
      setShouldAnimate(false)
      opacityRef.current = 0
    }
  }, [isVisible, index])

  // Update target scale when hover state changes
  useEffect(() => {
    targetScaleRef.current = hovered ? 1.2 : 1.0
  }, [hovered])

  // Smooth fade-in animation and hover scale using useFrame
  useFrame((state, delta) => {
    if (shouldAnimate && meshRef.current) {
      if (animationStartTime.current === null) {
        animationStartTime.current = state.clock.elapsedTime
      }

      const elapsed = state.clock.elapsedTime - animationStartTime.current
      const duration = 0.6 // 600ms in seconds
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out curve for smooth animation
      const eased = 1 - Math.pow(1 - progress, 3)
      opacityRef.current = eased

      // Smoothly interpolate scale towards target (slow animation)
      const lerpSpeed = 0.08 // Slower = smoother animation (0.05-0.15 range)
      currentScaleRef.current = THREE.MathUtils.lerp(
        currentScaleRef.current,
        targetScaleRef.current,
        lerpSpeed
      )

      // Update material opacity
      if (meshRef.current.material) {
        const material = meshRef.current.material as THREE.MeshStandardMaterial
        material.opacity = opacityRef.current
        material.needsUpdate = true
      }

      // Apply scale with base fade-in scale
      const baseScale = opacityRef.current * 0.95 + 0.05 // Scale from 0.05 to 1.0 as it fades in
      meshRef.current.scale.setScalar(baseScale * currentScaleRef.current)

      // Update border group scale to match thumbnail
      if (borderGroupRef.current) {
        borderGroupRef.current.scale.setScalar(currentScaleRef.current)
      }
    }
  })

  // Purple gradient color
  const purpleColor = new THREE.Color(0x9333ea)

  return (
    <group position={position}>
      {/* Thumbnail plane */}
      <mesh
        ref={meshRef}
        rotation={[0, 0, 0]} // Face camera (top-down view)
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={onSelect}
        scale={hovered ? 1.15 : opacityRef.current * 0.95 + 0.05} // Scale from 0.05 to 1.0 as it fades in
      >
        <planeGeometry args={[2, 1.125]} />
        {texture ? (
          <meshStandardMaterial
            map={texture}
            side={THREE.DoubleSide}
            transparent={true}
            opacity={opacityRef.current}
            emissive={new THREE.Color(0x222222)} // Add slight emissive glow
            emissiveIntensity={0.3} // Brightness boost
            toneMapped={true}
          />
        ) : (
          <meshStandardMaterial
            color={purpleColor}
            side={THREE.DoubleSide}
            transparent={true}
            opacity={opacityRef.current}
            emissive={new THREE.Color(0x4a1a7a)} // Purple emissive for fallback
            emissiveIntensity={0.2}
          />
        )}
      </mesh>

      {/* Orange border if match has notes - using a frame made of 4 planes */}
      {hasNotes && (
        <group ref={borderGroupRef}>
          {/* Top border */}
          <mesh rotation={[0, 0, 0]} position={[0, 0.5625, 0.001]}>
            <planeGeometry args={[2.0, 0.05]} />
            <meshStandardMaterial
              color={new THREE.Color(0xff6600)}
              side={THREE.DoubleSide}
              transparent={true}
              opacity={opacityRef.current}
              emissive={new THREE.Color(0xff6600)}
              emissiveIntensity={0.8}
            />
          </mesh>
          {/* Bottom border */}
          <mesh rotation={[0, 0, 0]} position={[0, -0.5625, 0.001]}>
            <planeGeometry args={[2.0, 0.05]} />
            <meshStandardMaterial
              color={new THREE.Color(0xff6600)}
              side={THREE.DoubleSide}
              transparent={true}
              opacity={opacityRef.current}
              emissive={new THREE.Color(0xff6600)}
              emissiveIntensity={0.8}
            />
          </mesh>
          {/* Left border */}
          <mesh rotation={[0, 0, 0]} position={[-1.0, 0, 0.001]}>
            <planeGeometry args={[0.05, 1.125]} />
            <meshStandardMaterial
              color={new THREE.Color(0xff6600)}
              side={THREE.DoubleSide}
              transparent={true}
              opacity={opacityRef.current}
              emissive={new THREE.Color(0xff6600)}
              emissiveIntensity={0.8}
            />
          </mesh>
          {/* Right border */}
          <mesh rotation={[0, 0, 0]} position={[1.0, 0, 0.001]}>
            <planeGeometry args={[0.05, 1.125]} />
            <meshStandardMaterial
              color={new THREE.Color(0xff6600)}
              side={THREE.DoubleSide}
              transparent={true}
              opacity={opacityRef.current}
              emissive={new THREE.Color(0xff6600)}
              emissiveIntensity={0.8}
            />
          </mesh>
        </group>
      )}

      {/* Score and team info below thumbnail using HTML overlay */}
      {match.matchInfo && (
        <Html
          position={[0, -0.7, 0]}
          center
          transform
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            transform: 'translate3d(-50%, -50%, 0)',
            opacity: opacityRef.current,
            transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="bg-black/90 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5 text-white text-xs font-bold whitespace-nowrap shadow-lg">
            {/* Team 1 Logo */}
            {match.matchInfo.team1.logo && (
              <img
                src={match.matchInfo.team1.logo}
                alt={match.matchInfo.team1.name}
                className="w-4 h-4 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}

            {/* Team 1 Score */}
            <span className={`text-xs ${match.matchInfo.winner === 1 ? 'text-green-400' : 'text-white'}`}>
              {match.matchInfo.score.team1}
            </span>

            {/* VS */}
            <span className="text-gray-400 text-xs">:</span>

            {/* Team 2 Score */}
            <span className={`text-xs ${match.matchInfo.winner === 2 ? 'text-green-400' : 'text-white'}`}>
              {match.matchInfo.score.team2}
            </span>

            {/* Team 2 Logo */}
            {match.matchInfo.team2.logo && (
              <img
                src={match.matchInfo.team2.logo}
                alt={match.matchInfo.team2.name}
                className="w-4 h-4 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

export default function MatchScene3D({
  matches,
  team1Name,
  team1Id,
  team2Name,
  team2Id,
  tournament,
  playerName,
  initialSessionId,
  onAllThumbnailsLoaded,
  sessionOwner
}: MatchScene3DProps) {
  const { user } = useUser()
  const { session: clerkSession } = useSession()
  const [matchesWithNotes, setMatchesWithNotes] = useState<Set<string>>(new Set())
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [selectedVOD, setSelectedVOD] = useState<VODLink | null>(null)
  const [loadedThumbnails, setLoadedThumbnails] = useState<Set<number>>(new Set())
  const [dateFilter, setDateFilter] = useState<'30' | '50' | '90' | 'all'>('all')
  const [visibleMatches, setVisibleMatches] = useState<number>(0)
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null)
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null)

  // Round detection state
  const [rounds, setRounds] = useState<Round[]>([])
  const [detectingRounds, setDetectingRounds] = useState(false)
  const [roundsJobId, setRoundsJobId] = useState<string | null>(null)
  const [roundsError, setRoundsError] = useState<string | null>(null)

  // Update sessionId when initialSessionId changes (when loading an old session)
  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId)
    }
  }, [initialSessionId])

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
          console.log(`[MatchScene3D] Found ${matchHrefsWithNotes.size} matches with notes:`, Array.from(matchHrefsWithNotes))
          console.log(`[MatchScene3D] All match hrefs in scene:`, filteredMatches.map(m => m.href))
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
        console.log('[MatchScene3D] Notes updated, refreshing matches-with-notes')
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
              console.log(`[MatchScene3D] Refreshed - Found ${matchHrefsWithNotes.size} matches with notes:`, Array.from(matchHrefsWithNotes))
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
  }, [sessionId, user, clerkSession])

  // Filter only YouTube VODs with embed URLs and remove duplicates
  const youtubeMatches = useMemo(() => {
    const filtered = matches
      .map(match => ({
        ...match,
        vodLinks: match.vodLinks.filter(
          vod => vod.platform === 'youtube' && vod.embedUrl
        )
      }))
      .filter(m => m.vodLinks.length > 0)

    // Remove duplicates based on matchId or href
    const uniqueMatches: Match[] = []
    const seenMatchIds = new Set<string>()
    const seenHrefs = new Set<string>()

    for (const match of filtered) {
      const key = match.matchId || match.href

      if (match.matchId && !seenMatchIds.has(match.matchId)) {
        seenMatchIds.add(match.matchId)
        uniqueMatches.push(match)
      } else if (!match.matchId && !seenHrefs.has(match.href)) {
        seenHrefs.add(match.href)
        uniqueMatches.push(match)
      }
    }

    console.log(`Filtered to ${uniqueMatches.length} unique YouTube matches from ${matches.length} total matches (removed ${filtered.length - uniqueMatches.length} duplicates)`)
    return uniqueMatches
  }, [matches])

  // Filter matches by date range and sort by date (newest first)
  const filteredMatches = useMemo(() => {
    let matches = youtubeMatches

    // Apply date filter if not 'all'
    if (dateFilter !== 'all') {
      const days = parseInt(dateFilter)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      matches = matches.filter(match => {
        if (!match.date) return true // Include matches without dates
        const matchDate = new Date(match.date)
        return matchDate >= cutoffDate
      })
    }

    // Sort by date: newest first (latest matches at the beginning)
    return matches.sort((a, b) => {
      if (!a.date && !b.date) return 0
      if (!a.date) return 1 // Matches without dates go to the end
      if (!b.date) return -1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }, [youtubeMatches, dateFilter])

  // Progressive rendering: show matches one by one
  useEffect(() => {
    if (filteredMatches.length === 0) {
      setVisibleMatches(0)
      return
    }

    // Reset visible matches when filter changes
    setVisibleMatches(0)

    // Show matches progressively
    const interval = setInterval(() => {
      setVisibleMatches(prev => {
        if (prev >= filteredMatches.length) {
          clearInterval(interval)
          return prev
        }
        return prev + 1
      })
    }, 100) // Show one match every 100ms

    return () => clearInterval(interval)
  }, [filteredMatches.length, dateFilter])

  // Get matches to display (progressive)
  const matchesToDisplay = useMemo(() => {
    return filteredMatches.slice(0, visibleMatches)
  }, [filteredMatches, visibleMatches])

  // Generate positions for filtered matches
  const positions = useMemo(
    () => generateMatchPositions(filteredMatches.length),
    [filteredMatches.length]
  )

  // Notify parent when all thumbnails are loaded
  useEffect(() => {
    // Only notify when:
    // 1. All matches are visible (progressive loading complete)
    // 2. All thumbnails have loaded (or matches have no thumbnails)
    // 3. We have matches to display
    if (
      filteredMatches.length > 0 &&
      visibleMatches >= filteredMatches.length
    ) {
      // Count how many matches should have thumbnails
      const matchesWithThumbnails = matchesToDisplay.filter(match => {
        const firstVOD = match.vodLinks[0]
        return getYouTubeThumbnail(firstVOD?.url || '') !== null
      }).length

      // If all thumbnails are loaded (or no thumbnails to load), notify parent
      if (loadedThumbnails.size >= matchesWithThumbnails || matchesWithThumbnails === 0) {
        // Small delay to ensure everything is settled
        const timer = setTimeout(() => {
          if (onAllThumbnailsLoaded) {
            onAllThumbnailsLoaded()
          }
        }, 300)
        return () => clearTimeout(timer)
      }
    }
  }, [visibleMatches, filteredMatches.length, loadedThumbnails.size, matchesToDisplay, onAllThumbnailsLoaded])

  // Auto-save session when ALL matches are fully loaded (always, since user must be logged in to search)
  useEffect(() => {
    const saveSession = async () => {
      // Don't save if:
      // - No matches
      // - Not all matches are visible yet (wait for progressive loading to complete)
      // - Already saved
      // - Currently saving
      if (
        filteredMatches.length === 0 ||
        visibleMatches < filteredMatches.length ||
        sessionId ||
        isSavingSession
      ) {
        return
      }

      setIsSavingSession(true)
      setSaveError(null)

      try {
        if (!clerkSession) {
          console.error('No session found - user should be logged in to search')
          setSaveError('Authentication required')
          setIsSavingSession(false)
          return
        }

        const token = await clerkSession.getToken({ template: 'supabase' })

        if (!token) {
          console.error('No token found - user should be logged in to search')
          setSaveError('Authentication required')
          setIsSavingSession(false)
          return
        }

        console.log(`Saving session with ${filteredMatches.length} matches...`)

        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            team1_name: team1Name,
            team1_id: team1Id,
            team2_name: team2Name,
            team2_id: team2Id,
            tournament,
            player_name: playerName,
            matches_data: filteredMatches
          })
        })

        if (response.ok) {
          const data = await response.json()
          setSessionId(data.id)
          console.log('Session saved successfully:', data.id, `(${filteredMatches.length} matches)`)
          setSaveError(null)
        } else {
          const error = await response.json()
          console.error('Error saving session:', error)
          setSaveError(error.error || 'Failed to save session')
        }
      } catch (error: any) {
        console.error('Error saving session:', error)
        setSaveError(error.message || 'Failed to save session. Check console for details.')
      } finally {
        setIsSavingSession(false)
      }
    }

    // Only save when all matches are visible (progressive loading complete)
    // Add a small delay after all matches are visible to ensure everything is ready
    if (visibleMatches >= filteredMatches.length && filteredMatches.length > 0) {
      const timer = setTimeout(saveSession, 500)
      return () => clearTimeout(timer)
    }
  }, [visibleMatches, filteredMatches.length, sessionId, isSavingSession, team1Name, team1Id, team2Name, team2Id, tournament, playerName])

  const handleThumbnailClick = (match: Match) => {
    if (match.vodLinks.length > 0) {
      setSelectedMatch(match)
      setSelectedVOD(match.vodLinks[0])
    }
  }

  const closeEmbed = () => {
    setSelectedMatch(null)
    setSelectedVOD(null)
  }

  // Handle timestamp click - jump to that time in YouTube video
  const handleTimestampClick = (seconds: number) => {
    if (!youtubeIframeRef.current || !selectedVOD?.embedUrl) return

    try {
      // Extract base URL and preserve existing params
      const url = new URL(selectedVOD.embedUrl)
      url.searchParams.set('start', seconds.toString())
      url.searchParams.set('autoplay', '1')
      url.searchParams.set('enablejsapi', '1') // Ensure API is enabled
      if (!url.searchParams.has('origin')) {
        url.searchParams.set('origin', window.location.origin)
      }
      youtubeIframeRef.current.src = url.toString()

      // Also try to use YouTube IFrame API if available
      if (youtubeIframeRef.current.contentWindow) {
        youtubeIframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'seekTo',
            args: [seconds, true]
          }),
          '*'
        )
      }
    } catch (error) {
      console.error('Error jumping to timestamp:', error)
    }
  }

  // Detect rounds for current video
  const detectRounds = async () => {
    if (!selectedVOD?.url || !clerkSession) return

    setDetectingRounds(true)
    setRoundsError(null)

    try {
      const token = await clerkSession.getToken({ template: 'supabase' })
      if (!token) {
        setRoundsError('Authentication required')
        setDetectingRounds(false)
        return
      }

      // Call process API
      const response = await fetch('/api/rounds/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          videoUrl: selectedVOD.url,
          matchHref: selectedMatch?.href,
          sessionId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to process video')
      }

      const data = await response.json()

      // If cached, use immediately
      if (data.cached && data.rounds) {
        setRounds(data.rounds)
        setDetectingRounds(false)
        return
      }

      // Otherwise, poll for results
      if (data.jobId) {
        setRoundsJobId(data.jobId)
        pollRoundStatus(data.jobId, token)
      }

    } catch (error: any) {
      console.error('Error detecting rounds:', error)
      setRoundsError(error.message || 'Failed to detect rounds')
      setDetectingRounds(false)
    }
  }

  // Poll for round detection status
  const pollRoundStatus = async (jobId: string, token: string) => {
    const maxAttempts = 60 // 5 minutes max (5s interval)
    let attempts = 0

    const poll = async () => {
      try {
        const response = await fetch(`/api/rounds/status?jobId=${jobId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to get status')
        }

        const data = await response.json()

        if (data.status === 'completed' && data.result?.rounds) {
          setRounds(data.result.rounds)
          setDetectingRounds(false)
          setRoundsJobId(null)
          return
        }

        if (data.status === 'failed') {
          setRoundsError(data.error || 'Processing failed')
          setDetectingRounds(false)
          setRoundsJobId(null)
          return
        }

        // Continue polling
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000) // Poll every 5 seconds
        } else {
          setRoundsError('Processing timed out')
          setDetectingRounds(false)
          setRoundsJobId(null)
        }

      } catch (error: any) {
        console.error('Error polling status:', error)
        setRoundsError(error.message)
        setDetectingRounds(false)
        setRoundsJobId(null)
      }
    }

    poll()
  }

  // Handle round click - jump to round start
  const handleRoundClick = (startTime: number) => {
    handleTimestampClick(startTime)
  }

  // Reset rounds when video changes
  useEffect(() => {
    if (selectedVOD) {
      setRounds([])
      setRoundsError(null)
      setDetectingRounds(false)
      setRoundsJobId(null)
    }
  }, [selectedVOD?.url])

  return (
    <>
      <div className="fixed inset-0 z-30">
        <Canvas
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          className="bg-gray-100"
        >
          <PerspectiveCamera
            makeDefault
            position={[0, 0, 15]}
            fov={75}
          />

          {/* Lighting - increased for brighter thumbnails */}
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 10, 5]} intensity={1.2} />
          <pointLight position={[-10, -10, -5]} intensity={0.6} />
          <pointLight position={[0, 10, 0]} intensity={0.5} /> {/* Top light for better visibility */}

          {/* Camera controls - only zoom, no rotation */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={false} // Disable rotation
            panSpeed={1.5} // Faster panning
            zoomSpeed={1.2}
            minDistance={5}
            maxDistance={80} // Increased max distance to see further back matches
            minPolarAngle={Math.PI / 2} // Lock to top-down view
            maxPolarAngle={Math.PI / 2}
            minAzimuthAngle={-Infinity} // Allow full horizontal panning
            maxAzimuthAngle={Infinity}
            screenSpacePanning={true} // Pan in screen space (easier to move up/down/left/right)
            mouseButtons={{
              LEFT: THREE.MOUSE.PAN, // Left click to pan
              MIDDLE: THREE.MOUSE.DOLLY, // Middle mouse to zoom
              RIGHT: THREE.MOUSE.PAN // Right click also pans
            }}
            touches={{
              ONE: THREE.TOUCH.PAN, // One finger to pan
              TWO: THREE.TOUCH.DOLLY_PAN // Two fingers to zoom and pan
            }}
          />

          {/* Match tiles - progressive rendering with fade-in */}
          {matchesToDisplay.map((match, displayIndex) => {
            const firstVOD = match.vodLinks[0]
            const thumbnail = getYouTubeThumbnail(firstVOD.url)
            // Find the original index in filteredMatches for position
            const originalIndex = filteredMatches.findIndex(m =>
              (m.matchId && m.matchId === match.matchId) ||
              (!m.matchId && m.href === match.href)
            )

            // Check if this match should be visible (for fade-in animation)
            const isVisible = displayIndex < visibleMatches
            const hasNotes = matchesWithNotes.has(match.href)
            if (hasNotes) {
              console.log(`[MatchScene3D] Match ${match.href} has notes!`)
            }

            return (
              <MatchTile
                key={match.matchId || displayIndex}
                position={positions[originalIndex >= 0 ? originalIndex : displayIndex]}
                thumbnail={thumbnail}
                match={match}
                onSelect={() => handleThumbnailClick(match)}
                index={originalIndex >= 0 ? originalIndex : displayIndex}
                isVisible={isVisible}
                hasNotes={hasNotes}
                onThumbnailLoad={(idx) => {
                  setLoadedThumbnails(prev => new Set([...Array.from(prev), idx]))
                }}
              />
            )
          })}
        </Canvas>
      </div>

      {/* Date filter dropdown - top right */}
      <div className="fixed top-4 right-4 z-40">
        <Select value={dateFilter} onValueChange={(value: '30' | '50' | '90' | 'all') => setDateFilter(value)}>
          <SelectTrigger className="w-32 bg-white/90 backdrop-blur-sm text-gray-900">
            <SelectValue placeholder="Filter by date" />
          </SelectTrigger>
          <SelectContent className="bg-white text-gray-900">
            <SelectItem value="all" className="text-gray-900 focus:text-gray-900 focus:bg-gray-100">All matches</SelectItem>
            <SelectItem value="30" className="text-gray-900 focus:text-gray-900 focus:bg-gray-100">Last 30 days</SelectItem>
            <SelectItem value="50" className="text-gray-900 focus:text-gray-900 focus:bg-gray-100">Last 50 days</SelectItem>
            <SelectItem value="90" className="text-gray-900 focus:text-gray-900 focus:bg-gray-100">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Info overlay */}
      <div className="fixed top-4 left-24 z-40 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            {/* Session owner info */}
            {sessionOwner && (
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                {sessionOwner.avatar_url ? (
                  <img
                    src={sessionOwner.avatar_url}
                    alt={sessionOwner.username}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center">
                    <span className="text-xs text-gray-600 font-medium">
                      {sessionOwner.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <p className="text-xs text-gray-600">
                  Created by <span className="font-medium text-gray-900">{sessionOwner.username}</span>
                </p>
              </div>
            )}
            <p className="text-sm font-medium text-gray-900">
              {filteredMatches.length} matches {dateFilter !== 'all' ? `(last ${dateFilter}d)` : ''} • {matchesToDisplay.length} visible • {loadedThumbnails.size} thumbnails loaded
            </p>
            <p className="text-xs text-gray-600 mt-1">
              First 20 matches closer • Older matches further back • Click and drag to pan
            </p>
            {matchesToDisplay.length < filteredMatches.length && (
              <p className="text-xs text-blue-600 mt-1">
                Loading matches... ({matchesToDisplay.length} / {filteredMatches.length} shown)
              </p>
            )}
            {loadedThumbnails.size < matchesToDisplay.length && (
              <p className="text-xs text-blue-600 mt-1">
                Loading thumbnails... ({matchesToDisplay.length - loadedThumbnails.size} remaining)
              </p>
            )}
          </div>

          {/* Session Save Status */}
          <div className="flex flex-col items-end gap-1">
            {isSavingSession ? (
              <div className="flex items-center gap-2 text-xs text-blue-600">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                <span>Saving session...</span>
              </div>
            ) : sessionId ? (
              <div className="flex items-center justify-end">
                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                <span>Preparing to save...</span>
              </div>
            )}
            {saveError && (
              <p className="text-xs text-red-600 max-w-[200px] text-right">{saveError}</p>
            )}
          </div>
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
              className="relative w-full max-w-7xl flex gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Left column: Video and map buttons */}
              <div className="flex-1 flex flex-col gap-3">
                {/* Video container */}
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  {/* Close button */}
                  <button
                    onClick={closeEmbed}
                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                  >
                    <X className="w-6 h-6 text-white" />
                  </button>

                  {/* Embed iframe */}
                  <iframe
                    ref={youtubeIframeRef}
                    src={selectedVOD.embedUrl.includes('enablejsapi')
                      ? selectedVOD.embedUrl
                      : `${selectedVOD.embedUrl}${selectedVOD.embedUrl.includes('?') ? '&' : '?'}enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={`Match ${selectedMatch.matchId} VOD`}
                  />
                </div>

                {/* VOD selector if multiple VODs - now below the video */}
                {selectedMatch.vodLinks.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto px-1">
                    {selectedMatch.vodLinks.map((vod, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedVOD(vod)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${selectedVOD === vod
                          ? 'bg-purple-600 text-white shadow-lg'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                      >
                        {vod.mapName || `YouTube ${index + 1}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* Round Detection Button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={detectRounds}
                    disabled={detectingRounds || !!rounds.length}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${rounds.length > 0
                        ? 'bg-green-600 text-white cursor-default'
                        : detectingRounds
                          ? 'bg-purple-600/50 text-white cursor-wait'
                          : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
                      }`}
                  >
                    <Zap className={`w-4 h-4 ${detectingRounds ? 'animate-pulse' : ''}`} />
                    <span>
                      {rounds.length > 0
                        ? `${rounds.length} Rounds Detected`
                        : detectingRounds
                          ? 'Detecting Rounds...'
                          : 'Detect Rounds'}
                    </span>
                  </button>

                  {roundsError && (
                    <p className="text-xs text-red-400">{roundsError}</p>
                  )}
                </div>

                {/* Round Timeline */}
                {rounds.length > 0 && (
                  <RoundTimeline
                    rounds={rounds}
                    onRoundClick={handleRoundClick}
                  />
                )}
              </div>

              {/* Notes Panel */}
              <div className="flex-shrink-0">
                <NotesPanel
                  sessionId={sessionId}
                  matchHref={selectedMatch.href}
                  vodUrl={selectedVOD.url}
                  onTimestampClick={handleTimestampClick}
                  youtubeIframeRef={youtubeIframeRef}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

