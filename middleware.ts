import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/vlr-search(.*)',
  '/api/vlr-team-matches(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Redirect to new domain if accessing via old vercel.app domain
  const hostname = req.headers.get('host')
  if (hostname === 'visual-vods.vercel.app') {
    const url = req.nextUrl.clone()
    url.hostname = 'www.vods.space' // specific target domain
    url.protocol = 'https:' // ensure https
    url.port = '' // clear any port
    return NextResponse.redirect(url, 308) // 308 Permanent Redirect
  }

  // Don't protect public routes
  if (isPublicRoute(req)) {
    return
  }

  // For API routes, we'll handle auth in the route itself
  // The middleware just needs to run to set up the auth context
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return
  }

  // Protect other routes
  await auth.protect()
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}

