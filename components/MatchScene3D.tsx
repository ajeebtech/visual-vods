'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei'
import { EffectComposer, Vignette } from '@react-three/postprocessing'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown, ChevronUp, Check } from 'lucide-react'
import * as THREE from 'three'
import { useUser, useSession } from '@clerk/nextjs'
import NotesPanel from '@/components/NotesPanel'
import { getCached, setCached, getCacheKey } from '@/lib/local-cache'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'

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

// Generate cylindrical spiral positions
function generateMatchPositions(count: number): Array<{ position: [number, number, number], rotation: [number, number, number] }> {
  const positions: Array<{ position: [number, number, number], rotation: [number, number, number] }> = []

  const radius = 8
  const thumbnailWidth = 2
  const thumbnailHeight = 1.125
  const gap = 0.2
  const verticalGap = 0.5

  // Calculate angle step based on arc length
  // arcLength = radius * angle
  // angle = arcLength / radius
  const angleStep = (thumbnailWidth + gap) / radius

  // Calculate vertical drop per item to create a spiral
  // We want to drop by (height + verticalGap) for every full revolution
  const itemsPerRevolution = (2 * Math.PI) / angleStep
  const verticalStep = (thumbnailHeight + verticalGap) / itemsPerRevolution

  for (let i = 0; i < count; i++) {
    const angle = i * angleStep
    // Start from y=2 and spiral down
    const y = 2 - (i * verticalStep)

    const x = radius * Math.sin(angle)
    const z = radius * Math.cos(angle)

    // Rotate to face outwards from center
    // The plane is initially facing +Z (or depending on geometry), usually we want it to face the camera
    // If camera is at (0,0,0) looking out, we want it to face (0,0,0).
    // But here we are looking AT the cylinder from outside.
    // So we want the tile to face OUTWARDS.
    // At angle 0 (z=radius, x=0), it should face +Z.
    // Rotation around Y axis should be 'angle'.
    const rotation: [number, number, number] = [0, angle, 0]

    positions.push({ position: [x, y, z], rotation })
  }

  return positions
}

// 3D Match Tile Component with fade-in animation
function MatchTile({
  position,
  rotation,
  thumbnail,
  match,
  onSelect,
  index,
  onThumbnailLoad,
  isVisible,
  hasNotes = false,
  searchedTeamName,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  thumbnail: string | null
  match: Match
  onSelect: () => void
  index: number
  onThumbnailLoad?: (index: number) => void
  isVisible: boolean
  hasNotes?: boolean
  searchedTeamName?: string
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
    <group position={position} rotation={rotation}>
      {/* Thumbnail plane */}
      <mesh
        ref={meshRef}
        rotation={[0, 0, 0]} // Already rotated by group
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
      {match.matchInfo && (() => {
        // Determine which team is the searched team
        const isTeam1Searched = searchedTeamName && match.matchInfo.team1.name.toLowerCase().includes(searchedTeamName.toLowerCase())
        const isTeam2Searched = searchedTeamName && match.matchInfo.team2.name.toLowerCase().includes(searchedTeamName.toLowerCase())

        // Determine colors based on searched team
        const team1Color = isTeam1Searched
          ? (match.matchInfo.winner === 1 ? 'text-green-400' : 'text-red-600')
          : 'text-white'
        const team2Color = isTeam2Searched
          ? (match.matchInfo.winner === 2 ? 'text-green-400' : 'text-red-600')
          : 'text-white'

        return (
          <Html
            position={[0, -0.7, 0]}
            center
            transform
            scale={0.5} // Scale down to 50% to counteract the 2x CSS size
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              transform: 'translate3d(-50%, -50%, 0)',
              opacity: opacityRef.current,
              transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div
              className="backdrop-blur-sm rounded-lg px-3 py-1 flex items-center gap-1 text-white text-2xl font-bold whitespace-nowrap shadow-lg"
              style={{ backgroundColor: 'rgba(26, 26, 26, 0.95)' }}
            >
              {/* Team 1 Logo */}
              {match.matchInfo.team1.logo && (
                <img
                  src={match.matchInfo.team1.logo}
                  alt={match.matchInfo.team1.name}
                  className="w-8 h-8 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}

              {/* Team 1 Score */}
              <span className={`text-2xl font-bold ${team1Color}`}>
                {match.matchInfo.score.team1}
              </span>

              {/* VS */}
              <span className="text-gray-400 text-xl">:</span>

              {/* Team 2 Score */}
              <span className={`text-2xl font-bold ${team2Color}`}>
                {match.matchInfo.score.team2}
              </span>

              {/* Team 2 Logo */}
              {match.matchInfo.team2.logo && (
                <img
                  src={match.matchInfo.team2.logo}
                  alt={match.matchInfo.team2.name}
                  className="w-8 h-8 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
            </div>
          </Html>
        )
      })()}
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
  const [isSessionSaved, setIsSessionSaved] = useState(false)
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null)
  const [mapStats, setMapStats] = useState<Array<{
    mapName: string
    winPercent: string
    wins: number
    losses: number
    mostPlayedComp: string[]
  }>>([])
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [isStatsMinimized, setIsStatsMinimized] = useState(false)

  // Update sessionId when initialSessionId changes (when loading an old session)
  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId)
      setIsSessionSaved(true) // Existing session is already saved
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

  // Fetch team map stats when team1Id changes
  useEffect(() => {
    const fetchTeamStats = async () => {
      if (!team1Id) {
        setMapStats([])
        return
      }

      setIsLoadingStats(true)
      try {
        const response = await fetch(`/api/vlr-team-stats?teamId=${team1Id}`)
        if (response.ok) {
          const data = await response.json()
          setMapStats(data.mapStats || [])
        } else {
          console.error('Failed to fetch team stats')
          setMapStats([])
        }
      } catch (error) {
        console.error('Error fetching team stats:', error)
        setMapStats([])
      } finally {
        setIsLoadingStats(false)
      }
    }

    fetchTeamStats()
  }, [team1Id])

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
      setIsSessionSaved(false)

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
          setIsSessionSaved(true)
          console.log('Session saved successfully:', data.id, `(${filteredMatches.length} matches)`)
          setSaveError(null)
        } else {
          const error = await response.json()
          console.error('Error saving session:', error)
          setSaveError(error.error || 'Failed to save session')
          setIsSessionSaved(false)
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
            enablePan={false} // Disable panning as requested
            enableZoom={true}
            enableRotate={true}
            autoRotate={false}
            zoomSpeed={1.2}
            minDistance={5}
            maxDistance={40}
            minPolarAngle={Math.PI / 4} // Allow viewing from side
            maxPolarAngle={Math.PI / 1.5}
            minAzimuthAngle={-Infinity} // Allow full horizontal rotation
            maxAzimuthAngle={Infinity}
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
                position={positions[originalIndex >= 0 ? originalIndex : displayIndex].position}
                rotation={positions[originalIndex >= 0 ? originalIndex : displayIndex].rotation}
                thumbnail={thumbnail}
                match={match}
                onSelect={() => handleThumbnailClick(match)}
                index={originalIndex >= 0 ? originalIndex : displayIndex}
                isVisible={isVisible}
                hasNotes={hasNotes}
                searchedTeamName={team1Name}
                onThumbnailLoad={(idx) => {
                  setLoadedThumbnails(prev => new Set([...Array.from(prev), idx]))
                }}
              />
            )
          })}

          {/* Post-processing effects */}
          <EffectComposer>
            <Vignette eskil={false} offset={0.1} darkness={0.5} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Date filter dropdown and team stats - top right */}
      <div className="fixed top-4 right-4 z-40 flex flex-col gap-3 items-end">
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

        {/* Team Map Stats */}
        {team1Id && team1Name && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg max-w-md w-80 overflow-hidden"
          >
            {/* Header with minimize button */}
            <button
              onClick={() => setIsStatsMinimized(!isStatsMinimized)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <h3 className="text-sm font-semibold text-gray-900">
                {team1Name} Map Stats
              </h3>
              <motion.div
                animate={{ rotate: isStatsMinimized ? 0 : 180 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-gray-600" />
              </motion.div>
            </button>

            {/* Stats content with collapse animation */}
            <AnimatePresence>
              {!isStatsMinimized && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <ScrollArea className="h-[400px] px-4 pb-4 w-full [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent_100%)]">
                    <div className="space-y-3 pr-3">
                      {isLoadingStats ? (
                        <p className="text-xs text-gray-500">Loading stats...</p>
                      ) : mapStats.length > 0 ? (
                        mapStats.map((stat, index) => {
                          const winPercentValue = parseFloat(stat.winPercent)
                          const isPositiveWinRate = !isNaN(winPercentValue) && winPercentValue > 50
                          const isNegativeWinRate = !isNaN(winPercentValue) && winPercentValue < 50

                          return (
                            <div
                              key={index}
                              className="border-b border-gray-200 pb-2 last:border-b-0 last:pb-0"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-900">
                                  {stat.mapName}
                                </span>
                                <span
                                  className={`text-xs ${isPositiveWinRate
                                    ? 'text-green-500 font-semibold'
                                    : isNegativeWinRate
                                      ? 'text-red-500 font-semibold'
                                      : 'text-gray-600'
                                    }`}
                                >
                                  {stat.winPercent} ({stat.wins}W-{stat.losses}L)
                                </span>
                              </div>
                              {stat.mostPlayedComp.length > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  {stat.mostPlayedComp.map((agent, agentIndex) => (
                                    <img
                                      key={agentIndex}
                                      src={`https://www.vlr.gg/img/vlr/game/agents/${agent}.png`}
                                      alt={agent.charAt(0).toUpperCase() + agent.slice(1)}
                                      style={{ width: '25px', marginLeft: agentIndex === 0 ? '0' : '8px', display: 'inline-block' }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-xs text-gray-500">No stats available</p>
                      )}
                    </div>
                  </ScrollArea>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
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
            ) : isSessionSaved && sessionId ? (
              <div className="flex items-center justify-end">
                <Check className="w-4 h-4 text-green-500" />
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
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{
              background: 'radial-gradient(circle at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.95) 100%)'
            }}
            onClick={closeEmbed}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
                duration: 0.5
              }}
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

