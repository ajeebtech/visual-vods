'use client'

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { useSession } from '@clerk/nextjs'
import { createContext, useContext, useEffect, useState } from 'react'

type SupabaseContext = {
  supabase: SupabaseClient | null
  isLoaded: boolean
}

const Context = createContext<SupabaseContext>({
  supabase: null,
  isLoaded: false,
})

type Props = {
  children: React.ReactNode
}

export default function SupabaseProvider({ children }: Props) {
  const { session } = useSession()
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const initializeClient = async () => {
      if (!session) {
        // Create a client without auth for unauthenticated users
        const client = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        setSupabase(client)
        setIsLoaded(true)
        return
      }

      // Get the token first
      let token: string | null = null
      try {
        token = await session.getToken({
          template: 'supabase' // This template should be configured in Clerk Dashboard
        })
      } catch (error) {
        console.error('Failed to get Clerk token:', error)
      }

      // Create client with Clerk JWT token in headers
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers
          },
          auth: {
            persistSession: false, // Clerk handles session persistence
            autoRefreshToken: false, // Clerk handles token refresh
            detectSessionInUrl: false // Clerk handles session detection
          }
        }
      )

      setSupabase(client)
      setIsLoaded(true)
    }

    initializeClient()
  }, [session])

  return (
    <Context.Provider value={{ supabase, isLoaded }}>
      {!isLoaded ? <div>Loading...</div> : children}
    </Context.Provider>
  )
}

export const useSupabase = () => {
  const context = useContext(Context)
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return {
    supabase: context.supabase,
    isLoaded: context.isLoaded,
  }
}

