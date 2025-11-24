import { Server as NetServer } from 'http'
import { NextApiRequest } from 'next'
import { NextApiResponseServerIO } from '@/types/socket-types'
import { Server as SocketIOServer } from 'socket.io'

export const config = {
    api: {
        bodyParser: false,
    },
}

const SocketHandler = (req: NextApiRequest, res: NextApiResponseServerIO) => {
    if (res.socket.server.io) {
        console.log('Socket.IO already running')
        res.end()
        return
    }

    console.log('Initializing Socket.IO server...')

    const httpServer: NetServer = res.socket.server as any
    const io = new SocketIOServer(httpServer, {
        path: '/api/socket',
        addTrailingSlash: false,
        cors: {
            origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001',
            methods: ['GET', 'POST'],
        },
    })

    res.socket.server.io = io

    // Track users in each tactical map room
    const roomUsers = new Map<string, Set<string>>()

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id)

        // Join a tactical map room
        socket.on('tactical-map:join', ({ mapId, userId, username, avatarUrl }) => {
            console.log(`User ${username} joining map ${mapId}`)

            socket.join(mapId)

            // Track user in room
            if (!roomUsers.has(mapId)) {
                roomUsers.set(mapId, new Set())
            }
            roomUsers.get(mapId)!.add(userId)

            // Store user info on socket
            socket.data.mapId = mapId
            socket.data.userId = userId
            socket.data.username = username
            socket.data.avatarUrl = avatarUrl

            // Get all users in room
            const usersInRoom = Array.from(roomUsers.get(mapId) || [])

            // Notify others that user joined
            socket.to(mapId).emit('tactical-map:user-joined', {
                userId,
                username,
                avatarUrl,
            })

            // Send current users list to the new joiner
            socket.emit('tactical-map:users-list', { users: usersInRoom })

            // Also broadcast updated user list to everyone
            io.to(mapId).emit('tactical-map:users-list', { users: usersInRoom })
        })

        // Leave tactical map room
        socket.on('tactical-map:leave', () => {
            const { mapId, userId, username } = socket.data
            if (mapId) {
                console.log(`User ${username} leaving map ${mapId}`)

                socket.leave(mapId)

                // Remove user from room tracking
                roomUsers.get(mapId)?.delete(userId)
                if (roomUsers.get(mapId)?.size === 0) {
                    roomUsers.delete(mapId)
                }

                // Notify others
                socket.to(mapId).emit('tactical-map:user-left', { userId, username })

                // Update users list
                const usersInRoom = Array.from(roomUsers.get(mapId) || [])
                io.to(mapId).emit('tactical-map:users-list', { users: usersInRoom })
            }
        })

        // Agent placement
        socket.on('tactical-map:agent-place', (data) => {
            const { mapId } = socket.data
            if (mapId) {
                socket.to(mapId).emit('tactical-map:agent-placed', {
                    ...data,
                    userId: socket.data.userId,
                    username: socket.data.username,
                })
            }
        })

        // Agent movement
        socket.on('tactical-map:agent-move', (data) => {
            const { mapId } = socket.data
            if (mapId) {
                socket.to(mapId).emit('tactical-map:agent-moved', {
                    ...data,
                    userId: socket.data.userId,
                    username: socket.data.username,
                })
            }
        })

        // Agent removal
        socket.on('tactical-map:agent-remove', (data) => {
            const { mapId } = socket.data
            if (mapId) {
                socket.to(mapId).emit('tactical-map:agent-removed', {
                    ...data,
                    userId: socket.data.userId,
                    username: socket.data.username,
                })
            }
        })

        // Drawing path
        socket.on('tactical-map:draw-path', (data) => {
            const { mapId } = socket.data
            if (mapId) {
                socket.to(mapId).emit('tactical-map:path-drawn', {
                    ...data,
                    userId: socket.data.userId,
                    username: socket.data.username,
                })
            }
        })

        // Cursor movement (throttled on client)
        socket.on('tactical-map:cursor-move', (data) => {
            const { mapId } = socket.data
            if (mapId) {
                socket.to(mapId).emit('tactical-map:cursor-updated', {
                    ...data,
                    userId: socket.data.userId,
                    username: socket.data.username,
                })
            }
        })

        // Request full state sync
        socket.on('tactical-map:request-sync', () => {
            const { mapId } = socket.data
            if (mapId) {
                // Ask the first user in the room to send their state
                const sockets = io.sockets.adapter.rooms.get(mapId)
                if (sockets && sockets.size > 1) {
                    const firstSocket = Array.from(sockets)[0]
                    io.to(firstSocket).emit('tactical-map:sync-request', {
                        targetSocketId: socket.id,
                    })
                }
            }
        })

        // Send full state to a specific user
        socket.on('tactical-map:send-sync', ({ targetSocketId, state }) => {
            io.to(targetSocketId).emit('tactical-map:full-sync', state)
        })

        // Disconnect
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id)
            const { mapId, userId, username } = socket.data

            if (mapId && userId) {
                // Remove user from room tracking
                roomUsers.get(mapId)?.delete(userId)
                if (roomUsers.get(mapId)?.size === 0) {
                    roomUsers.delete(mapId)
                }

                // Notify others
                socket.to(mapId).emit('tactical-map:user-left', { userId, username })

                // Update users list
                const usersInRoom = Array.from(roomUsers.get(mapId) || [])
                io.to(mapId).emit('tactical-map:users-list', { users: usersInRoom })
            }
        })
    })

    console.log('Socket.IO server initialized')
    res.end()
}

export default SocketHandler
