'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'
import LoginModal from './LoginModal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// Sign In Icon (globe/network icon)
const SignInIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 256 256" 
    className={className}
  >
    <rect width="256" height="256" fill="none"/>
    <path 
      d="M50.69,184.92A127.52,127.52,0,0,0,64,128a63.85,63.85,0,0,1,24-50" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M128,128a191.11,191.11,0,0,1-24,93" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M96,128a32,32,0,0,1,64,0,223.12,223.12,0,0,1-21.28,95.41" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M218.56,184A289.45,289.45,0,0,0,224,128a96,96,0,0,0-192,0,95.8,95.8,0,0,1-5.47,32" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M92.81,160a158.92,158.92,0,0,1-18.12,47.84" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M120,64.5a66,66,0,0,1,8-.49,64,64,0,0,1,64,64,259.86,259.86,0,0,1-2,32" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M183.94,192q-2.28,8.88-5.18,17.5" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
  </svg>
)

// Logout Icon (globe/network icon)
const LogoutIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 256 256" 
    className={className}
  >
    <rect width="256" height="256" fill="none"/>
    <path 
      d="M176,128a239.33,239.33,0,0,1-17.94,91.2" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M163.78,96A48,48,0,0,0,80,128a143.41,143.41,0,0,1-18,69.73" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M96,37.46A96.07,96.07,0,0,1,224,128a288.93,288.93,0,0,1-7.14,64" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M23.3,168A95.66,95.66,0,0,0,32,128,95.78,95.78,0,0,1,64,56.45" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M110.58,208q-3,6.63-6.56,13" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
    <path 
      d="M128,128a192.77,192.77,0,0,1-6,48" 
      fill="none" 
      stroke="currentColor" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      strokeWidth="16"
    />
  </svg>
)

interface AuthButtonProps {
  isSidebarExpanded?: boolean
}

export default function AuthButton({ isSidebarExpanded = false }: AuthButtonProps) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className={`w-full flex items-center ${isSidebarExpanded ? 'gap-4' : 'justify-center'} text-gray-500 hover:text-black transition-colors`}
          >
            <LogoutIcon className="w-6 h-6 flex-shrink-0" />
            <AnimatePresence>
              {isSidebarExpanded && (
                <motion.span
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 300, 
                    damping: 30
                  }}
                  className="text-sm font-medium whitespace-nowrap"
                >
                  Sign Out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout} className="bg-red-500 text-white hover:bg-red-600">
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <>
      <button
        onClick={() => setIsLoginModalOpen(true)}
        className={`w-full flex items-center ${isSidebarExpanded ? 'gap-4 px-4 py-2' : 'justify-center p-2'} bg-black text-white rounded-lg hover:bg-gray-800 transition-colors`}
      >
        <SignInIcon className="w-5 h-5 flex-shrink-0" />
        <AnimatePresence>
          {isSidebarExpanded && (
            <motion.span
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 30
              }}
              className="text-sm font-medium whitespace-nowrap"
            >
              Sign in
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </>
  )
}

