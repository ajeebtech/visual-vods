import { useState, useEffect } from 'react'
import { Loader2, BarChart3, ArrowLeft } from 'lucide-react'

interface MetaAnalysisProps {
  onClose?: () => void
}

interface AgentCount {
  agent: string
  page1Count: number
  page2Count: number
  difference: number
}

interface MapData {
  mapName: string
  page1Count: number
  page2Count: number
  difference: number
}

interface MetaData {
  agentCounts: AgentCount[]
  mapData: MapData[]
  totalMatchesPage1: number
  totalMatchesPage2: number
}

export default function MetaAnalysis({ onClose }: MetaAnalysisProps = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [metaData, setMetaData] = useState<MetaData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchMatchData = async () => {
    setIsLoading(true)
    setError(null)

    try {
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
    <div className="fixed inset-0 bg-gray-100 z-30 overflow-y-auto">
      <div className="container mx-auto px-8 py-8 max-w-7xl ml-24">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Go back"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
              )}
              <BarChart3 className="w-6 h-6 text-gray-600" />
              <h1 className="text-2xl font-bold text-gray-900">Meta Analysis</h1>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 animate-spin text-gray-400 mb-4" />
              <p className="text-sm text-gray-500">Loading match data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl shadow-lg p-6 mb-6">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button
              onClick={fetchMatchData}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Meta Data */}
        {metaData && !isLoading && (
          <div className="grid grid-cols-12 gap-6">
            {/* Map Stats - Left Side */}
            <div className="col-span-3">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Map Stats</h2>
                {metaData.mapData && metaData.mapData.length > 0 ? (
                  <div className="space-y-2">
                    {metaData.mapData.map((map) => {
                      const isPositive = map.difference > 0
                      const isNegative = map.difference < 0
                      const hasChange = map.difference !== 0
                      
                      return (
                        <div
                          key={map.mapName}
                          className={`p-3 rounded-lg border transition-all ${
                            isPositive
                              ? 'border-green-200 bg-green-50/50'
                              : isNegative
                              ? 'border-red-200 bg-red-50/50'
                              : 'border-gray-200 bg-gray-50/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-900">{map.mapName}</span>
                            {hasChange && (
                              <span
                                className={`text-xs font-bold ${
                                  isPositive ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {isPositive ? '+' : ''}
                                {map.difference}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No map data available</p>
                )}
              </div>
            </div>

            {/* Agent Grid - Right Side */}
            <div className="col-span-9">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Agents</h2>
                {metaData.agentCounts.length > 0 ? (
                  <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {metaData.agentCounts.map((agentData) => {
                      const isPositive = agentData.difference > 0
                      const isNegative = agentData.difference < 0
                      const hasChange = agentData.difference !== 0
                      
                      return (
                        <div
                          key={agentData.agent}
                          className={`relative p-2 rounded-lg border-2 transition-all hover:shadow-md ${
                            isPositive
                              ? 'border-green-200 bg-green-50/50'
                              : isNegative
                              ? 'border-red-200 bg-red-50/50'
                              : 'border-gray-200 bg-gray-50/50'
                          }`}
                        >
                          {/* Trend Icon Overlay */}
                          {hasChange && (
                            <div className="absolute top-1 right-1">
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                  isPositive
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-red-100 text-red-600'
                                }`}
                              >
                                <span className="text-xs font-bold">
                                  {isPositive ? '↑' : '↓'}
                                </span>
                              </div>
                            </div>
                          )}
                          
                          {/* Agent Image */}
                          <div className="flex flex-col items-center">
                            <img
                              src={`https://www.vlr.gg/img/vlr/game/agents/${agentData.agent}.png`}
                              alt={agentData.agent}
                              className="w-12 h-12 mb-1"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                            <span className="text-xs font-medium text-gray-900 capitalize text-center leading-tight">
                              {agentData.agent}
                            </span>
                            {hasChange && (
                              <span
                                className={`text-xs font-bold mt-1 ${
                                  isPositive ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {isPositive ? '+' : ''}
                                {agentData.difference}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-sm text-gray-500 mb-2">No agent data found</p>
                    <p className="text-xs text-gray-400">Parsing match details...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

