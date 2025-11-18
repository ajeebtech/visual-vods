import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tooltip } from "@heroui/react"
import {
    Clock,
    Settings,
    Search,
    AlignLeft,
    ChevronDown,
    Library,
    Disc // Using Disc as a placeholder for the spiral icon if needed, or custom SVG
} from 'lucide-react'

// Custom Spiral Icon since Lucide might not have an exact match
const SpiralIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12 20.5c4.7 0 8.5-3.8 8.5-8.5 0-4.7-3.8-8.5-8.5-8.5-4.7 0-8.5 3.8-8.5 8.5 0 2.3.9 4.4 2.5 6" />
        <path d="M12 16.5c2.5 0 4.5-2 4.5-4.5 0-2.5-2-4.5-4.5-4.5-2.5 0-4.5 2-4.5 4.5 0 1.2.5 2.3 1.3 3.2" />
        <path d="M12 12.5c.3 0 .5-.2.5-.5 0-.3-.2-.5-.5-.5-.3 0-.5.2-.5.5 0 .3.2.5.5.5z" />
    </svg>
)

export default function Sidebar() {
    const [isExpanded, setIsExpanded] = useState(false)
    const sidebarRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
                setIsExpanded(false)
            }
        }

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isExpanded])

    return (
        <motion.div
            ref={sidebarRef}
            initial={{ width: '80px' }}
            animate={{ width: isExpanded ? '400px' : '80px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 h-full bg-white/80 backdrop-blur-xl border-r border-gray-200 z-50 flex flex-col overflow-hidden"
        >
            {/* Top Logo Area */}
            <div className="p-6 flex items-center gap-4">
                <div className="w-8 h-8 bg-gradient-to-br from-gray-200 to-gray-400 rounded-full flex-shrink-0 shadow-inner" />
                <AnimatePresence>
                    {isExpanded && (
                        <motion.h1
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="text-2xl font-bold text-black whitespace-nowrap"
                        >
                            My Spirals
                        </motion.h1>
                    )}
                </AnimatePresence>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 flex flex-col gap-8 px-6 mt-8">
                {/* Spiral Icon / Toggle */}
                <Tooltip
                    content="Spirals"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button
                        className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors group"
                    >
                        <SpiralIcon className="w-6 h-6 flex-shrink-0" />
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    Spirals
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

                {/* Library Icon */}
                <Tooltip
                    content="Library"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors">
                        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                            <div className="flex gap-1">
                                <div className="w-0.5 h-4 bg-current rounded-full" />
                                <div className="w-0.5 h-4 bg-current rounded-full" />
                                <div className="w-0.5 h-4 bg-current rounded-full" />
                            </div>
                        </div>
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    Library
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

                {/* History Icon */}
                <Tooltip
                    content="Spiral history"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors"
                    >
                        <Clock className="w-6 h-6 flex-shrink-0" />
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    History
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

                {/* Expanded Content Area */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="mt-4 flex-1 flex flex-col"
                        >
                            {/* Controls */}
                            <div className="flex items-center justify-between mb-8 text-sm text-gray-600">
                                <button className="flex items-center gap-2 hover:text-black">
                                    <Search className="w-4 h-4" />
                                    Find
                                </button>
                                <button className="flex items-center gap-1 hover:text-black">
                                    Sort
                                    <AlignLeft className="w-4 h-4 rotate-180" />
                                </button>
                            </div>

                            {/* Empty State */}
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500">
                                <h3 className="text-lg font-medium text-black mb-2">No saved spirals yet</h3>
                                <p className="text-sm max-w-[200px]">
                                    Save your favorite spirals to access them quickly here.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Actions */}
            <div className="p-6 flex flex-col gap-6">
                <Tooltip
                    content="Settings"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button className="flex items-center gap-4 text-gray-500 hover:text-black transition-colors">
                        <Settings className="w-6 h-6 flex-shrink-0" />
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="whitespace-nowrap font-medium"
                                >
                                    Settings
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>

                <Tooltip
                    content="Profile"
                    placement="right"
                    classNames={{
                        content: "bg-black text-white rounded-lg px-2 py-1 text-xs"
                    }}
                >
                    <button className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                            <img
                                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                                alt="Profile"
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-left"
                                >
                                    <div className="text-sm font-medium text-black">User Name</div>
                                    <div className="text-xs text-gray-500">View Profile</div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </button>
                </Tooltip>
            </div>
        </motion.div>
    )
}
