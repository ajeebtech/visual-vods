import { Suspense, useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { motion, AnimatePresence } from 'framer-motion'
import AILoadingState from '@/components/kokonutui/ai-loading'
import SearchableSelect from '@/components/SearchableSelect'
import { getCached, setCached, getCacheKey } from '@/lib/local-cache'
import { useUser, useSession, useClerk } from '@clerk/nextjs'

// Dynamically import Scene to avoid SSR issues with Three.js
const Scene = dynamic(() => import('../components/Scene'), {
  ssr: false,
})
//i
import Sidebar from '@/components/Sidebar'
import MatchScene3D from '@/components/MatchScene3D'
import MetaAnalysis from '@/components/MetaAnalysis'

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [showScene, setShowScene] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // Search state
  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [tournament, setTournament] = useState('')
  const [playerName, setPlayerName] = useState('')

  // Store team IDs for fetching matches
  const [team1Id, setTeam1Id] = useState<string | null>(null)
  const [team2Id, setTeam2Id] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)

  // Store team logos
  const [team1Logo, setTeam1Logo] = useState<string | null>(null)
  const [team2Logo, setTeam2Logo] = useState<string | null>(null)
  const [matchLimit, setMatchLimit] = useState<number>(50)

  // Store matches data
  const [matchesData, setMatchesData] = useState<any>(null)

  // Store the loaded session ID
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null)
  // Store session owner info
  const [sessionOwner, setSessionOwner] = useState<{ username: string, avatar_url: string | null, user_id: string } | null>(null)

  // Meta analysis state
  const [showMeta, setShowMeta] = useState(false)

  // Handle logo click - reset to search view
  const handleLogoClick = () => {
    setShowMeta(false)
    setMatchesData(null)
    setHasSubmitted(false)
    setShowScene(false)
    setIsLoading(false)
    // Reset search fields
    setTeam1('')
    setTeam2('')
    setTournament('')
    setPlayerName('')
    setTeam1Id(null)
    setTeam2Id(null)
    setPlayerId(null)
    setTeam1Logo(null)
    setTeam2Logo(null)
    setMatchLimit(50)
  }

  const router = useRouter()
  const { user } = useUser()
  const { session: clerkSession } = useSession()

  // Load session from URL query parameter
  useEffect(() => {
    const loadSessionFromUrl = async () => {
      const { sessionId, bypassCache } = router.query

      // Only load if we have a sessionId and it's different from what we've already loaded
      if (sessionId && typeof sessionId === 'string' && user && clerkSession) {
        // If this is the same session we already loaded, skip
        if (loadedSessionId === sessionId) {
          console.log('Session already loaded, skipping:', sessionId)
          return
        }

        // Reset loadedSessionId if we have a new sessionId to allow loading
        if (sessionId !== loadedSessionId) {
          setLoadedSessionId(null)
        }

        try {
          console.log('Loading session from URL:', sessionId, 'Current loaded:', loadedSessionId)
          const token = await clerkSession.getToken({ template: 'supabase' })
          if (!token) {
            console.log('No token available, waiting...')
            return
          }

          const url = `/api/sessions?id=${sessionId}${bypassCache ? '&bypassCache=true' : ''}`
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })

          if (response.ok) {
            const data = await response.json()
            if (data.session) {
              console.log('Session loaded successfully, setting up...')
              await handleLoadSession(data.session)
              // Mark as loaded - this happens in handleLoadSession too, but set it here to prevent double-loading
              setLoadedSessionId(sessionId)
              // Remove sessionId from URL after loading
              setTimeout(() => {
                router.replace('/', undefined, { shallow: true })
              }, 100)
            } else {
              console.error('Session data missing from response:', data)
              alert('Session not found or you do not have access to it')
            }
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load session' }))
            console.error('Error loading session:', {
              status: response.status,
              error: errorData,
              sessionId: sessionId,
              fullResponse: errorData
            })

            // Show more detailed error message
            const errorMessage = errorData.message || errorData.error || 'Failed to load session'
            console.error('Full error details:', JSON.stringify(errorData, null, 2))
            alert(`${errorMessage}\n\nCheck console for more details.`)
          }
        } catch (error) {
          console.error('Error loading session from URL:', error)
        }
      }
    }

    if (router.isReady) {
      loadSessionFromUrl()
    }
  }, [router.query.sessionId, router.isReady, user, clerkSession])

  // Handle loading a session from history
  const handleLoadSession = async (session: any) => {
    // Update session's updated_at timestamp to move it to recently visited
    // This will be handled by the API when we make the PUT request
    // The database trigger will automatically update updated_at

    // Note: We'll update the session timestamp via the API
    // The actual update happens in the background and is not critical for loading

    // Set the session ID so notes can be loaded
    setLoadedSessionId(session.id)

    // Fetch session owner info if we have user_id
    if (session.user_id && clerkSession) {
      try {
        const token = await clerkSession.getToken({ template: 'supabase' })
        if (token) {
          const ownerResponse = await fetch(`/api/profile?id=${session.user_id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          if (ownerResponse.ok) {
            const ownerData = await ownerResponse.json()
            if (ownerData.data) {
              setSessionOwner({
                username: ownerData.data.username || 'Unknown',
                avatar_url: ownerData.data.avatar_url || null,
                user_id: session.user_id
              })
            }
          }
        }
      } catch (error) {
        console.error('Error fetching session owner:', error)
      }
    }

    // Set the search fields
    if (session.team1_name) {
      setTeam1(session.team1_name)
      setTeam1Id(session.team1_id || null)
      if (session.team1_id) {
        getTeamLogoUrl(session.team1_id).then(logo => setTeam1Logo(logo))
      }
    }
    if (session.team2_name) {
      setTeam2(session.team2_name)
      setTeam2Id(session.team2_id || null)
      if (session.team2_id) {
        getTeamLogoUrl(session.team2_id).then(logo => setTeam2Logo(logo))
      }
    }
    if (session.tournament) {
      setTournament(session.tournament)
    }
    if (session.player_name) {
      setPlayerName(session.player_name)
    }

    // Set the matches data directly
    if (session.matches_data && Array.isArray(session.matches_data)) {
      setMatchesData({
        matches: session.matches_data,
        totalMatches: session.matches_data.length,
        fetchedMatches: session.matches_data.length,
        matchesWithVODs: session.matches_data.filter((m: any) => m.hasVODs).length
      })
      setHasSubmitted(true)
      setShowScene(true)
    }
  }

  const handleTeam1Change = (value: string, teamId?: string, logo?: string) => {
    setTeam1(value)
    setTeam1Id(teamId || null)
    setTeam1Logo(logo || null)
    // Clear team2 if it's the same team
    if (value === team2) {
      setTeam2('')
      setTeam2Id(null)
      setTeam2Logo(null)
    }
  }

  const handleTeam2Change = (value: string, teamId?: string, logo?: string) => {
    setTeam2(value)
    setTeam2Id(teamId || null)
    setTeam2Logo(logo || null)
    // Clear team1 if it's the same team
    if (value === team1) {
      setTeam1('')
      setTeam1Id(null)
      setTeam1Logo(null)
    }
  }

  const handlePlayerNameChange = (value: string, id?: string) => {
    setPlayerName(value)
    setPlayerId(id || null)
    // Don't clear teams - allow filtering player matches by teams
  }

  // Helper function to fetch from VLR.gg autocomplete API via our proxy
  const fetchVLRResults = async (query: string) => {
    if (!query.trim()) return []

    const cacheKey = getCacheKey('vlr:search', query.toLowerCase())

    // Try cache first
    const cached = getCached<any[]>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await fetch(
        `/api/vlr-search?term=${encodeURIComponent(query)}`
      )
      if (!response.ok) return []

      const data = await response.json()
      // Cache the result
      setCached(cacheKey, data || [], 1800) // 30 minutes (same as server cache)
      return data || []
    } catch (error) {
      console.error('Error fetching from VLR.gg:', error)
      return []
    }
  }

  // Extract team ID from search result path (e.g., /search/r/team/2593/ac -> 2593)
  const extractTeamId = (path: string): string | null => {
    const match = path.match(/\/search\/r\/team\/(\d+)\//)
    return match ? match[1] : null
  }

  // Get team logo URL from team ID - fetch from API
  const getTeamLogoUrl = async (teamId: string): Promise<string | null> => {
    try {
      const cacheKey = getCacheKey('vlr:team-logo', teamId)
      const cached = getCached<string | null>(cacheKey)
      if (cached !== null) {
        return cached
      }

      const response = await fetch(`/api/vlr-team-logo?teamId=${encodeURIComponent(teamId)}`)
      if (!response.ok) return null

      const data = await response.json()
      const logoUrl = data.logo || null

      // Cache for 1 hour
      if (logoUrl) {
        setCached(cacheKey, logoUrl, 3600)
      }

      return logoUrl
    } catch (error) {
      console.error('Error fetching team logo:', error)
      return null
    }
  }

  // Extract player ID from search result path (e.g., /search/r/player/881/yay -> 881)
  const extractPlayerId = (path: string): string | null => {
    const match = path.match(/\/search\/r\/player\/(\d+)\//)
    return match ? match[1] : null
  }

  // Search functions using VLR.gg API - now returns objects with name, id, and logo
  const searchTeam1 = async (query: string): Promise<Array<{ name: string; id: string; logo?: string }>> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []

    // Find the index of the "teams" category header
    const teamsIndex = results.findIndex((item: any) => item.value === 'teams' && item.id === '#')
    if (teamsIndex === -1) return []

    // Get all items after the teams header until the next category or end
    const teamsToFetch: Array<{ name: string; id: string }> = []
    const seenNames = new Set<string>()

    for (let i = teamsIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add team names (items with id starting with /search/r/team/)
      if (item.id && item.id.startsWith('/search/r/team/') && item.value) {
        const teamId = extractTeamId(item.id)
        if (teamId && !seenNames.has(item.value)) {
          teamsToFetch.push({
            name: item.value,
            id: teamId
          })
          seenNames.add(item.value)
        }
      }
    }

    // Fetch logos in parallel
    const teamsWithLogos = await Promise.all(teamsToFetch.map(async (team) => {
      const logo = await getTeamLogoUrl(team.id)
      return {
        ...team,
        logo: logo || undefined
      }
    }))

    return teamsWithLogos
  }

  const searchTeam2 = async (query: string): Promise<Array<{ name: string; id: string; logo?: string }>> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []

    // Find the index of the "teams" category header
    const teamsIndex = results.findIndex((item: any) => item.value === 'teams' && item.id === '#')
    if (teamsIndex === -1) return []

    // Get all items after the teams header until the next category or end
    const teamsToFetch: Array<{ name: string; id: string }> = []
    const seenNames = new Set<string>()

    for (let i = teamsIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add team names (items with id starting with /search/r/team/)
      if (item.id && item.id.startsWith('/search/r/team/') && item.value) {
        const teamId = extractTeamId(item.id)
        if (teamId && !seenNames.has(item.value)) {
          teamsToFetch.push({
            name: item.value,
            id: teamId
          })
          seenNames.add(item.value)
        }
      }
    }

    // Fetch logos in parallel
    const teamsWithLogos = await Promise.all(teamsToFetch.map(async (team) => {
      const logo = await getTeamLogoUrl(team.id)
      return {
        ...team,
        logo: logo || undefined
      }
    }))

    return teamsWithLogos
  }

  const searchTournaments = async (query: string): Promise<string[]> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []

    // Find the index of the "events" category header
    const eventsIndex = results.findIndex((item: any) => item.value === 'events' && item.id === '#')
    if (eventsIndex === -1) return []

    // Get all items after the events header until the next category or end
    const tournaments: string[] = []
    for (let i = eventsIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add tournament names (items with id starting with /search/r/event/)
      if (item.id && item.id.startsWith('/search/r/event/') && item.value) {
        tournaments.push(item.value)
      }
    }

    // Remove duplicates
    return Array.from(new Set(tournaments))
  }

  const searchPlayerName = async (query: string): Promise<Array<{ name: string; id: string }>> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []

    // Find the index of the "players" category header
    const playersIndex = results.findIndex((item: any) => item.value === 'players' && item.id === '#')
    if (playersIndex === -1) return []

    // Get all items after the players header until the next category or end
    const players: Array<{ name: string; id: string }> = []
    const seenNames = new Set<string>()

    for (let i = playersIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add player names (items with id starting with /search/r/player/)
      if (item.id && item.id.startsWith('/search/r/player/') && item.value) {
        const playerId = extractPlayerId(item.id)
        if (playerId && !seenNames.has(item.value)) {
          players.push({ name: item.value, id: playerId })
          seenNames.add(item.value)
        }
      }
    }

    return players
  }

  const fetchMatches = useCallback(async (limitOverride?: number) => {
    const effectiveLimit = limitOverride ?? matchLimit

    if (!(team1 || team2 || tournament || playerName)) {
      return
    }

    setIsLoading(true)
    const limitKey = `limit:${effectiveLimit}`

    try {
      if (playerName && playerId) {
        let queryParams = `playerId=${playerId}&playerName=${encodeURIComponent(playerName)}&limit=${effectiveLimit}`

        if (team1 && team2) {
          queryParams += `&team1Name=${encodeURIComponent(team1)}&team2Name=${encodeURIComponent(team2)}`
        }

        const cacheKey = team1 && team2
          ? getCacheKey('vlr:player-matches', playerId, playerName.toLowerCase(), team1.toLowerCase(), team2.toLowerCase(), limitKey)
          : getCacheKey('vlr:player-matches', playerId, playerName.toLowerCase(), limitKey)

        const cached = getCached<any>(cacheKey)
        if (cached) {
          console.log('Player matches data from cache:', cached)
          setMatchesData(cached)
          console.log(`Found ${cached.totalMatches} total matches`)
          console.log(`Fetched ${cached.fetchedMatches} matches`)
          console.log(`${cached.matchesWithVODs} matches have VOD links`)
          if (cached.latestMatch && cached.latestMatch.vodLinks) {
            console.log('Latest match VODs:', cached.latestMatch.vodLinks)
          }
          return
        }

        const response = await fetch(`/api/vlr-player-matches?${queryParams}&_t=${Date.now()}`)
        if (response.ok) {
          const data = await response.json()
          setCached(cacheKey, data, 3600)
          console.log('Player matches data:', data)
          setMatchesData(data)
          console.log(`Found ${data.totalMatches} total matches (limit ${data.requestedLimit ?? effectiveLimit})`)
          console.log(`Fetched ${data.fetchedMatches} matches`)
          console.log(`${data.matchesWithVODs} matches have VOD links`)
          if (data.latestMatch && data.latestMatch.vodLinks) {
            console.log('Latest match VODs:', data.latestMatch.vodLinks)
          }
        }

        return
      }

      if (team1 && team1Id && !playerName) {
        let queryParams = `teamId=${team1Id}&teamName=${encodeURIComponent(team1)}&limit=${effectiveLimit}`

        if (team2 && team2Id) {
          queryParams += `&team2Id=${team2Id}&team2Name=${encodeURIComponent(team2)}`
        }

        const cacheKey = getCacheKey(
          'vlr:team-matches',
          team1Id,
          team1.toLowerCase(),
          team2Id || 'none',
          team2 ? team2.toLowerCase() : 'none',
          limitKey
        )

        const cached = getCached<any>(cacheKey)
        if (cached) {
          console.log('Team matches data from cache:', cached)
          setMatchesData(cached)
          console.log(`Found ${cached.totalMatches} total matches (limit ${cached.requestedLimit ?? effectiveLimit})`)
          console.log(`Fetched ${cached.fetchedMatches} matches`)
          console.log(`${cached.matchesWithVODs} matches have VOD links`)
          return
        }

        const response = await fetch(`/api/vlr-team-matches?${queryParams}`)
        if (response.ok) {
          const data = await response.json()
          setCached(cacheKey, data, 3600)
          console.log('Team matches data:', data)
          setMatchesData(data)
          console.log(`Found ${data.totalMatches} total matches (limit ${data.requestedLimit ?? effectiveLimit})`)
          console.log(`Fetched ${data.fetchedMatches} matches`)
          console.log(`${data.matchesWithVODs} matches have VOD links`)
          data.matches.forEach((match: any) => {
            if (match.hasVODs) {
              console.log(`Match ${match.matchId}:`, match.vodLinks)
            }
          })
        }
      }
    } catch (error) {
      console.error('Error fetching matches:', error)
    } finally {
      setIsLoading(false)
    }
  }, [matchLimit, playerId, playerName, team1, team1Id, team2, team2Id, tournament])

  const { openSignIn } = useClerk()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      openSignIn()
      return
    }

    if (team1 || team2 || tournament || playerName) {
      setHasSubmitted(true)
      await fetchMatches()

      setShowScene(true)

      if (!team1 || !team1Id) {
        setTimeout(() => {
          setIsLoading(false)
        }, 1000)
      }
    }
  }

  const handleMatchLimitChange = useCallback(async (newLimit: number) => {
    if (newLimit === matchLimit) {
      return
    }
    setMatchLimit(newLimit)
    if (hasSubmitted) {
      await fetchMatches(newLimit)
    }
  }, [fetchMatches, hasSubmitted, matchLimit])

  // Handle when all thumbnails are loaded
  const handleAllThumbnailsLoaded = () => {
    setIsLoading(false)
  }

  // Also handle case where matchesData is set but has no matches
  useEffect(() => {
    if (matchesData && (!matchesData.matches || matchesData.matches.length === 0)) {
      // If matches data is loaded but empty, hide loading after a short delay
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [matchesData])

  return (
    <>
      <Head>
        <title>tree of vods</title>
        <meta name="description" content="3D interactive UI built with React Three Fiber" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="relative w-full h-screen overflow-hidden bg-gray-100">
        <Sidebar
          onLoadSession={handleLoadSession}
          onShowMeta={() => setShowMeta(true)}
          onLogoClick={handleLogoClick}
        />

        {/* Search bar - centered initially, moves to bottom after submission */}
        {!showMeta && (
          <motion.div
            initial={{ top: '50%', bottom: 'auto', y: '-50%' }}
            animate={
              hasSubmitted
                ? { top: 'auto', bottom: '0', y: '0%' }
                : { top: '50%', bottom: 'auto', y: '-50%' }
            }
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 right-0 flex flex-col items-center justify-center z-50 pl-20"
            style={{ paddingBottom: hasSubmitted ? '2rem' : '0' }}
          >
            {/* Heading - only visible before submission */}
            <AnimatePresence>
              {!hasSubmitted && (
                <motion.h1
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="text-4xl md:text-5xl font-bold text-black mb-8 text-center"
                >
                  What would you like to analyze today?
                </motion.h1>
              )}
            </AnimatePresence>

            <div className="w-full max-w-6xl px-4">
              <form onSubmit={handleSubmit} className="relative flex items-center gap-2 flex-wrap">
                {/* Left button */}
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors flex-shrink-0"
                  aria-label="Options"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="4" cy="4" r="1.5" fill="#666" />
                    <circle cx="12" cy="4" r="1.5" fill="#666" />
                    <circle cx="4" cy="12" r="1.5" fill="#666" />
                    <circle cx="12" cy="12" r="1.5" fill="#666" />
                  </svg>
                </button>

                {/* Searchable Selects */}
                <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
                  <SearchableSelect
                    placeholder="Team 1"
                    value={team1}
                    onChange={handleTeam1Change}
                    onSearch={searchTeam1}
                    className="flex-1 min-w-[150px]"
                    showLogo={true}
                    selectedLogo={team1Logo}
                  />

                  {/* VS Divider */}
                  <AnimatePresence>
                    {(team1 || team2) && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center justify-center px-3 py-1.5 rounded-lg bg-gradient-to-r from-gray-800 to-gray-900 text-white font-bold text-sm shadow-md flex-shrink-0"
                      >
                        <span className="tracking-wider">VS</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <SearchableSelect
                    placeholder="Team 2 (optional)"
                    value={team2}
                    onChange={handleTeam2Change}
                    onSearch={searchTeam2}
                    className="flex-1 min-w-[150px]"
                    showLogo={true}
                    selectedLogo={team2Logo}
                  />
                  <SearchableSelect
                    placeholder="Tournament (optional)"
                    value={tournament}
                    onChange={setTournament}
                    onSearch={searchTournaments}
                    className="flex-1 min-w-[150px]"
                    disabled={true}
                  />
                  <SearchableSelect
                    placeholder="Player Name"
                    value={playerName}
                    onChange={handlePlayerNameChange}
                    onSearch={searchPlayerName}
                    className="flex-1 min-w-[150px]"
                  />
                </div>

                {/* Right buttons */}
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors flex-shrink-0"
                  aria-label="Add"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3V13M3 8H13" stroke="#666" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  type="submit"
                  disabled={!team1 && !team2 && !tournament && !playerName}
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  aria-label="Submit"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 8L13 8M10 5L13 8L10 11" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* Loading state */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{
                type: 'spring',
                damping: 25,
                stiffness: 200,
                duration: 0.5
              }}
              className="fixed inset-0 flex items-center justify-center z-40 bg-gray-100"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 max-w-4xl w-full mx-4"
              >
                <AILoadingState />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Meta Analysis - shows when Meta icon is clicked */}
        {showMeta && <MetaAnalysis onClose={() => setShowMeta(false)} />}

        {/* Match Scene 3D - shows when matches are loaded */}
        {!showMeta && matchesData && matchesData.matches && matchesData.matches.length > 0 && (
          <MatchScene3D
            matches={matchesData.matches}
            team1Name={team1}
            team1Id={team1Id || undefined}
            team2Name={team2}
            team2Id={team2Id || undefined}
            tournament={tournament}
            playerName={playerName}
            initialSessionId={loadedSessionId}
            onAllThumbnailsLoaded={handleAllThumbnailsLoaded}
            sessionOwner={sessionOwner}
            matchLimit={matchLimit}
            onMatchLimitChange={handleMatchLimitChange}
            isFetchingMatches={isLoading}
          />
        )}

        {/* Scene - shows when ready */}
        {showScene && (
          <Suspense fallback={
            <div className="fixed inset-0 flex items-center justify-center z-30 bg-gray-100">
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 max-w-4xl w-full mx-4">
                <AILoadingState />
              </div>
            </div>
          }>
            <Scene />
          </Suspense>
        )}
      </main>
    </>
  )
}

