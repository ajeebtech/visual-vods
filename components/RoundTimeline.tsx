'use client'

import { motion } from 'framer-motion'
import { Play } from 'lucide-react'

interface Round {
    round: number
    start: number
    end: number
    duration: number
}

interface RoundTimelineProps {
    rounds: Round[]
    onRoundClick: (startTime: number) => void
    currentTime?: number
    videoDuration?: number
}

export default function RoundTimeline({
    rounds,
    onRoundClick,
    currentTime = 0,
    videoDuration = 0
}: RoundTimelineProps) {
    if (!rounds || rounds.length === 0) {
        return null
    }

    // Calculate total duration from rounds
    const totalDuration = videoDuration || Math.max(...rounds.map(r => r.end))

    return (
        <div className="w-full bg-gray-900/90 backdrop-blur-sm rounded-lg p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                    Rounds ({rounds.length})
                </h3>
                <p className="text-xs text-gray-400">
                    Click to jump to round
                </p>
            </div>

            {/* Timeline */}
            <div className="relative h-12 bg-gray-800 rounded-lg overflow-hidden">
                {/* Round segments */}
                {rounds.map((round, index) => {
                    const startPercent = (round.start / totalDuration) * 100
                    const widthPercent = ((round.end - round.start) / totalDuration) * 100
                    const isActive = currentTime >= round.start && currentTime <= round.end

                    return (
                        <motion.button
                            key={round.round}
                            onClick={() => onRoundClick(round.start)}
                            className={`absolute top-0 h-full border-r border-gray-900 group transition-all ${isActive
                                    ? 'bg-purple-600 z-10'
                                    : 'bg-purple-500/60 hover:bg-purple-500'
                                }`}
                            style={{
                                left: `${startPercent}%`,
                                width: `${widthPercent}%`,
                            }}
                            whileHover={{ scale: 1.05, zIndex: 20 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {/* Round number */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                    R{round.round}
                                </span>
                            </div>

                            {/* Hover tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <div className="bg-black/90 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                    <div className="font-semibold">Round {round.round}</div>
                                    <div className="text-gray-300">
                                        {formatTime(round.start)} - {formatTime(round.end)}
                                    </div>
                                    <div className="text-gray-400">
                                        {formatDuration(round.duration)}
                                    </div>
                                </div>
                                {/* Arrow */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                                    <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/90" />
                                </div>
                            </div>
                        </motion.button>
                    )
                })}

                {/* Current time indicator */}
                {currentTime > 0 && (
                    <motion.div
                        className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none"
                        style={{
                            left: `${(currentTime / totalDuration) * 100}%`,
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                    >
                        {/* Playhead */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg" />
                    </motion.div>
                )}
            </div>

            {/* Round list */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {rounds.map((round) => {
                    const isActive = currentTime >= round.start && currentTime <= round.end

                    return (
                        <motion.button
                            key={round.round}
                            onClick={() => onRoundClick(round.start)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${isActive
                                    ? 'bg-purple-600 text-white shadow-lg'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <div className="flex items-center gap-1.5">
                                <Play className="w-3 h-3" />
                                <span>Round {round.round}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                                {formatTime(round.start)}
                            </div>
                        </motion.button>
                    )
                })}
            </div>
        </div>
    )
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}m ${secs}s`
}
