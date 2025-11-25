'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pen, Eraser, Trash2, Palette, Save, FolderOpen, Plus, Clock, Users, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession, useUser } from '@clerk/nextjs'
import { useSocket } from '@/contexts/SocketContext'
import { VALORANT_AGENTS, VALORANT_MAPS, Agent, AgentAbility } from '@/lib/valorant-data'
import type { TacticalMap, TacticalMapState } from '@/types/tactical-map-types'

interface TacticalMapModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialMap?: string
    sessionId?: string | null
    matchHref?: string
    vodUrl?: string
}

interface PlacedAgent {
    id: string
    agentId: string
    x: number
    y: number
}

interface DrawingPath {
    points: { x: number; y: number }[]
    color: string
    width: number
    id?: string
    userId?: string
}

interface PlacedAbility {
    id: string
    abilityIcon: string
    abilityName: string
    agentColor: string
    x: number
    y: number
}

interface ConnectedUser {
    userId: string
    username: string
    avatarUrl?: string
}

interface UserCursor {
    x: number
    y: number
    username: string
    color: string
}

const DRAWING_COLORS = [
    { name: 'Red', value: '#EF4444' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#10B981' },
    { name: 'Yellow', value: '#F59E0B' },
    { name: 'Purple', value: '#9146FF' },
    { name: 'White', value: '#FFFFFF' },
]

export default function TacticalMapModal({ open, onOpenChange, initialMap, sessionId, matchHref, vodUrl }: TacticalMapModalProps) {
    const { session: clerkSession } = useSession()
    const { user } = useUser()
    const { socket, isConnected } = useSocket()

    // Map state
    const [selectedMap, setSelectedMap] = useState(initialMap || VALORANT_MAPS[0].id)
    const [placedAgents, setPlacedAgents] = useState<PlacedAgent[]>([])
    const [drawingPaths, setDrawingPaths] = useState<DrawingPath[]>([])
    const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([])
    const [isDrawing, setIsDrawing] = useState(false)
    const [drawMode, setDrawMode] = useState<'pen' | 'eraser' | null>(null)
    const [selectedColor, setSelectedColor] = useState(DRAWING_COLORS[4].value)
    const [lineWidth, setLineWidth] = useState(3)
    const [draggedAgent, setDraggedAgent] = useState<Agent | null>(null)
    const [draggedAbility, setDraggedAbility] = useState<{ ability: AgentAbility; agent: Agent } | null>(null)
    const [hoveredAgent, setHoveredAgent] = useState<PlacedAgent | null>(null)
    const [hoveredToolbarAgent, setHoveredToolbarAgent] = useState<string | null>(null)
    const [draggingPlacedAgent, setDraggingPlacedAgent] = useState<string | null>(null)
    const [placedAbilities, setPlacedAbilities] = useState<PlacedAbility[]>([])

    // Zoom and pan state
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [isPanning, setIsPanning] = useState(false)
    const [panStart, setPanStart] = useState({ x: 0, y: 0 })

    // Persistence state
    const [currentMapId, setCurrentMapId] = useState<string | null>(null)
    const [mapTitle, setMapTitle] = useState('Untitled Strategy')
    const [savedMaps, setSavedMaps] = useState<TacticalMap[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [showMapList, setShowMapList] = useState(false)
    const [isLoadingMaps, setIsLoadingMaps] = useState(false)

    // Socket.IO collaboration state
    const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([])
    const [userCursors, setUserCursors] = useState<Map<string, UserCursor>>(new Map())
    const lastCursorUpdate = useRef<number>(0)

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<HTMLDivElement>(null)
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Draw on canvas
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Draw all paths
        drawingPaths.forEach(path => {
            if (path.points.length < 2) return

            ctx.strokeStyle = path.color
            ctx.lineWidth = path.width
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            ctx.beginPath()
            ctx.moveTo(path.points[0].x, path.points[0].y)

            for (let i = 1; i < path.points.length; i++) {
                ctx.lineTo(path.points[i].x, path.points[i].y)
            }

            ctx.stroke()
        })

        // Draw current path
        if (currentPath.length > 1) {
            ctx.strokeStyle = drawMode === 'eraser' ? '#000000' : selectedColor
            ctx.lineWidth = drawMode === 'eraser' ? lineWidth * 3 : lineWidth
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.globalCompositeOperation = drawMode === 'eraser' ? 'destination-out' : 'source-over'

            ctx.beginPath()
            ctx.moveTo(currentPath[0].x, currentPath[0].y)

            for (let i = 1; i < currentPath.length; i++) {
                ctx.lineTo(currentPath[i].x, currentPath[i].y)
            }

            ctx.stroke()
            ctx.globalCompositeOperation = 'source-over'
        }
    }, [drawingPaths, currentPath, selectedColor, lineWidth, drawMode])

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!drawMode) return

        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        setIsDrawing(true)
        setCurrentPath([{ x, y }])
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !drawMode) return

        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        setCurrentPath(prev => [...prev, { x, y }])
    }

    const handleMouseUp = () => {
        if (!isDrawing || !drawMode) return

        if (currentPath.length > 1) {
            if (drawMode === 'eraser') {
                // For eraser, we need to remove intersecting paths
                // Simplified: just add the eraser path
                setDrawingPaths(prev => [...prev, {
                    points: currentPath,
                    color: '#000000',
                    width: lineWidth * 3
                }])
            } else {
                setDrawingPaths(prev => [...prev, {
                    points: currentPath,
                    color: selectedColor,
                    width: lineWidth
                }])
            }
        }

        setIsDrawing(false)
        setCurrentPath([])
    }

    const handleDragStart = (agent: Agent) => {
        setDraggedAgent(agent)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()

        if (!draggedAgent || !mapRef.current) return

        const rect = mapRef.current.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100

        const newAgent: PlacedAgent = {
            id: `${draggedAgent.id}-${Date.now()}`,
            agentId: draggedAgent.id,
            x,
            y,
        }

        setPlacedAgents(prev => [...prev, newAgent])
        setDraggedAgent(null)
    }

    const handlePlacedAgentDragStart = (agentId: string) => {
        setDraggingPlacedAgent(agentId)
    }

    const handlePlacedAgentDrop = (e: React.DragEvent) => {
        e.preventDefault()

        if (!draggingPlacedAgent || !mapRef.current) return

        const rect = mapRef.current.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100

        setPlacedAgents(prev => prev.map(agent =>
            agent.id === draggingPlacedAgent
                ? { ...agent, x, y }
                : agent
        ))

        setDraggingPlacedAgent(null)
    }

    const removeAgent = (agentId: string) => {
        setPlacedAgents(prev => prev.filter(agent => agent.id !== agentId))
    }

    // Ability drag handlers
    const handleAbilityDragStart = (ability: AgentAbility, agent: Agent) => {
        setDraggedAbility({ ability, agent })
    }

    const handleAbilityDrop = (e: React.DragEvent) => {
        e.preventDefault()

        if (!draggedAbility || !mapRef.current) return

        const rect = mapRef.current.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100

        const newAbility: PlacedAbility = {
            id: `ability-${Date.now()}`,
            abilityIcon: draggedAbility.ability.icon,
            abilityName: draggedAbility.ability.name,
            agentColor: draggedAbility.agent.color,
            x,
            y,
        }

        setPlacedAbilities(prev => [...prev, newAbility])
        setDraggedAbility(null)
    }

    // Zoom and pan handlers
    const handleZoomIn = () => {
        setZoom(prev => Math.min(prev + 0.25, 5))
    }

    const handleZoomOut = () => {
        setZoom(prev => Math.max(prev - 0.25, 0.5))
    }

    const handleZoomReset = () => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const delta = e.deltaY > 0 ? -0.1 : 0.1
            setZoom(prev => Math.max(0.5, Math.min(5, prev + delta)))
        }
    }

    const handleMapMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            // Middle mouse or Shift+Left mouse to pan
            e.preventDefault()
            setIsPanning(true)
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
        }
    }

    const handleMapMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setPan({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
            })
        }
    }

    const handleMapMouseUp = () => {
        setIsPanning(false)
    }

    const removeAbility = (abilityId: string) => {
        setPlacedAbilities(prev => prev.filter(ability => ability.id !== abilityId))
    }

    const clearDrawing = () => {
        setDrawingPaths([])
        setCurrentPath([])
    }

    const clearAll = () => {
        setPlacedAgents([])
        clearDrawing()
        setHasUnsavedChanges(true)
    }

    // Load saved maps for current session
    const loadSavedMaps = useCallback(async () => {
        if (!sessionId || !matchHref || !vodUrl || !clerkSession) return

        setIsLoadingMaps(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) return

            const response = await fetch(
                `/api/tactical-maps?session_id=${sessionId}&match_href=${encodeURIComponent(matchHref)}&vod_url=${encodeURIComponent(vodUrl)}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            )

            if (response.ok) {
                const maps = await response.json()
                setSavedMaps(maps)
            }
        } catch (error) {
            console.error('Error loading tactical maps:', error)
        } finally {
            setIsLoadingMaps(false)
        }
    }, [sessionId, matchHref, vodUrl, clerkSession])

    // Load maps when modal opens
    useEffect(() => {
        if (open && sessionId) {
            loadSavedMaps()
        }
    }, [open, sessionId, loadSavedMaps])

    // Save tactical map
    const saveTacticalMap = useCallback(async (showNotification = true) => {
        if (!sessionId || !matchHref || !vodUrl || !clerkSession) {
            if (showNotification) alert('Session information required to save')
            return
        }

        setIsSaving(true)
        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) {
                if (showNotification) alert('Authentication required')
                return
            }

            const mapState: TacticalMapState = {
                placedAgents,
                drawingPaths,
                selectedMap
            }

            const response = await fetch('/api/tactical-maps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    id: currentMapId,
                    session_id: sessionId,
                    match_href: matchHref,
                    vod_url: vodUrl,
                    map_name: selectedMap,
                    title: mapTitle,
                    map_state: mapState
                })
            })

            if (response.ok) {
                const savedMap = await response.json()
                setCurrentMapId(savedMap.id)
                setLastSaved(new Date())
                setHasUnsavedChanges(false)

                // Refresh map list
                await loadSavedMaps()

                if (showNotification) {
                    // Could add a toast notification here
                    console.log('Map saved successfully')
                }
            } else {
                if (showNotification) alert('Failed to save tactical map')
            }
        } catch (error) {
            console.error('Error saving tactical map:', error)
            if (showNotification) alert('Error saving tactical map')
        } finally {
            setIsSaving(false)
        }
    }, [sessionId, matchHref, vodUrl, clerkSession, currentMapId, mapTitle, placedAgents, drawingPaths, selectedMap, loadSavedMaps])

    // Load a tactical map
    const loadTacticalMap = useCallback((map: TacticalMap) => {
        setCurrentMapId(map.id)
        setMapTitle(map.title)
        setSelectedMap(map.map_state.selectedMap)
        setPlacedAgents(map.map_state.placedAgents)
        setDrawingPaths(map.map_state.drawingPaths)
        setHasUnsavedChanges(false)
        setLastSaved(new Date(map.updated_at))
        setShowMapList(false)
    }, [])

    // Create new map
    const createNewMap = useCallback(() => {
        setCurrentMapId(null)
        setMapTitle('Untitled Strategy')
        setPlacedAgents([])
        setDrawingPaths([])
        setHasUnsavedChanges(false)
        setLastSaved(null)
        setShowMapList(false)
    }, [])

    // Delete a tactical map
    const deleteTacticalMap = useCallback(async (mapId: string) => {
        if (!clerkSession) return
        if (!confirm('Are you sure you want to delete this tactical map?')) return

        try {
            const token = await clerkSession.getToken({ template: 'supabase' })
            if (!token) return

            const response = await fetch(`/api/tactical-maps?id=${mapId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                // If we deleted the current map, create a new one
                if (currentMapId === mapId) {
                    createNewMap()
                }
                // Refresh map list
                await loadSavedMaps()
            } else {
                alert('Failed to delete tactical map')
            }
        } catch (error) {
            console.error('Error deleting tactical map:', error)
            alert('Error deleting tactical map')
        }
    }, [clerkSession, currentMapId, createNewMap, loadSavedMaps])

    // Track changes for auto-save
    useEffect(() => {
        if (currentMapId && !isSaving) {
            setHasUnsavedChanges(true)
        }
    }, [placedAgents, drawingPaths, selectedMap, mapTitle, currentMapId, isSaving])

    // Auto-save every 10 seconds if there are unsaved changes
    useEffect(() => {
        if (hasUnsavedChanges && currentMapId && sessionId) {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current)
            }

            autoSaveTimerRef.current = setTimeout(() => {
                saveTacticalMap(false)
            }, 10000) // 10 seconds
        }

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current)
            }
        }
    }, [hasUnsavedChanges, currentMapId, sessionId, saveTacticalMap])

    const selectedMapData = VALORANT_MAPS.find(m => m.id === selectedMap)

    const getSaveStatusText = () => {
        if (isSaving) return 'Saving...'
        if (hasUnsavedChanges) return 'Unsaved changes'
        if (lastSaved) {
            const seconds = Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000)
            if (seconds < 60) return 'Saved just now'
            if (seconds < 3600) return `Saved ${Math.floor(seconds / 60)}m ago`
            return `Saved ${Math.floor(seconds / 3600)}h ago`
        }
        return 'Not saved'
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] gap-0 p-0 overflow-visible bg-black border border-gray-800 rounded-xl [&>button]:hidden">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-800">
                        <div className="flex items-center gap-4 flex-1">
                            {/* Title Input */}
                            <Input
                                value={mapTitle}
                                onChange={(e) => {
                                    setMapTitle(e.target.value)
                                    setHasUnsavedChanges(true)
                                }}
                                placeholder="Strategy Title"
                                className="w-64 bg-gray-900 text-white border-gray-700 focus:border-[#9146FF]"
                                disabled={!sessionId}
                            />

                            {/* Map Selector */}
                            <select
                                value={selectedMap}
                                onChange={(e) => {
                                    setSelectedMap(e.target.value)
                                    setHasUnsavedChanges(true)
                                }}
                                className="bg-gray-900 text-white border border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#9146FF]"
                            >
                                {VALORANT_MAPS.map(map => (
                                    <option key={map.id} value={map.id}>{map.name}</option>
                                ))}
                            </select>

                            {/* Save Status */}
                            {sessionId && (
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                    <Clock className="w-3 h-3" />
                                    <span className={hasUnsavedChanges ? 'text-yellow-400' : 'text-gray-400'}>
                                        {getSaveStatusText()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            {/* Save Button */}
                            {sessionId && (
                                <Button
                                    onClick={() => saveTacticalMap(true)}
                                    disabled={isSaving || !sessionId}
                                    className="bg-[#9146FF] hover:bg-[#772CE8] text-white disabled:opacity-50"
                                    size="sm"
                                >
                                    <Save className="w-4 h-4 mr-1" />
                                    {isSaving ? 'Saving...' : 'Save'}
                                </Button>
                            )}

                            {/* Load Button */}
                            {sessionId && (
                                <div className="relative">
                                    <Button
                                        onClick={() => setShowMapList(!showMapList)}
                                        className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                                        size="sm"
                                    >
                                        <FolderOpen className="w-4 h-4 mr-1" />
                                        Load ({savedMaps.length})
                                    </Button>

                                    {/* Map List Dropdown */}
                                    <AnimatePresence>
                                        {showMapList && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto"
                                            >
                                                <div className="p-3 border-b border-gray-800">
                                                    <h3 className="font-semibold text-white text-sm">Saved Strategies</h3>
                                                </div>
                                                {isLoadingMaps ? (
                                                    <div className="p-4 text-center text-gray-400 text-sm">
                                                        Loading...
                                                    </div>
                                                ) : savedMaps.length === 0 ? (
                                                    <div className="p-4 text-center text-gray-400 text-sm">
                                                        No saved strategies yet
                                                    </div>
                                                ) : (
                                                    <div className="p-2">
                                                        {savedMaps.map(map => (
                                                            <div
                                                                key={map.id}
                                                                className={`p-3 rounded-lg mb-2 cursor-pointer transition-colors ${currentMapId === map.id
                                                                    ? 'bg-[#9146FF]/20 border border-[#9146FF]'
                                                                    : 'bg-gray-800 hover:bg-gray-750 border border-transparent'
                                                                    }`}
                                                                onClick={() => loadTacticalMap(map)}
                                                            >
                                                                <div className="flex items-start justify-between">
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-semibold text-white text-sm truncate">
                                                                            {map.title}
                                                                        </p>
                                                                        <p className="text-xs text-gray-400 mt-1">
                                                                            {map.map_name} • {map.map_state.placedAgents.length} agents
                                                                        </p>
                                                                        <p className="text-xs text-gray-500 mt-1">
                                                                            {new Date(map.updated_at).toLocaleDateString()} at{' '}
                                                                            {new Date(map.updated_at).toLocaleTimeString()}
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            deleteTacticalMap(map.id)
                                                                        }}
                                                                        className="ml-2 p-1 text-gray-400 hover:text-red-400 transition-colors"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* New Map Button */}
                            {sessionId && (
                                <Button
                                    onClick={createNewMap}
                                    className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                                    size="sm"
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            )}

                            {/* Pen Tool */}
                            <div className="flex items-center gap-1">
                                <Button
                                    onClick={() => setDrawMode(drawMode === 'pen' ? null : 'pen')}
                                    className={`${drawMode === 'pen'
                                        ? 'bg-[#9146FF] text-white'
                                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                    size="sm"
                                >
                                    <Pen className="w-4 h-4" />
                                </Button>
                                <span className="text-xs text-gray-500 italic">In Development</span>
                            </div>

                            {/* Eraser Tool */}
                            <Button
                                onClick={() => setDrawMode(drawMode === 'eraser' ? null : 'eraser')}
                                className={`${drawMode === 'eraser'
                                    ? 'bg-[#9146FF] text-white'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                    }`}
                                size="sm"
                            >
                                <Eraser className="w-4 h-4" />
                            </Button>

                            {/* Color Picker */}
                            {drawMode === 'pen' && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded-lg">
                                    {DRAWING_COLORS.map(color => (
                                        <button
                                            key={color.value}
                                            onClick={() => setSelectedColor(color.value)}
                                            className={`w-6 h-6 rounded-full border-2 transition-all ${selectedColor === color.value
                                                ? 'border-white scale-110'
                                                : 'border-gray-600 hover:scale-105'
                                                }`}
                                            style={{ backgroundColor: color.value }}
                                            title={color.name}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Clear Drawing */}
                            <Button
                                onClick={clearDrawing}
                                className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                                size="sm"
                            >
                                Clear Drawing
                            </Button>

                            {/* Zoom Controls */}
                            <div className="flex items-center gap-1 border-l border-gray-700 pl-2 ml-2">
                                <Button
                                    onClick={handleZoomOut}
                                    className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                                    size="sm"
                                    title="Zoom Out (Ctrl + Scroll)"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </Button>
                                <span className="text-xs text-gray-400 px-2 min-w-[50px] text-center font-mono">
                                    {Math.round(zoom * 100)}%
                                </span>
                                <Button
                                    onClick={handleZoomIn}
                                    className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                                    size="sm"
                                    title="Zoom In (Ctrl + Scroll)"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </Button>
                                <Button
                                    onClick={handleZoomReset}
                                    className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                                    size="sm"
                                    title="Reset View"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Clear All */}
                            <Button
                                onClick={clearAll}
                                className="bg-red-900/50 text-red-300 hover:bg-red-900"
                                size="sm"
                            >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Clear All
                            </Button>

                            {/* Close Button */}
                            <Button
                                onClick={() => onOpenChange(false)}
                                className="bg-gray-800 text-gray-300 hover:bg-gray-700"
                                size="sm"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Map Canvas Area */}
                    <div className="flex-1 relative overflow-hidden bg-gray-950">
                        <div
                            ref={mapContainerRef}
                            className="absolute inset-0 flex items-center justify-center p-8"
                            onDragOver={handleDragOver}
                            onDrop={draggingPlacedAgent ? handlePlacedAgentDrop : (draggedAbility ? handleAbilityDrop : handleDrop)}
                        >
                            {/* Map Background Container (static border) */}
                            <div
                                ref={mapRef}
                                className="relative w-full h-full max-w-5xl max-h-full bg-gray-900 rounded-lg overflow-hidden border-2 border-gray-800"
                                onWheel={handleWheel}
                                onMouseDown={handleMapMouseDown}
                                onMouseMove={handleMapMouseMove}
                                onMouseUp={handleMapMouseUp}
                                onMouseLeave={handleMapMouseUp}
                            >
                                {/* Zoomable/Pannable Content Wrapper */}
                                <div
                                    className="absolute inset-0 w-full h-full"
                                    style={{
                                        transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                                        transformOrigin: 'center',
                                        transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                                        cursor: isPanning ? 'grabbing' : (drawMode ? 'crosshair' : 'grab')
                                    }}
                                >
                                    {/* Map Image */}
                                    {selectedMapData?.image ? (
                                        <img
                                            src={selectedMapData.image}
                                            alt={selectedMapData.name}
                                            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                                            <div className="text-center">
                                                <p className="text-6xl mb-4">🗺️</p>
                                                <p className="text-2xl font-bold text-white">{selectedMapData?.name}</p>
                                                <p className="text-sm text-gray-400 mt-2">Map image not found</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Drawing Canvas */}
                                    <canvas
                                        ref={canvasRef}
                                        width={1200}
                                        height={800}
                                        className="absolute inset-0 w-full h-full"
                                        style={{ cursor: drawMode ? 'crosshair' : 'default' }}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        onMouseLeave={handleMouseUp}
                                    />

                                    {/* Placed Agents */}
                                    {placedAgents.map(placedAgent => {
                                        const agent = VALORANT_AGENTS.find(a => a.id === placedAgent.agentId)
                                        if (!agent) return null

                                        return (
                                            <motion.div
                                                key={placedAgent.id}
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                exit={{ scale: 0 }}
                                                className="absolute cursor-move"
                                                style={{
                                                    left: `${placedAgent.x}%`,
                                                    top: `${placedAgent.y}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                }}
                                                draggable
                                                onDragStart={() => handlePlacedAgentDragStart(placedAgent.id)}
                                                onMouseEnter={() => setHoveredAgent(placedAgent)}
                                                onMouseLeave={() => setHoveredAgent(null)}
                                                onDoubleClick={() => removeAgent(placedAgent.id)}
                                            >
                                                <div
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center border-2 border-white shadow-lg overflow-hidden"
                                                    style={{ backgroundColor: agent.color }}
                                                >
                                                    <img
                                                        src={agent.icon}
                                                        alt={agent.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>

                                                {/* Ability Tooltip */}
                                                <AnimatePresence>
                                                    {hoveredAgent?.id === placedAgent.id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: 10 }}
                                                            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none"
                                                        >
                                                            <div className="bg-black border border-gray-700 rounded-lg p-3 shadow-2xl min-w-[280px]">
                                                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
                                                                    <span className="text-2xl">{agent.icon}</span>
                                                                    <div>
                                                                        <p className="font-bold text-white">{agent.name}</p>
                                                                        <p className="text-xs text-gray-400">{agent.role}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {agent.abilities.map(ability => (
                                                                        <div key={ability.slot} className="flex items-start gap-2">
                                                                            <img
                                                                                src={ability.icon}
                                                                                alt={ability.name}
                                                                                className="w-6 h-6 rounded flex-shrink-0 object-cover"
                                                                            />
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-xs font-mono bg-gray-800 px-1.5 py-0.5 rounded text-[#9146FF]">
                                                                                        {ability.slot}
                                                                                    </span>
                                                                                    <p className="text-xs font-semibold text-white">{ability.name}</p>
                                                                                </div>
                                                                                <p className="text-xs text-gray-400 mt-0.5">{ability.description}</p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-800 text-center">
                                                                    Double-click to remove
                                                                </p>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                                {/* End Zoomable/Pannable Content Wrapper */}
                            </div>
                        </div>

                        {/* Agent Toolbar */}
                        <div className="border-t border-gray-800 bg-black/90 p-4">
                            <div className="flex items-center justify-center gap-2 overflow-x-auto">
                                {VALORANT_AGENTS.map(agent => (
                                    <motion.div
                                        key={agent.id}
                                        className="relative"
                                        whileHover={{ y: -2 }}
                                        onMouseEnter={() => {
                                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
                                            hoverTimeoutRef.current = setTimeout(() => {
                                                setHoveredToolbarAgent(agent.id)
                                            }, 500)
                                        }}
                                        onMouseLeave={() => {
                                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
                                            setHoveredToolbarAgent(null)
                                        }}
                                    >
                                        {/* Agent Avatar */}
                                        <div
                                            draggable
                                            onDragStart={() => handleDragStart(agent)}
                                            className="w-14 h-14 rounded-lg overflow-hidden border-2 border-gray-700 hover:border-[#9146FF] transition-all cursor-grab active:cursor-grabbing shadow-lg relative"
                                        >
                                            <img
                                                src={agent.icon}
                                                alt={agent.name}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>

                                        {/* Abilities Tooltip on Hover - ValoPlant Style */}
                                        {hoveredToolbarAgent === agent.id && (
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100]">
                                                <div className="bg-red-500 border-2 border-[#9146FF] rounded-lg p-2 shadow-2xl backdrop-blur-sm">
                                                    {/* Abilities in a Row */}
                                                    <div className="flex items-center gap-2">
                                                        {agent.abilities.map(ability => (
                                                            <div
                                                                key={ability.slot}
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    e.stopPropagation()
                                                                    handleAbilityDragStart(ability, agent)
                                                                }}
                                                                className="flex flex-col items-center cursor-grab active:cursor-grabbing"
                                                                title={`${ability.name}: ${ability.description}`}
                                                            >
                                                                <div className="w-12 h-12 rounded bg-gray-800 border-2 border-gray-600 hover:border-[#9146FF] flex items-center justify-center overflow-hidden transition-all">
                                                                    <img
                                                                        src={ability.icon}
                                                                        alt={ability.name}
                                                                        className="w-full h-full object-cover pointer-events-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
