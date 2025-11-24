import { io, Socket } from 'socket.io-client'
import type { SocketClient } from '@/types/socket-types'

let socket: SocketClient | null = null

export const initSocket = (): SocketClient => {
    if (!socket) {
        socket = io({
            path: '/api/socket',
            addTrailingSlash: false,
        }) as SocketClient

        socket.on('connect', () => {
            console.log('Socket.IO connected:', socket?.id)
        })

        socket.on('disconnect', () => {
            console.log('Socket.IO disconnected')
        })

        socket.on('connect_error', (error) => {
            console.error('Socket.IO connection error:', error)
        })
    }

    return socket
}

export const getSocket = (): SocketClient | null => {
    return socket
}

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect()
        socket = null
    }
}
