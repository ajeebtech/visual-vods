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
  date?: string // ISO date string
  vodLinks: Array<{
    url: string
    platform: 'youtube' | 'twitch' | 'other'
    embedUrl?: string
  }>
  matchInfo?: {
    team1: {
      name: string
      logo: string | null
    }
    team2: {
      name: string
      logo: string | null
    }
    score: {
      team1: number
      team2: number
    }
    winner: 1 | 2 | null
  }
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
    const seenHrefsInitial = new Set<string>()
    
    // Try multiple selectors to find match links
    // Pattern 1: Links with match ID pattern (number at start of path)
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href')
      if (!href) return
      
      // Match pattern: /123456/team-vs-team-tournament
      const matchIdPattern = /^\/(\d+)\/[^\/]+/
      const match = href.match(matchIdPattern)
      
      if (match && !seenHrefsInitial.has(href)) {
        const matchId = match[1]
        const fullUrl = href.startsWith('http') ? href : `https://www.vlr.gg${href}`
        
        matchLinks.push({
          href,
          fullUrl,
          matchId
        })
        seenHrefsInitial.add(href)
      }
    })
    
    // Pattern 2: Links with specific classes that are match cards
    if (matchLinks.length === 0) {
      $('a.wf-card, a.m-item, a[class*="match"], a[class*="wf"]').each((_, element) => {
        const href = $(element).attr('href')
        if (!href || !href.startsWith('/') || href.includes('#') || seenHrefsInitial.has(href)) return
        
        // Check if it looks like a match URL
        if (href.match(/^\/(\d+)\//) || href.includes('-vs-')) {
          const matchIdMatch = href.match(/^\/(\d+)\//)
          const matchId = matchIdMatch ? matchIdMatch[1] : undefined
          const fullUrl = href.startsWith('http') ? href : `https://www.vlr.gg${href}`
          
          matchLinks.push({
            href,
            fullUrl,
            matchId
          })
          seenHrefsInitial.add(href)
        }
      })
    }
    
    // Pattern 3: Look in specific containers that hold matches
    if (matchLinks.length === 0) {
      $('.mod-dark a, .m-item a, [class*="match"] a').each((_, element) => {
        const href = $(element).attr('href')
        if (!href || !href.startsWith('/') || seenHrefsInitial.has(href)) return
        
        const matchIdMatch = href.match(/^\/(\d+)\//)
        if (matchIdMatch) {
          const matchId = matchIdMatch[1]
          const fullUrl = href.startsWith('http') ? href : `https://www.vlr.gg${href}`
          
          matchLinks.push({
            href,
            fullUrl,
            matchId
          })
          seenHrefsInitial.add(href)
        }
      })
    }
    
    console.log(`Found ${matchLinks.length} match links using selectors`)
    
    // Remove duplicate match links based on matchId or href
    const uniqueMatchLinks: MatchLink[] = []
    const seenMatchIds = new Set<string>()
    const seenHrefs = new Set<string>()
    
    for (const link of matchLinks) {
      // Use matchId as primary deduplication key, fallback to href
      const key = link.matchId || link.href
      
      if (link.matchId && !seenMatchIds.has(link.matchId)) {
        seenMatchIds.add(link.matchId)
        uniqueMatchLinks.push(link)
      } else if (!link.matchId && !seenHrefs.has(link.href)) {
        seenHrefs.add(link.href)
        uniqueMatchLinks.push(link)
      }
    }
    
    console.log(`Found ${matchLinks.length} total match links, ${uniqueMatchLinks.length} unique after deduplication`)
    
    // Log first few match links for debugging
    if (uniqueMatchLinks.length > 0) {
      console.log('Sample match links:', uniqueMatchLinks.slice(0, 3).map(l => ({ href: l.href, matchId: l.matchId })))
    } else {
      console.log('No match links found. HTML length:', html.length)
      // Log a sample of the HTML to debug
      const sampleHtml = html.substring(0, 2000)
      console.log('HTML sample:', sampleHtml)
    }
    
    // Helper function to extract match date from HTML
    const extractMatchDate = (html: string): string | undefined => {
      const $ = cheerio.load(html)
      
      try {
        // Try to find date in various common locations
        // Look for date elements with common classes
        const dateSelectors = [
          '.match-header-date',
          '.wf-label',
          'time[datetime]',
          '[data-date]',
          '.match-date',
          '.date'
        ]
        
        for (const selector of dateSelectors) {
          const dateElement = $(selector).first()
          if (dateElement.length) {
            // Try datetime attribute first
            const datetime = dateElement.attr('datetime')
            if (datetime) {
              return new Date(datetime).toISOString()
            }
            
            // Try data-date attribute
            const dataDate = dateElement.attr('data-date')
            if (dataDate) {
              return new Date(dataDate).toISOString()
            }
            
            // Try parsing text content
            const text = dateElement.text().trim()
            if (text) {
              const parsed = new Date(text)
              if (!isNaN(parsed.getTime())) {
                return parsed.toISOString()
              }
            }
          }
        }
        
        // Fallback: try to find date in page metadata or structured data
        const metaDate = $('meta[property="article:published_time"]').attr('content') ||
                        $('meta[name="date"]').attr('content') ||
                        $('time').attr('datetime')
        
        if (metaDate) {
          return new Date(metaDate).toISOString()
        }
        
        return undefined
      } catch (error) {
        console.error('Error extracting match date:', error)
        return undefined
      }
    }

    // Helper function to extract match info (teams, score, logos)
    const extractMatchInfo = (html: string): MatchData['matchInfo'] | undefined => {
      const $ = cheerio.load(html)
      
      try {
        // Find team 1 info
        const team1Link = $('.match-header-link.mod-1').first()
        const team1Name = team1Link.find('.wf-title-med').text().trim() || 
                         team1Link.find('img').attr('alt')?.replace(' team logo', '') || 
                         'Team 1'
        const team1Logo = team1Link.find('img').attr('src') || null
        const team1LogoFull = team1Logo && !team1Logo.startsWith('http') 
          ? `https:${team1Logo}` 
          : team1Logo
        
        // Find team 2 info
        const team2Link = $('.match-header-link.mod-2').first()
        const team2Name = team2Link.find('.wf-title-med').text().trim() || 
                         team2Link.find('img').attr('alt')?.replace(' team logo', '') || 
                         'Team 2'
        const team2Logo = team2Link.find('img').attr('src') || null
        const team2LogoFull = team2Logo && !team2Logo.startsWith('http') 
          ? `https:${team2Logo}` 
          : team2Logo
        
        // Find score
        const scoreContainer = $('.match-header-vs-score').first()
        const team1Score = parseInt(scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').first().text().trim()) || 0
        const team2Score = parseInt(scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').last().text().trim()) || 0
        
        // Determine winner (1 or 2)
        let winner: 1 | 2 | null = null
        if (team1Score > team2Score) {
          winner = 1
        } else if (team2Score > team1Score) {
          winner = 2
        }
        
        // Alternative: check for winner/loser classes
        const team1Element = scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').first()
        const team2Element = scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').last()
        
        if (team1Element.hasClass('match-header-vs-score-winner')) {
          winner = 1
        } else if (team2Element.hasClass('match-header-vs-score-winner')) {
          winner = 2
        }
        
        return {
          team1: {
            name: team1Name,
            logo: team1LogoFull
          },
          team2: {
            name: team2Name,
            logo: team2LogoFull
          },
          score: {
            team1: team1Score,
            team2: team2Score
          },
          winner
        }
      } catch (error) {
        console.error('Error extracting match info:', error)
        return undefined
      }
    }
    
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
    
    // Fetch each match page (limit to first 50 matches) - use unique links
    const matchesToFetch = uniqueMatchLinks.slice(0, 50)
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
          const matchInfo = extractMatchInfo(matchHtml)
          const matchDate = extractMatchDate(matchHtml)
          
          matchData.push({
            href: matchLink.href,
            html: matchHtml,
            matchId: matchLink.matchId,
            date: matchDate,
            vodLinks,
            matchInfo
          })
          
          console.log(`Match ${matchLink.matchId}: Found ${vodLinks.length} VOD links, Date: ${matchDate || 'N/A'}, Match: ${matchInfo?.team1.name} vs ${matchInfo?.team2.name} ${matchInfo?.score.team1}:${matchInfo?.score.team2}`)
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
      matchLinks: uniqueMatchLinks.map(link => ({
        href: link.href,
        fullUrl: link.fullUrl,
        matchId: link.matchId
      })),
      totalMatches: uniqueMatchLinks.length,
            matches: matchData.map(match => ({
              href: match.href,
              matchId: match.matchId,
              date: match.date,
              vodLinks: match.vodLinks,
              hasVODs: match.vodLinks.length > 0,
              matchInfo: match.matchInfo
            })),
      fetchedMatches: matchData.length,
      matchesWithVODs: matchData.filter(m => m.vodLinks.length > 0).length
    })
  } catch (error: any) {
    console.error('Error proxying VLR.gg team matches request:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

