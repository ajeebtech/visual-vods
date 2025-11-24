'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { initSocket, getSocket, disconnectSocket } from '@/lib/socket-client'
import type { SocketClient } from '@/types/socket-types'

interface SocketContextType {
    socket: SocketClient | null
    isConnected: boolean
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
})

export const useSocket = () => {
    const context = useContext(SocketContext)
    if (!context) {
        throw new Error('useSocket must be used within SocketProvider')
    }
    return context
}

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [socket, setSocket] = useState<SocketClient | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        // Initialize socket on mount
        const socketInstance = initSocket()
        setSocket(socketInstance)

        // Set up connection listeners
        const handleConnect = () => {
            console.log('Socket connected')
            setIsConnected(true)
        }

        const handleDisconnect = () => {
            console.log('Socket disconnected')
            setIsConnected(false)
        }

        socketInstance.on('connect', handleConnect)
        socketInstance.on('disconnect', handleDisconnect)

        // Set initial connection state
        setIsConnected(socketInstance.connected)

        // Cleanup on unmount
        return () => {
            socketInstance.off('connect', handleConnect)
            socketInstance.off('disconnect', handleDisconnect)
            // Don't disconnect here - keep connection alive for the session
        }
    }, [])

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    )
}
