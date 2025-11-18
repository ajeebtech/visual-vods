import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { motion, AnimatePresence } from 'framer-motion'
import AILoadingState from '@/components/kokonutui/ai-loading'

// Dynamically import Scene to avoid SSR issues with Three.js
const Scene = dynamic(() => import('../components/Scene'), {
  ssr: false,
})

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [showScene, setShowScene] = useState(false)
  const [prompt, setPrompt] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (prompt.trim()) {
      setIsLoading(true)
      // Longer delay to show loading, then show scene
      setTimeout(() => {
        setShowScene(true)
        setIsLoading(false)
      }, 5000) // 5 seconds
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && prompt.trim()) {
      setIsLoading(true)
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
        {/* Search bar - always visible at bottom */}
        <div className="fixed bottom-0 left-0 right-0 flex items-end justify-center pb-8 z-50">
          <div className="w-full max-w-3xl px-4">
            <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
              {/* Left button */}
              <button
                type="button"
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors"
                aria-label="Options"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="4" cy="4" r="1.5" fill="#666"/>
                  <circle cx="12" cy="4" r="1.5" fill="#666"/>
                  <circle cx="4" cy="12" r="1.5" fill="#666"/>
                  <circle cx="12" cy="12" r="1.5" fill="#666"/>
                </svg>
              </button>
              
              {/* Main input */}
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What do you want to see?"
                className="flex-1 h-10 px-4 rounded-lg bg-white border border-gray-300 text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                style={{ color: '#000000' }}
              />
              
              {/* Right buttons */}
              <button
                type="button"
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 transition-colors"
                aria-label="Add"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 3V13M3 8H13" stroke="#666" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors"
                aria-label="Submit"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 8L13 8M10 5L13 8L10 11" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </form>
          </div>
        </div>

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

