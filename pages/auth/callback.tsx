import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('Processing authentication...')

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    const handleAuthCallback = async () => {
      try {
        setStatus('Processing authentication...')

        // Check if we have hash fragments (OAuth callback)
        const hash = window.location.hash
        if (hash) {
          console.log('OAuth callback detected with hash fragments')

          // Parse hash fragments manually if needed
          const hashParams = new URLSearchParams(hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const errorParam = hashParams.get('error')

          if (errorParam) {
            console.error('OAuth error in hash:', errorParam)
            setStatus('Authentication failed. Redirecting...')
            setTimeout(() => router.replace('/?error=auth_failed'), 2000)
            return
          }

          if (accessToken) {
            // We have an access token, let Supabase handle it
            console.log('Access token found in hash, processing...')
          }
        }

        // Wait a moment for Supabase to process the hash
        await new Promise(resolve => setTimeout(resolve, 300))

        // Get the session - Supabase automatically handles the hash fragments
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Error getting session:', error)
          setStatus('Authentication failed. Redirecting...')
          setTimeout(() => router.replace('/?error=auth_failed'), 2000)
          return
        }

        if (session) {
          // Successfully authenticated
          console.log('Session established successfully')
          setStatus('Authentication successful! Redirecting...')
          // Clear the hash from URL
          window.history.replaceState(null, '', window.location.pathname)
          // Use replace instead of push to avoid adding to history
          setTimeout(() => router.replace('/'), 1000)
        } else {
          // Check URL for error
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          const errorParam = hashParams.get('error')

          if (errorParam) {
            console.error('OAuth error:', errorParam)
            setStatus('Authentication failed. Redirecting...')
            setTimeout(() => router.replace('/?error=auth_failed'), 2000)
            return
          }

          // No session found, try to get it from the URL hash
          console.warn('No session found, checking hash fragments...')
          setStatus('No session found. Redirecting...')
          setTimeout(() => router.replace('/'), 1000)
        }
      } catch (err: any) {
        console.error('Auth callback error:', err)
        setStatus('An error occurred. Redirecting...')
        setTimeout(() => router.replace('/?error=auth_failed'), 2000)
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  )
}

// Make this a dynamic page to avoid static export issues
export async function getServerSideProps() {
  return {
    props: {},
  }
}
