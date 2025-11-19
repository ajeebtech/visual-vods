import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { motion, AnimatePresence } from 'framer-motion'
import AILoadingState from '@/components/kokonutui/ai-loading'
import SearchableSelect from '@/components/SearchableSelect'

// Dynamically import Scene to avoid SSR issues with Three.js
const Scene = dynamic(() => import('../components/Scene'), {
  ssr: false,
})
//i
import Sidebar from '@/components/Sidebar'

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [showScene, setShowScene] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  
  // Search state
  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [tournament, setTournament] = useState('')
  const [playerName, setPlayerName] = useState('')

  // Clear player name when team1 or team2 is set
  const handleTeam1Change = (value: string) => {
    setTeam1(value)
    if (value) {
      setPlayerName('') // Clear player name when team is selected
    }
  }

  const handleTeam2Change = (value: string) => {
    setTeam2(value)
    if (value) {
      setPlayerName('') // Clear player name when team is selected
    }
  }

  // Helper function to fetch from VLR.gg autocomplete API via our proxy
  const fetchVLRResults = async (query: string) => {
    if (!query.trim()) return []
    
    try {
      const response = await fetch(
        `/api/vlr-search?term=${encodeURIComponent(query)}`
      )
      if (!response.ok) return []
      
      const data = await response.json()
      return data || []
    } catch (error) {
      console.error('Error fetching from VLR.gg:', error)
      return []
    }
  }

  // Search functions using VLR.gg API
  const searchTeam1 = async (query: string): Promise<string[]> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []
    
    // Find the index of the "teams" category header
    const teamsIndex = results.findIndex((item: any) => item.value === 'teams' && item.id === '#')
    if (teamsIndex === -1) return []
    
    // Get all items after the teams header until the next category or end
    const teams: string[] = []
    for (let i = teamsIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add team names (items with id starting with /search/r/team/)
      if (item.id && item.id.startsWith('/search/r/team/') && item.value) {
        teams.push(item.value)
      }
    }
    
    // Remove duplicates
    return Array.from(new Set(teams))
  }

  const searchTeam2 = async (query: string): Promise<string[]> => {
    const results = await fetchVLRResults(query)
    if (!results.length) return []
    
    // Find the index of the "teams" category header
    const teamsIndex = results.findIndex((item: any) => item.value === 'teams' && item.id === '#')
    if (teamsIndex === -1) return []
    
    // Get all items after the teams header until the next category or end
    const teams: string[] = []
    for (let i = teamsIndex + 1; i < results.length; i++) {
      const item = results[i]
      // Stop if we hit another category header
      if (item.id === '#') break
      // Add team names (items with id starting with /search/r/team/)
      if (item.id && item.id.startsWith('/search/r/team/') && item.value) {
        teams.push(item.value)
      }
    }
    
    // Remove duplicates
    return Array.from(new Set(teams))
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Check if at least one field has a value
    if (team1 || team2 || tournament || playerName) {
      setHasSubmitted(true)
      setIsLoading(true)
      // Longer delay to show loading, then show scene
      setTimeout(() => {
        setShowScene(true)
        setIsLoading(false)
      }, 5000) // 5 seconds
    }
  }

  return (
    <>
      <Head>
        <title>tree of vods</title>
        <meta name="description" content="3D interactive UI built with React Three Fiber" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="relative w-full h-screen overflow-hidden bg-gray-100">
        <Sidebar />

        {/* Search bar - centered initially, moves to bottom after submission */}
        <motion.div
          initial={{ top: '50%', bottom: 'auto', transform: 'translateY(-50%)' }}
          animate={
            hasSubmitted
              ? { top: 'auto', bottom: '0', transform: 'translateY(0)' }
              : { top: '50%', bottom: 'auto', transform: 'translateY(-50%)' }
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
                  placeholder="Team 2"
                  value={team2}
                  onChange={handleTeam2Change}
                  onSearch={searchTeam2}
                  className="flex-1 min-w-[150px]"
                />
                <SearchableSelect
                  placeholder="Tournament"
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

