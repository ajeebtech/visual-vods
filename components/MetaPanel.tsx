import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, BarChart3 } from 'lucide-react'

interface MetaPanelProps {
  onClose: () => void
}

interface AgentCount {
  agent: string
  page1Count: number
  page2Count: number
  difference: number
}

interface MetaData {
  agentCounts: AgentCount[]
  totalMatchesPage1: number
  totalMatchesPage2: number
}

export default function MetaPanel({ onClose }: MetaPanelProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [metaData, setMetaData] = useState<MetaData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchMatchData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch meta data from the aggregated API
      const response = await fetch('/api/vlr-meta')

      if (!response.ok) {
        throw new Error('Failed to fetch meta data')
      }

      const data = await response.json()

      setMetaData(data)
    } catch (err: any) {
      console.error('Error fetching meta data:', err)
      setError(err.message || 'Failed to load meta data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMatchData()
  }, [])


  return (
    <motion.div
      initial={{ x: 450, y: 650, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      exit={{ x: 450, y: 650, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      drag
      dragConstraints={{ left: 0, top: 0, right: 200, bottom: 200 }}
      dragElastic={0.1}
      onDragEnd={(event, info) => {
        if (info.offset.x > 150 || info.offset.y > 150) {
          onClose()
        }
      }}
      className="fixed w-[800px] h-[700px] bg-white rounded-3xl shadow-xl z-[9999] flex flex-col border border-gray-200 cursor-grab active:cursor-grabbing"
      style={{ bottom: '24px', right: '40px' }}
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <h2 className="text-gray-900 font-medium text-lg">Meta Analysis</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading match data...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchMatchData}
              className="mt-2 text-sm text-red-700 underline"
            >
              Retry
            </button>
          </div>
        )}

        {metaData && !isLoading && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Agent Usage Comparison</h3>
                <div className="text-xs text-gray-500">
                  Page 1: {metaData.totalMatchesPage1} matches • Page 2: {metaData.totalMatchesPage2} matches
                </div>
              </div>

              {metaData.agentCounts.length > 0 ? (
                <div className="space-y-3">
                  {metaData.agentCounts.map((agentData) => (
                    <div
                      key={agentData.agent}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <img
                          src={`https://www.vlr.gg/img/vlr/game/agents/${agentData.agent}.png`}
                          alt={agentData.agent}
                          className="w-8 h-8"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                        <span className="text-sm font-medium text-gray-900 capitalize min-w-[100px]">
                          {agentData.agent}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-xs text-gray-500">Page 1</div>
                          <div className="text-sm font-semibold text-gray-700">{agentData.page1Count}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-500">Page 2</div>
                          <div className="text-sm font-semibold text-gray-700">{agentData.page2Count}</div>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <div className="text-xs text-gray-500">Diff</div>
                          <div
                            className={`text-sm font-semibold ${
                              agentData.difference > 0
                                ? 'text-green-600'
                                : agentData.difference < 0
                                ? 'text-red-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {agentData.difference > 0 ? '+' : ''}
                            {agentData.difference}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-2">No agent data found</p>
                  <p className="text-xs text-gray-400">Parsing match details...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

