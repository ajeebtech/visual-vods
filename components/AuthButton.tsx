'use client'

import { useState, useEffect } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'

export default function AuthButton() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      // Don't reload - just update the state
      // The parent components will update via their own auth listeners
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (error: any) {
      console.error('Error signing in with Google:', error.message)
      alert('Failed to sign in with Google: ' + error.message)
    }
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      // State will update via onAuthStateChange listener
      setUser(null)
    } catch (error: any) {
      console.error('Error signing out:', error.message)
      alert('Failed to sign out: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-gray-500">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user) {
    return (
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-4 text-gray-500 hover:text-black transition-colors"
      >
        <LogOut className="w-6 h-6 flex-shrink-0" />
        <span className="text-sm font-medium">Sign Out</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleGoogleLogin}
      className="w-full flex items-center gap-4 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
    >
      <LogIn className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm font-medium">Sign in with Google</span>
    </button>
  )
}

