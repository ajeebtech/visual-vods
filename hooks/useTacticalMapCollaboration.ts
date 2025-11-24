import { useEffect, useRef, useCallback } from 'react'
import { useSocket } from '@/contexts/SocketContext'
import type { SocketClient } from '@/types/socket-types'

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
}

interface UseTacticalMapCollaborationProps {
    mapId: string | null
    userId: string | null
    username: string | null
    avatarUrl?: string
    isOpen: boolean
    onAgentPlaced: (agent: PlacedAgent) => void
    onAgentMoved: (agentId: string, x: number, y: number) => void
    onAgentRemoved: (agentId: string) => void
    onPathDrawn: (path: DrawingPath) => void
    onCursorMoved: (userId: string, x: number, y: number, username: string) => void
    onUserJoined: (userId: string, username: string, avatarUrl?: string) => void
    onUserLeft: (userId: string) => void
    onUsersListUpdated: (users: string[]) => void
}

export const useTacticalMapCollaboration = ({
    mapId,
    userId,
    username,
    avatarUrl,
    isOpen,
    onAgentPlaced,
    onAgentMoved,
    onAgentRemoved,
    onPathDrawn,
    onCursorMoved,
    onUserJoined,
    onUserLeft,
    onUsersListUpdated,
}: UseTacticalMapCollaborationProps) => {
    const { socket, isConnected } = useSocket()
    const hasJoinedRoom = useRef(false)

    // Join room when modal opens
    useEffect(() => {
        if (!socket || !isConnected || !isOpen || !mapId || !userId || !username) {
            return
        }

        if (hasJoinedRoom.current) return

        console.log('Joining tactical map room:', mapId)
        socket.emit('tactical-map:join', {
            mapId,
            userId,
            username,
            avatarUrl,
        })

        hasJoinedRoom.current = true

        // Leave room on cleanup
        return () => {
            if (hasJoinedRoom.current) {
                console.log('Leaving tactical map room:', mapId)
                socket.emit('tactical-map:leave')
                hasJoinedRoom.current = false
            }
        }
    }, [socket, isConnected, isOpen, mapId, userId, username, avatarUrl])

    // Set up event listeners
    useEffect(() => {
        if (!socket) return

        // User joined
        const handleUserJoined = (data: { userId: string; username: string; avatarUrl?: string }) => {
            console.log('User joined:', data.username)
            onUserJoined(data.userId, data.username, data.avatarUrl)
        }

        // User left
        const handleUserLeft = (data: { userId: string; username: string }) => {
            console.log('User left:', data.username)
            onUserLeft(data.userId)
        }

        // Users list updated
        const handleUsersList = (data: { users: string[] }) => {
            console.log('Users list updated:', data.users)
            onUsersListUpdated(data.users)
        }

        // Agent placed
        const handleAgentPlaced = (data: { agent: PlacedAgent; userId: string; username: string }) => {
            if (data.userId !== userId) {
                console.log(`${data.username} placed agent`)
                onAgentPlaced(data.agent)
            }
        }

        // Agent moved
        const handleAgentMoved = (data: { agentId: string; x: number; y: number; userId: string }) => {
            if (data.userId !== userId) {
                onAgentMoved(data.agentId, data.x, data.y)
            }
        }

        // Agent removed
        const handleAgentRemoved = (data: { agentId: string; userId: string }) => {
            if (data.userId !== userId) {
                onAgentRemoved(data.agentId)
            }
        }

        // Path drawn
        const handlePathDrawn = (data: { path: DrawingPath; userId: string; username: string }) => {
            if (data.userId !== userId) {
                console.log(`${data.username} drew path`)
                onPathDrawn(data.path)
            }
        }

        // Cursor updated
        const handleCursorUpdated = (data: { x: number; y: number; userId: string; username: string }) => {
            if (data.userId !== userId) {
                onCursorMoved(data.userId, data.x, data.y, data.username)
            }
        }

        // Register listeners
        socket.on('tactical-map:user-joined', handleUserJoined)
        socket.on('tactical-map:user-left', handleUserLeft)
        socket.on('tactical-map:users-list', handleUsersList)
        socket.on('tactical-map:agent-placed', handleAgentPlaced)
        socket.on('tactical-map:agent-moved', handleAgentMoved)
        socket.on('tactical-map:agent-removed', handleAgentRemoved)
        socket.on('tactical-map:path-drawn', handlePathDrawn)
        socket.on('tactical-map:cursor-updated', handleCursorUpdated)

        // Cleanup
        return () => {
            socket.off('tactical-map:user-joined', handleUserJoined)
            socket.off('tactical-map:user-left', handleUserLeft)
            socket.off('tactical-map:users-list', handleUsersList)
            socket.off('tactical-map:agent-placed', handleAgentPlaced)
            socket.off('tactical-map:agent-moved', handleAgentMoved)
            socket.off('tactical-map:agent-removed', handleAgentRemoved)
            socket.off('tactical-map:path-drawn', handlePathDrawn)
            socket.off('tactical-map:cursor-updated', handleCursorUpdated)
        }
    }, [socket, userId, onAgentPlaced, onAgentMoved, onAgentRemoved, onPathDrawn, onCursorMoved, onUserJoined, onUserLeft, onUsersListUpdated])

    // Broadcast functions
    const broadcastAgentPlace = useCallback((agent: PlacedAgent) => {
        if (socket && isConnected) {
            socket.emit('tactical-map:agent-place', { agentId: agent.id, agent })
        }
    }, [socket, isConnected])

    const broadcastAgentMove = useCallback((agentId: string, x: number, y: number) => {
        if (socket && isConnected) {
            socket.emit('tactical-map:agent-move', { agentId, x, y })
        }
    }, [socket, isConnected])

    const broadcastAgentRemove = useCallback((agentId: string) => {
        if (socket && isConnected) {
            socket.emit('tactical-map:agent-remove', { agentId })
        }
    }, [socket, isConnected])

    const broadcastDrawPath = useCallback((path: DrawingPath, pathId: string) => {
        if (socket && isConnected) {
            socket.emit('tactical-map:draw-path', { path, pathId })
        }
    }, [socket, isConnected])

    const broadcastCursorMove = useCallback((x: number, y: number) => {
        if (socket && isConnected) {
            // Throttle cursor updates to 60fps max
            const now = Date.now()
            const lastUpdate = hasJoinedRoom.current ? 0 : now
            if (now - lastUpdate < 16) return // ~60fps

            socket.emit('tactical-map:cursor-move', { x, y })
        }
    }, [socket, isConnected])

    return {
        isConnected,
        broadcastAgentPlace,
        broadcastAgentMove,
        broadcastAgentRemove,
        broadcastDrawPath,
        broadcastCursorMove,
    }
}
