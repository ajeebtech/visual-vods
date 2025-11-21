import { Suspense, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { motion, AnimatePresence } from 'framer-motion'
import AILoadingState from '@/components/kokonutui/ai-loading'
import SearchableSelect from '@/components/SearchableSelect'
import { getCached, setCached, getCacheKey } from '@/lib/local-cache'

// Dynamically import Scene to avoid SSR issues with Three.js
const Scene = dynamic(() => import('../components/Scene'), {
  ssr: false,
})
//i
import Sidebar from '@/components/Sidebar'
import MatchScene3D from '@/components/MatchScene3D'

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
  
  // Store matches data
  const [matchesData, setMatchesData] = useState<any>(null)

  // Store the loaded session ID
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null)

  // Handle loading a session from history
  const handleLoadSession = async (session: any) => {
    // Update session's updated_at timestamp to move it to recently visited
    // This will be handled by the API when we make the PUT request
    // The database trigger will automatically update updated_at
    
    // Note: We'll update the session timestamp via the API
    // The actual update happens in the background and is not critical for loading

    // Set the session ID so notes can be loaded
    setLoadedSessionId(session.id)

    // Set the search fields
    if (session.team1_name) {
      setTeam1(session.team1_name)
      setTeam1Id(session.team1_id || null)
    }
    if (session.team2_name) {
      setTeam2(session.team2_name)
      setTeam2Id(session.team2_id || null)
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

  // Clear player name when team1 or team2 is set
  const handleTeam1Change = (value: string, teamId?: string) => {
    setTeam1(value)
    setTeam1Id(teamId || null)
    if (value) {
      setPlayerName('') // Clear player name when team is selected
    }
  }

  const handleTeam2Change = (value: string, teamId?: string) => {
    setTeam2(value)
    setTeam2Id(teamId || null)
    if (value) {
      setPlayerName('') // Clear player name when team is selected
    }
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

  // Search functions using VLR.gg API - now returns objects with name and id
  const searchTeam1 = async (query: string): Promise<Array<{ name: string; id: string }>> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []
    
    // Find the index of the "teams" category header
    const teamsIndex = results.findIndex((item: any) => item.value === 'teams' && item.id === '#')
    if (teamsIndex === -1) return []
    
    // Get all items after the teams header until the next category or end
    const teams: Array<{ name: string; id: string }> = []
    const seenNames = new Set<string>()
    
    for (let i = teamsIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add team names (items with id starting with /search/r/team/)
      if (item.id && item.id.startsWith('/search/r/team/') && item.value) {
        const teamId = extractTeamId(item.id)
        if (teamId && !seenNames.has(item.value)) {
          teams.push({ name: item.value, id: teamId })
          seenNames.add(item.value)
      }
    }
    }
    
    return teams
  }

  const searchTeam2 = async (query: string): Promise<Array<{ name: string; id: string }>> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []
    
    // Find the index of the "teams" category header
    const teamsIndex = results.findIndex((item: any) => item.value === 'teams' && item.id === '#')
    if (teamsIndex === -1) return []
    
    // Get all items after the teams header until the next category or end
    const teams: Array<{ name: string; id: string }> = []
    const seenNames = new Set<string>()
    
    for (let i = teamsIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add team names (items with id starting with /search/r/team/)
      if (item.id && item.id.startsWith('/search/r/team/') && item.value) {
        const teamId = extractTeamId(item.id)
        if (teamId && !seenNames.has(item.value)) {
          teams.push({ name: item.value, id: teamId })
          seenNames.add(item.value)
      }
    }
    }
    
    return teams
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

  const searchPlayerName = async (query: string): Promise<string[]> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []
    
    // Find the index of the "players" category header
    const playersIndex = results.findIndex((item: any) => item.value === 'players' && item.id === '#')
    if (playersIndex === -1) return []
    
    // Get all items after the players header until the next category or end
    const players: string[] = []
    for (let i = playersIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add player names (items with id starting with /search/r/player/)
      if (item.id && item.id.startsWith('/search/r/player/') && item.value) {
        players.push(item.value)
      }
    }
    
    // Remove duplicates
    return Array.from(new Set(players))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Check if at least one field has a value
    if (team1 || team2 || tournament || playerName) {
      setHasSubmitted(true)
      setIsLoading(true)
      
      // If team1 is selected, fetch team matches
      if (team1 && team1Id) {
        try {
          // Build query parameters
          let queryParams = `teamId=${team1Id}&teamName=${encodeURIComponent(team1)}`
          
          // If team2 is also provided, add it to filter matches between the two teams
          if (team2 && team2Id) {
            queryParams += `&team2Id=${team2Id}&team2Name=${encodeURIComponent(team2)}`
          }
          
          // Build cache key
          const cacheKey = getCacheKey('vlr:team-matches', team1Id, team1.toLowerCase(), team2Id || 'none', team2 ? team2.toLowerCase() : 'none')
          
          // Try cache first
          const cached = getCached<any>(cacheKey)
          if (cached) {
            console.log('Team matches data from cache:', cached)
            setMatchesData(cached)
            console.log(`Found ${cached.totalMatches} total matches`)
            console.log(`Fetched ${cached.fetchedMatches} matches`)
            console.log(`${cached.matchesWithVODs} matches have VOD links`)
            return
          }
          
          const response = await fetch(`/api/vlr-team-matches?${queryParams}`)
          if (response.ok) {
            const data = await response.json()
            // Cache the result
            setCached(cacheKey, data, 3600) // 1 hour (same as server cache)
            console.log('Team matches data:', data)
            setMatchesData(data)
            
            // Log summary
            console.log(`Found ${data.totalMatches} total matches`)
            console.log(`Fetched ${data.fetchedMatches} matches`)
            console.log(`${data.matchesWithVODs} matches have VOD links`)
            
            // Log matches with VODs
            data.matches.forEach((match: any) => {
              if (match.hasVODs) {
                console.log(`Match ${match.matchId}:`, match.vodLinks)
              }
            })
          }
        } catch (error) {
          console.error('Error fetching team matches:', error)
        }
      }
      
      // Show scene immediately - loading will be controlled by thumbnail loading
      setShowScene(true)
      
      // If no matches are returned, hide loading immediately
      // This will be handled after matchesData is set, but we also check here as a fallback
      if (!team1 || !team1Id) {
        // If no team1 is selected, there won't be matches, so hide loading
        setTimeout(() => {
          setIsLoading(false)
        }, 1000)
      }
    }
  }

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
        <Sidebar onLoadSession={handleLoadSession} />

        {/* Search bar - centered initially, moves to bottom after submission */}
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
                />
                <SearchableSelect
                  placeholder="Tournament (optional)"
                  value={tournament}
                  onChange={setTournament}
                  onSearch={searchTournaments}
                  className="flex-1 min-w-[150px]"
                />
                <SearchableSelect
                  placeholder="Player Name"
                  value={playerName}
                  onChange={setPlayerName}
                  onSearch={searchPlayerName}
                  className="flex-1 min-w-[150px]"
                  disabled={!!team1 || !!team2}
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

        {/* Match Scene 3D - shows when matches are loaded */}
        {matchesData && matchesData.matches && matchesData.matches.length > 0 && (
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

