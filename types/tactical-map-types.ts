// Type definitions for Tactical Map persistence and collaboration

export interface PlacedAgent {
    id: string
    agentId: string
    x: number
    y: number
}

export interface DrawingPath {
    points: { x: number; y: number }[]
    color: string
    width: number
}

export interface TacticalMapState {
    placedAgents: PlacedAgent[]
    drawingPaths: DrawingPath[]
    selectedMap: string
}

export interface TacticalMap {
    id: string
    session_id: string
    match_href: string
    vod_url: string
    map_name: string
    title: string
    map_state: TacticalMapState
    created_by: string
    last_modified_by: string
    created_at: string
    updated_at: string
}

export interface TacticalMapCreate {
    session_id: string
    match_href: string
    vod_url: string
    map_name: string
    title: string
    map_state: TacticalMapState
}

export interface TacticalMapUpdate {
    title?: string
    map_state?: TacticalMapState
    map_name?: string
}

// Socket.IO event types for future real-time collaboration
export interface SocketTacticalMapEvents {
    // Client → Server
    'tactical-map:join': (mapId: string) => void
    'tactical-map:leave': (mapId: string) => void
    'tactical-map:update': (mapId: string, state: Partial<TacticalMapState>) => void
    'tactical-map:agent-move': (mapId: string, agentId: string, x: number, y: number) => void
    'tactical-map:draw': (mapId: string, path: DrawingPath) => void

    // Server → Client
    'tactical-map:state': (state: TacticalMapState) => void
    'tactical-map:agent-moved': (agentId: string, x: number, y: number, userId: string) => void
    'tactical-map:path-drawn': (path: DrawingPath, userId: string) => void
    'tactical-map:user-joined': (userId: string, username: string) => void
    'tactical-map:user-left': (userId: string) => void
    'tactical-map:users': (users: { id: string; username: string }[]) => void
}

export interface CollaborativeUser {
    id: string
    username: string
    avatar_url?: string
    cursor?: { x: number; y: number }
    color: string
}
