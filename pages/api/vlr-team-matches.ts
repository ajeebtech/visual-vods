import type { NextApiRequest, NextApiResponse } from 'next'
import * as cheerio from 'cheerio'

interface MatchLink {
  href: string
  fullUrl: string
  matchId?: string
}

interface MatchData {
  href: string
  html: string
  matchId?: string
  vodLinks: Array<{
    url: string
    platform: 'youtube' | 'twitch' | 'other'
    embedUrl?: string
  }>
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { teamId, teamName } = req.query

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid teamId parameter' })
  }

  if (!teamName || typeof teamName !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid teamName parameter' })
  }

  try {
    // Convert team name to lowercase and replace spaces with hyphens for URL
    const teamSlug = teamName.toLowerCase().replace(/\s+/g, '-')
    const url = `https://www.vlr.gg/team/matches/${teamId}/${teamSlug}/`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from VLR.gg' })
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    
    // Extract match links - looking for <a> tags with href containing match IDs
    // Based on the pattern: /585458/fnatic-vs-g2-esports-red-bull-home-ground-2025-lr3
    const matchLinks: MatchLink[] = []
    
    // Find all match links - they typically have classes like 'wf-card', 'm-item', etc.
    $('a[href*="/"][href*="-vs-"]').each((_, element) => {
      const href = $(element).attr('href')
      if (href && href.startsWith('/') && href.includes('-vs-')) {
        // Extract match ID from href (first number in the path)
        const matchIdMatch = href.match(/^\/(\d+)\//)
        const matchId = matchIdMatch ? matchIdMatch[1] : undefined
        
        const fullUrl = href.startsWith('http') ? href : `https://www.vlr.gg${href}`
        
        // Avoid duplicates
        if (!matchLinks.find(link => link.href === href)) {
          matchLinks.push({
            href,
            fullUrl,
            matchId
          })
        }
      }
    })
    
    // Also try alternative selectors if the above doesn't work
    if (matchLinks.length === 0) {
      $('a.wf-card, a.m-item').each((_, element) => {
        const href = $(element).attr('href')
        if (href && href.startsWith('/') && !href.includes('#')) {
          const matchIdMatch = href.match(/^\/(\d+)\//)
          const matchId = matchIdMatch ? matchIdMatch[1] : undefined
          
          const fullUrl = href.startsWith('http') ? href : `https://www.vlr.gg${href}`
          
          if (!matchLinks.find(link => link.href === href)) {
            matchLinks.push({
              href,
              fullUrl,
              matchId
            })
          }
        }
      })
    }
    
    console.log(`Found ${matchLinks.length} match links`)
    
    // Helper function to extract VOD links from match HTML
    const extractVODLinks = (html: string): Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string }> => {
      const $ = cheerio.load(html)
      const vodLinks: Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string }> = []
      
      // Find all links that might be VOD links
      // Look for links in VOD sections, typically with classes like 'od-dark', 'wf-label' containing 'VOD'
      $('a[href*="youtube.com"], a[href*="youtu.be"], a[href*="twitch.tv"]').each((_, element) => {
        const href = $(element).attr('href')
        if (href) {
          let platform: 'youtube' | 'twitch' | 'other' = 'other'
          let embedUrl: string | undefined
          
          // Check if it's a YouTube link
          if (href.includes('youtube.com') || href.includes('youtu.be')) {
            platform = 'youtube'
            // Extract video ID and create embed URL
            let videoId: string | null = null
            
            // Handle youtu.be short links
            if (href.includes('youtu.be/')) {
              const match = href.match(/youtu\.be\/([^?&]+)/)
              videoId = match ? match[1] : null
            }
            // Handle youtube.com/watch?v= links
            else if (href.includes('youtube.com/watch')) {
              const match = href.match(/[?&]v=([^&]+)/)
              videoId = match ? match[1] : null
            }
            // Handle youtube.com/embed/ links
            else if (href.includes('youtube.com/embed/')) {
              const match = href.match(/embed\/([^?&]+)/)
              videoId = match ? match[1] : null
            }
            
            if (videoId) {
              // Extract timestamp if present
              const timeMatch = href.match(/[?&]t=(\d+)/)
              const timestamp = timeMatch ? timeMatch[1] : undefined
              embedUrl = `https://www.youtube.com/embed/${videoId}${timestamp ? `?start=${timestamp}` : ''}`
            }
          }
          // Check if it's a Twitch link
          else if (href.includes('twitch.tv')) {
            platform = 'twitch'
            // Extract video ID from Twitch URL
            // Format: https://www.twitch.tv/videos/1234567890 or https://www.twitch.tv/username
            const videoMatch = href.match(/twitch\.tv\/videos\/(\d+)/)
            const channelMatch = href.match(/twitch\.tv\/([^/?]+)/)
            
            if (videoMatch) {
              // VOD link
              embedUrl = `https://player.twitch.tv/?video=${videoMatch[1]}&parent=${req.headers.host || 'localhost:3000'}`
            } else if (channelMatch) {
              // Channel link (live stream)
              embedUrl = `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${req.headers.host || 'localhost:3000'}`
            }
          }
          
          // Only add if we haven't seen this URL before
          if (!vodLinks.find(link => link.url === href)) {
            vodLinks.push({
              url: href,
              platform,
              embedUrl
            })
          }
        }
      })
      
      return vodLinks
    }
    
    // Fetch each match page (limit to first 50 matches)
    const matchesToFetch = matchLinks.slice(0, 50)
    const matchData: MatchData[] = []
    
    for (const matchLink of matchesToFetch) {
      try {
        const matchResponse = await fetch(matchLink.fullUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
        })
        
        if (matchResponse.ok) {
          const matchHtml = await matchResponse.text()
          const vodLinks = extractVODLinks(matchHtml)
          
          matchData.push({
            href: matchLink.href,
            html: matchHtml,
            matchId: matchLink.matchId,
            vodLinks
          })
          
          console.log(`Match ${matchLink.matchId}: Found ${vodLinks.length} VOD links`)
        }
      } catch (error) {
        console.error(`Error fetching match ${matchLink.href}:`, error)
      }
    }
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    return res.status(200).json({ 
      teamId,
      teamName,
      url,
      matchLinks: matchLinks.map(link => ({
        href: link.href,
        fullUrl: link.fullUrl,
        matchId: link.matchId
      })),
      matches: matchData.map(match => ({
        href: match.href,
        matchId: match.matchId,
        vodLinks: match.vodLinks,
        hasVODs: match.vodLinks.length > 0
      })),
      totalMatches: matchLinks.length,
      fetchedMatches: matchData.length,
      matchesWithVODs: matchData.filter(m => m.vodLinks.length > 0).length
    })
  } catch (error: any) {
    console.error('Error proxying VLR.gg team matches request:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

