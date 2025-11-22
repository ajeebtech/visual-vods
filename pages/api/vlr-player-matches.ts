import type { NextApiRequest, NextApiResponse } from 'next'
import * as cheerio from 'cheerio'
import { getCached, getCacheKey } from '../../lib/redis'

interface MatchData {
  href: string
  matchId?: string
  date?: string // ISO date string
  vodLinks: Array<{
    url: string
    platform: 'youtube' | 'twitch' | 'other'
    embedUrl?: string
    mapName?: string
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
  tournament?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { playerId, playerName, team1Name, team2Name } = req.query

  if (!playerId || typeof playerId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid playerId parameter' })
  }

  if (!playerName || typeof playerName !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid playerName parameter' })
  }

  const filterByTeams = team1Name && typeof team1Name === 'string' && team2Name && typeof team2Name === 'string'

  // Create cache key (include team filters if provided)
  // Skip cache if _t parameter is present (for debugging)
  const bypassCache = req.query._t !== undefined
  const cacheKey = filterByTeams
    ? getCacheKey('vlr:player-matches', playerId, playerName.toLowerCase(), (team1Name as string).toLowerCase(), (team2Name as string).toLowerCase())
    : getCacheKey('vlr:player-matches', playerId, playerName.toLowerCase())

  try {
    // If bypassing cache, fetch directly
    const fetchData = async () => {
        // Convert player name to slug for URL
        const playerSlug = playerName.toLowerCase().replace(/\s+/g, '-')
        const url = `https://www.vlr.gg/player/matches/${playerId}/${playerSlug}`
        
        console.log('Fetching player matches from:', url)
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch player matches: ${response.status}`)
        }

        const html = await response.text()
        const $ = cheerio.load(html)

        // Debug: Log page structure
        console.log('Player matches page loaded, HTML length:', html.length)
        console.log('Looking for match links...')
        
        // Count potential match links
        const allLinks = $('a[href]')
        console.log(`Total links on page: ${allLinks.length}`)
        
        // Check for common match patterns
        const matchPatternLinks: string[] = []
        allLinks.each((_, el) => {
          const href = $(el).attr('href') || ''
          if (/^\/(\d+)\//.test(href) || href.includes('/match/')) {
            matchPatternLinks.push(href)
          }
        })
        console.log(`Links matching match patterns: ${matchPatternLinks.length}`)
        if (matchPatternLinks.length > 0) {
          console.log('Sample match links:', matchPatternLinks.slice(0, 5))
        }
        
        // Check for match containers
        const matchContainers = $('.wf-module-item, .match-item, [class*="match"], .mod-dark, .m-item')
        console.log(`Found ${matchContainers.length} potential match containers`)
        
        // Log a sample of the HTML structure
        const sampleHtml = $('body').html()?.substring(0, 2000) || ''
        console.log('Sample HTML structure (first 2000 chars):', sampleHtml)

        const matchPromises: Array<Promise<MatchData | null>> = []
        
        // Helper function to extract VOD links from HTML
        const extractVodLinks = ($context: cheerio.Cheerio<cheerio.Element>): Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string }> => {
          const vodLinks: Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string }> = []
          
          $context.find('a[href*="youtube.com"], a[href*="youtu.be"], a[href*="twitch.tv"]').each((_, vodElement) => {
            const vodUrl = $context.find(vodElement).attr('href') || ''
            let platform: 'youtube' | 'twitch' | 'other' = 'other'
            let embedUrl = vodUrl
            
            if (vodUrl.includes('youtube.com') || vodUrl.includes('youtu.be')) {
              platform = 'youtube'
              const videoIdMatch = vodUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
              if (videoIdMatch) {
                embedUrl = `https://www.youtube.com/embed/${videoIdMatch[1]}`
              }
            } else if (vodUrl.includes('twitch.tv')) {
              platform = 'twitch'
              const twitchMatch = vodUrl.match(/twitch\.tv\/(?:videos\/)?([^/?]+)/)
              if (twitchMatch) {
                embedUrl = `https://player.twitch.tv/?video=${twitchMatch[1]}&parent=${encodeURIComponent('localhost')}`
              }
            }
            
            if (vodUrl) {
              vodLinks.push({ url: vodUrl, platform, embedUrl })
            }
          })
          
          return vodLinks
        }
        
        // Use the EXACT same logic as team matches API
        // Extract match links - looking for <a> tags with href containing match IDs
        // Based on the pattern: /585458/fnatic-vs-g2-esports-red-bull-home-ground-2025-lr3
        const matchLinks: Array<{ href: string; fullUrl: string; matchId: string }> = []
        const seenHrefsInitial = new Set<string>()
        
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
        
        // Remove duplicates based on matchId
        const uniqueMatchLinks: Array<{ href: string; fullUrl: string; matchId: string }> = []
        const seenMatchIds = new Set<string>()
        
        for (const link of matchLinks) {
          if (link.matchId && !seenMatchIds.has(link.matchId)) {
            seenMatchIds.add(link.matchId)
            uniqueMatchLinks.push(link)
          }
        }
        
        console.log(`Found ${uniqueMatchLinks.length} unique match links`)
        
        // Filter by teams if requested
        let filteredMatchLinks = uniqueMatchLinks
        if (filterByTeams && team1Name && team2Name) {
          filteredMatchLinks = uniqueMatchLinks.filter(link => {
            // Extract team names from URL
            const urlMatch = link.href.match(/\/(\d+)\/([^-]+)-vs-([^-]+)/)
            if (!urlMatch) return false
            
            const urlTeam1 = urlMatch[2].replace(/-/g, ' ').trim().toLowerCase()
            const urlTeam2 = urlMatch[3].split('-')[0].replace(/-/g, ' ').trim().toLowerCase()
            const filterTeam1Lower = (team1Name as string).toLowerCase()
            const filterTeam2Lower = (team2Name as string).toLowerCase()
            
            // Check if this match is between the two teams (order doesn't matter)
            return (urlTeam1 === filterTeam1Lower && urlTeam2 === filterTeam2Lower) ||
                   (urlTeam1 === filterTeam2Lower && urlTeam2 === filterTeam1Lower)
          })
          console.log(`Filtered to ${filteredMatchLinks.length} matches between ${team1Name} and ${team2Name}`)
        }
        
        // Convert to matchElements format
        const matchElements: Array<{ href: string; fullUrl: string; matchId?: string; matchTeam1Name: string; matchTeam2Name: string; tournament?: string; score: { team1: number; team2: number; winner: 1 | 2 | null } }> = []
        
        for (const link of filteredMatchLinks.slice(0, 50)) {
          // Extract team names from URL
          const urlMatch = link.href.match(/\/(\d+)\/([^-]+)-vs-([^-]+)/)
          let matchTeam1Name = 'Unknown'
          let matchTeam2Name = 'Unknown'
          
          if (urlMatch) {
            matchTeam1Name = urlMatch[2].replace(/-/g, ' ').trim()
            matchTeam2Name = urlMatch[3].split('-')[0].replace(/-/g, ' ').trim()
          }
          
          matchElements.push({
            href: link.href,
            fullUrl: link.fullUrl,
            matchId: link.matchId,
            matchTeam1Name,
            matchTeam2Name,
            tournament: undefined, // Will be extracted from match detail page
            score: { team1: 0, team2: 0, winner: null } // Will be extracted from match detail page
          })
        }
        
        let finalMatchElements = matchElements
        
        // If still no matches, try a more aggressive search - look for ANY link with a number pattern
        if (finalMatchElements.length === 0) {
          console.log('Trying aggressive match search...')
          const aggressiveMatches: typeof matchElements = []
          
          // Look for any link that might be a match
          $('a[href]').each((index, element) => {
            if (index >= 200) return false // Limit search
            
            const href = $(element).attr('href')
            if (!href || !href.startsWith('/')) return
            
            // Try to find match ID in any format
            const matchIdMatch = href.match(/\/(\d{4,})\//) // At least 4 digits (match IDs are usually 6+ digits)
            if (matchIdMatch) {
              const matchId = matchIdMatch[1]
              if (seenMatchIds.has(matchId)) return
              
              const fullUrl = href.startsWith('http') ? href : `https://www.vlr.gg${href}`
              
              // Try to get context from nearby text
              const $link = $(element)
              const $row = $link.closest('div, li, tr, .wf-module-item, .match-item')
              const rowText = $row.text() || $link.text()
              
              // Extract basic info from text
              let matchTeam1Name = 'Unknown'
              let matchTeam2Name = 'Unknown'
              let team1Score = 0
              let team2Score = 0
              let winner: 1 | 2 | null = null
              let tournament: string | undefined = undefined
              
              // Try to extract scores
              const scoreMatch = rowText.match(/(\d+)\s*[:]\s*(\d+)/)
              if (scoreMatch) {
                team1Score = parseInt(scoreMatch[1])
                team2Score = parseInt(scoreMatch[2])
                winner = team1Score > team2Score ? 1 : team2Score > team1Score ? 2 : null
              }
              
              // Try to extract tournament
              const tournamentMatch = rowText.match(/(VCT|EWC|SEN|Red Bull|FaZe)[^0-9]*/)
              if (tournamentMatch) {
                tournament = tournamentMatch[0].trim()
              }
              
              aggressiveMatches.push({
                href,
                fullUrl,
                matchId,
                matchTeam1Name,
                matchTeam2Name,
                tournament,
                score: { team1: team1Score, team2: team2Score, winner }
              })
              
              seenMatchIds.add(matchId)
            }
          })
          
          if (aggressiveMatches.length > 0) {
            console.log(`Found ${aggressiveMatches.length} matches with aggressive search`)
            finalMatchElements = aggressiveMatches.slice(0, 50)
          }
        }
        
        console.log(`Found ${finalMatchElements.length} matches on player page`)
        console.log(`Potential match links found: ${potentialMatches.length}`)
        if (potentialMatches.length > 0) {
          console.log('Sample potential matches:', potentialMatches.slice(0, 5))
        }
        
        if (finalMatchElements.length === 0) {
          // Additional debugging: log a sample of links found
          const sampleLinks: string[] = []
          $('a[href]').each((index, element) => {
            if (index < 20) {
              const href = $(element).attr('href')
              if (href && href.startsWith('/')) sampleLinks.push(href)
            }
          })
          console.log('Sample links found on page (first 20):', sampleLinks)
          
          // Check for common container classes
          const containers = $('.wf-module, .mod-dark, .match-item, [class*="match"]')
          console.log(`Found ${containers.length} potential match containers`)
          
          // Try to find any text that looks like a match
          const bodyText = $('body').text()
          const matchTextSample = bodyText.match(/(\d+\s*[:]\s*\d+)/)
          if (matchTextSample) {
            console.log('Found score pattern in text:', matchTextSample[0])
          }
        }
        
        // Process each match asynchronously to fetch VODs
        for (const matchElement of finalMatchElements.slice(0, 10)) { // Limit to first 10 for VOD fetching
          const promise = (async () => {
            // Get VOD links from the match item itself
            const $match = $(`.wf-module-item, .match-item, [data-match-id]`).filter((_, el) => {
              const $el = $(el)
              const link = $el.find('a[href*="/match/"]').first()
              return link.attr('href') === matchElement.href
            }).first()
            
            let vodLinks = extractVodLinks($match)
            
            // If no VODs found in the match item, fetch the match detail page
            if (vodLinks.length === 0 && matchElement.fullUrl) {
              try {
                const matchResponse = await fetch(matchElement.fullUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html',
                  },
                })
                
                if (matchResponse.ok) {
                  const matchHtml = await matchResponse.text()
                  const $matchPage = cheerio.load(matchHtml)
                  vodLinks = extractVodLinks($matchPage)
                }
              } catch (matchError) {
                console.error('Error fetching match details:', matchError)
              }
            }
            
            return {
              href: matchElement.fullUrl,
              matchId: matchElement.matchId,
              vodLinks,
              matchInfo: matchElement.matchTeam1Name && matchElement.matchTeam2Name ? {
                team1: { name: matchElement.matchTeam1Name, logo: null },
                team2: { name: matchElement.matchTeam2Name, logo: null },
                score: matchElement.score,
                winner: matchElement.score.winner
              } : undefined,
              tournament: matchElement.tournament
            } as MatchData
          })()
          
          matchPromises.push(promise)
        }
        
        // Wait for all match processing to complete
        const matches = (await Promise.all(matchPromises)).filter((m): m is MatchData => m !== null)
        
        return {
          matches,
          totalMatches: matches.length,
          fetchedMatches: matches.length,
          matchesWithVODs: matches.filter(m => m.vodLinks && m.vodLinks.length > 0).length,
          latestMatch: matches.length > 0 ? matches[0] : null
        }
      }
    
    // Cache for 1 hour (3600 seconds) unless bypassing
    const data = bypassCache 
      ? await fetchData()
      : await getCached(cacheKey, fetchData, 3600)
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    return res.status(200).json(data)
  } catch (error: any) {
    console.error('Error fetching player matches:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

