'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'

interface VODLink {
    url: string
    platform: 'youtube' | 'twitch' | 'other'
    embedUrl?: string
    mapName?: string
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
    date?: string
    vodLinks: VODLink[]
    hasVODs: boolean
    matchInfo?: MatchInfo
}

interface MatchListViewProps {
    matches: Match[]
    onMatchClick: (match: Match) => void
    matchesWithNotes: Set<string>
    searchedTeamName?: string
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

// Format date to human-readable format
const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown date'

    try {
        const date = new Date(dateString)
        const now = new Date()
        const diffTime = now.getTime() - date.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return 'Today'
        if (diffDays === 1) return 'Yesterday'
        if (diffDays < 7) return `${diffDays} days ago`
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
        return `${Math.floor(diffDays / 365)} years ago`
    } catch {
        return 'Unknown date'
    }
}

function MatchListItem({
    match,
    onClick,
    hasNotes,
    searchedTeamName,
}: {
    match: Match
    onClick: () => void
    hasNotes: boolean
    searchedTeamName?: string
}) {
    const [thumbnailLoaded, setThumbnailLoaded] = useState(false)
    const firstVOD = match.vodLinks[0]
    const thumbnail = getYouTubeThumbnail(firstVOD?.url || '')

    // Determine which team is the searched team
    const isTeam1Searched = searchedTeamName && match.matchInfo?.team1.name.toLowerCase().includes(searchedTeamName.toLowerCase())
    const isTeam2Searched = searchedTeamName && match.matchInfo?.team2.name.toLowerCase().includes(searchedTeamName.toLowerCase())

    // Determine colors based on searched team
    const team1Color = isTeam1Searched
        ? (match.matchInfo?.winner === 1 ? 'text-green-500' : 'text-red-500')
        : 'text-gray-900'
    const team2Color = isTeam2Searched
        ? (match.matchInfo?.winner === 2 ? 'text-green-500' : 'text-red-500')
        : 'text-gray-900'

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClick}
            className={`group flex gap-4 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-all border-2 ${hasNotes
                    ? 'border-orange-500 bg-orange-50/30'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
        >
            {/* Thumbnail */}
            <div className="flex-shrink-0 w-48 h-27 bg-gray-200 rounded-lg overflow-hidden relative">
                {thumbnail ? (
                    <>
                        <img
                            src={thumbnail}
                            alt="Match thumbnail"
                            className={`w-full h-full object-cover transition-opacity duration-300 ${thumbnailLoaded ? 'opacity-100' : 'opacity-0'
                                }`}
                            onLoad={() => setThumbnailLoaded(true)}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                                setThumbnailLoaded(true)
                            }}
                        />
                        {!thumbnailLoaded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-purple-600">
                                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-purple-800">
                        <svg
                            className="w-12 h-12 text-white/80"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                        </svg>
                    </div>
                )}
                {/* VOD count indicator */}
                {match.vodLinks.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                        {match.vodLinks.length} VODs
                    </div>
                )}
                {/* Notes indicator */}
                {hasNotes && (
                    <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs px-2 py-1 rounded font-medium">
                        Notes
                    </div>
                )}
            </div>

            {/* Match Info */}
            <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
                {/* Teams and Score */}
                <div>
                    {match.matchInfo ? (
                        <div className="flex items-center gap-3 mb-2">
                            {/* Team 1 */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                {match.matchInfo.team1.logo && (
                                    <img
                                        src={match.matchInfo.team1.logo}
                                        alt={match.matchInfo.team1.name}
                                        className="w-8 h-8 object-contain flex-shrink-0"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none'
                                        }}
                                    />
                                )}
                                <span className="font-semibold text-gray-900 truncate">
                                    {match.matchInfo.team1.name}
                                </span>
                            </div>

                            {/* Score */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-xl font-bold ${team1Color}`}>
                                    {match.matchInfo.score.team1}
                                </span>
                                <span className="text-gray-400">:</span>
                                <span className={`text-xl font-bold ${team2Color}`}>
                                    {match.matchInfo.score.team2}
                                </span>
                            </div>

                            {/* Team 2 */}
                            <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                                <span className="font-semibold text-gray-900 truncate">
                                    {match.matchInfo.team2.name}
                                </span>
                                {match.matchInfo.team2.logo && (
                                    <img
                                        src={match.matchInfo.team2.logo}
                                        alt={match.matchInfo.team2.name}
                                        className="w-8 h-8 object-contain flex-shrink-0"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none'
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm font-medium text-gray-900 mb-2">
                            Match {match.matchId || 'Unknown'}
                        </div>
                    )}

                    {/* Map names if multiple VODs */}
                    {match.vodLinks.length > 1 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                            {match.vodLinks.slice(0, 3).map((vod, idx) => (
                                <span
                                    key={idx}
                                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                                >
                                    {vod.mapName || `Map ${idx + 1}`}
                                </span>
                            ))}
                            {match.vodLinks.length > 3 && (
                                <span className="text-xs text-gray-500">
                                    +{match.vodLinks.length - 3} more
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Date */}
                <div className="text-xs text-gray-500 mt-auto">
                    {formatDate(match.date)}
                </div>
            </div>
        </motion.div>
    )
}

export default function MatchListView({
    matches,
    onMatchClick,
    matchesWithNotes,
    searchedTeamName,
}: MatchListViewProps) {
    return (
        <div className="fixed inset-0 z-30 bg-gray-50 pt-24 pb-20 pl-24">
            <div className="max-w-5xl mx-auto h-full">
                <ScrollArea className="h-full px-6">
                    <div className="space-y-3 pb-6">
                        {matches.length > 0 ? (
                            matches.map((match, index) => (
                                <MatchListItem
                                    key={match.matchId || index}
                                    match={match}
                                    onClick={() => onMatchClick(match)}
                                    hasNotes={matchesWithNotes.has(match.href)}
                                    searchedTeamName={searchedTeamName}
                                />
                            ))
                        ) : (
                            <div className="flex items-center justify-center h-64">
                                <p className="text-gray-500">No matches found</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    )
}
