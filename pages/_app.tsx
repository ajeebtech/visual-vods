import type { AppProps } from 'next/app'
import { ClerkProvider } from '@clerk/nextjs'
import { HeroUIProvider } from "@heroui/react"
import SupabaseProvider from '@/lib/supabase-client'
import '../styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider>
      <SupabaseProvider>
    <HeroUIProvider>
      <Component {...pageProps} />
    </HeroUIProvider>
      </SupabaseProvider>
    </ClerkProvider>
  )
}

