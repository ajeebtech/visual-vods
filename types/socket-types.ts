import { Server as SocketIOServer } from 'socket.io'
import { Socket as ClientSocket } from 'socket.io-client'
import { NextApiResponse } from 'next'

// Extend NextApiResponse to include Socket.IO server
export interface NextApiResponseServerIO extends NextApiResponse {
    socket: NextApiResponse['socket'] & {
        server: any & {
            io: SocketIOServer
        }
    }
}

// Socket.IO event payloads
export interface TacticalMapJoinPayload {
    mapId: string
    userId: string
    username: string
    avatarUrl?: string
}

export interface TacticalMapUserPayload {
    userId: string
    username: string
    avatarUrl?: string
}

export interface TacticalMapAgentPlacePayload {
    agentId: string
    agent: {
        id: string
        agentId: string
        x: number
        y: number
    }
}

export interface TacticalMapAgentMovePayload {
    agentId: string
    x: number
    y: number
}

export interface TacticalMapAgentRemovePayload {
    agentId: string
}

export interface TacticalMapDrawPathPayload {
    path: {
        points: { x: number; y: number }[]
        color: string
        width: number
    }
    pathId: string
}

export interface TacticalMapCursorPayload {
    x: number
    y: number
}

export interface TacticalMapStatePayload {
    placedAgents: any[]
    drawingPaths: any[]
    selectedMap: string
}

// Client-to-Server events
export interface ClientToServerEvents {
    'tactical-map:join': (payload: TacticalMapJoinPayload) => void
    'tactical-map:leave': () => void
    'tactical-map:agent-place': (payload: TacticalMapAgentPlacePayload) => void
    'tactical-map:agent-move': (payload: TacticalMapAgentMovePayload) => void
    'tactical-map:agent-remove': (payload: TacticalMapAgentRemovePayload) => void
    'tactical-map:draw-path': (payload: TacticalMapDrawPathPayload) => void
    'tactical-map:cursor-move': (payload: TacticalMapCursorPayload) => void
    'tactical-map:request-sync': () => void
    'tactical-map:send-sync': (payload: { targetSocketId: string; state: TacticalMapStatePayload }) => void
}

// Server-to-Client events
export interface ServerToClientEvents {
    'tactical-map:user-joined': (payload: TacticalMapUserPayload) => void
    'tactical-map:user-left': (payload: { userId: string; username: string }) => void
    'tactical-map:users-list': (payload: { users: string[] }) => void
    'tactical-map:agent-placed': (payload: TacticalMapAgentPlacePayload & { userId: string; username: string }) => void
    'tactical-map:agent-moved': (payload: TacticalMapAgentMovePayload & { userId: string; username: string }) => void
    'tactical-map:agent-removed': (payload: TacticalMapAgentRemovePayload & { userId: string; username: string }) => void
    'tactical-map:path-drawn': (payload: TacticalMapDrawPathPayload & { userId: string; username: string }) => void
    'tactical-map:cursor-updated': (payload: TacticalMapCursorPayload & { userId: string; username: string }) => void
    'tactical-map:full-sync': (state: TacticalMapStatePayload) => void
    'tactical-map:sync-request': (payload: { targetSocketId: string }) => void
}

// Socket.IO client type
export type SocketClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>
