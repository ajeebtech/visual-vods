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

  const { playerId, playerName, team1Name, team2Name, limit } = req.query

  if (!playerId || typeof playerId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid playerId parameter' })
  }

  if (!playerName || typeof playerName !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid playerName parameter' })
  }

  const DEFAULT_LIMIT = 50
  const MIN_LIMIT = 30
  const MAX_LIMIT = 150

  let matchLimit = DEFAULT_LIMIT
  if (typeof limit === 'string') {
    const parsed = parseInt(limit, 10)
    if (!Number.isNaN(parsed)) {
      matchLimit = Math.max(MIN_LIMIT, Math.min(parsed, MAX_LIMIT))
    }
  }

  const hasTeamFilter = (team1Name && typeof team1Name === 'string') || (team2Name && typeof team2Name === 'string')

  // Create cache key (include team filters if provided)
  // Skip cache if _t parameter is present (for debugging)
  const bypassCache = req.query._t !== undefined
  const limitKey = `limit:${matchLimit}`

  const cacheKeyParts = [playerId, playerName.toLowerCase()]
  if (team1Name && typeof team1Name === 'string') cacheKeyParts.push(team1Name.toLowerCase())
  if (team2Name && typeof team2Name === 'string') cacheKeyParts.push(team2Name.toLowerCase())
  cacheKeyParts.push(limitKey)

  const cacheKey = getCacheKey('vlr:player-matches', ...cacheKeyParts)

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

      // Use the EXACT same logic as team matches API
      // Extract match links - looking for <a> tags with href containing match IDs
      // Based on the pattern: /585458/fnatic-vs-g2-esports-red-bull-home-ground-2025-lr3
      // Extract match links - looking for <a> tags with href containing match IDs
      // Based on the pattern: /585458/fnatic-vs-g2-esports-red-bull-home-ground-2025-lr3
      const matchLinks: Array<{
        href: string;
        fullUrl: string;
        matchId: string;
        score?: { team1: number; team2: number; winner: 1 | 2 | null };
        tournament?: string;
      }> = []
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

          // Extract metadata from the row
          const $link = $(element)
          const $row = $link.closest('div, li, tr, .wf-module-item, .match-item')
          const rowText = $row.text() || ''

          // Extract score
          let score = { team1: 0, team2: 0, winner: null as 1 | 2 | null }
          const scoreMatch = rowText.match(/(\d+)\s*[:]\s*(\d+)/)
          if (scoreMatch) {
            const s1 = parseInt(scoreMatch[1])
            const s2 = parseInt(scoreMatch[2])
            score = {
              team1: s1,
              team2: s2,
              winner: s1 > s2 ? 1 : s2 > s1 ? 2 : null
            }
          }

          // Extract tournament
          let tournament = undefined
          const tournamentMatch = rowText.match(/(VCT|EWC|SEN|Red Bull|FaZe)[^0-9]*/)
          if (tournamentMatch) {
            tournament = tournamentMatch[0].trim()
          }

          matchLinks.push({
            href,
            fullUrl,
            matchId,
            score,
            tournament
          })
          seenHrefsInitial.add(href)
        }
      })

      // Remove duplicates based on matchId
      const uniqueMatchLinks: Array<{
        href: string;
        fullUrl: string;
        matchId: string;
        score?: { team1: number; team2: number; winner: 1 | 2 | null };
        tournament?: string;
      }> = []
      const seenMatchIds = new Set<string>()

      for (const link of matchLinks) {
        if (link.matchId && !seenMatchIds.has(link.matchId)) {
          seenMatchIds.add(link.matchId)
          uniqueMatchLinks.push(link)
        }
      }

      console.log(`Found ${uniqueMatchLinks.length} unique match links`)

      // Filter by teams if requested (optional - if no team filter, show all player matches)
      let filteredMatchLinks = uniqueMatchLinks

      if (hasTeamFilter) {
        const filterTeam1Lower = team1Name && typeof team1Name === 'string' ? team1Name.toLowerCase() : null
        const filterTeam2Lower = team2Name && typeof team2Name === 'string' ? team2Name.toLowerCase() : null

        filteredMatchLinks = uniqueMatchLinks.filter(link => {
          // Extract team names from URL
          const urlMatch = link.href.match(/\/(\d+)\/([^-]+)-vs-([^-]+)/)
          if (!urlMatch) return false

          const urlTeam1 = urlMatch[2].replace(/-/g, ' ').trim().toLowerCase()
          const urlTeam2 = urlMatch[3].split('-')[0].replace(/-/g, ' ').trim().toLowerCase()

          if (filterTeam1Lower && filterTeam2Lower) {
            // Check if this match is between the two teams (order doesn't matter)
            return (urlTeam1 === filterTeam1Lower && urlTeam2 === filterTeam2Lower) ||
              (urlTeam1 === filterTeam2Lower && urlTeam2 === filterTeam1Lower)
          } else if (filterTeam1Lower) {
            // If only team1 is provided, user requested "matches with team1 in the left side"
            return urlTeam1 === filterTeam1Lower
          } else if (filterTeam2Lower) {
            // If only team2 is provided, check team2 position
            return urlTeam2 === filterTeam2Lower
          }
          return false
        })

        if (filterTeam1Lower && filterTeam2Lower) {
          console.log(`Filtered to ${filteredMatchLinks.length} matches between ${team1Name} and ${team2Name}`)
        } else if (filterTeam1Lower) {
          console.log(`Filtered to ${filteredMatchLinks.length} matches with ${team1Name} on the left side`)
        } else if (filterTeam2Lower) {
          console.log(`Filtered to ${filteredMatchLinks.length} matches with ${team2Name}`)
        }
      } else {
        console.log(`Showing all ${filteredMatchLinks.length} matches for player ${playerName}`)
      }

      // Convert to matchElements format
      const matchElements: Array<{ href: string; fullUrl: string; matchId?: string; matchTeam1Name: string; matchTeam2Name: string; tournament?: string; score: { team1: number; team2: number; winner: 1 | 2 | null } }> = []

      for (const link of filteredMatchLinks.slice(0, matchLimit)) {
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
          score: link.score || { team1: 0, team2: 0, winner: null },
          tournament: link.tournament
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
          finalMatchElements = aggressiveMatches.slice(0, matchLimit)
        }
      }

      console.log(`Found ${finalMatchElements.length} matches on player page`)

      // Helper function to extract maps played from match header note
      const extractMapsPlayed = (html: string): string[] => {
        const $ = cheerio.load(html)
        const maps: string[] = []

        try {
          const headerNote = $('.match-header-note').text().trim()
          if (!headerNote) return maps

          const parts = headerNote.split(';').map(p => p.trim()).filter(p => p.length > 0)

          for (const part of parts) {
            const pickMatch = part.match(/\b(?:pick|picked)\s+([A-Za-z]+)\b/i)
            if (pickMatch && pickMatch[1]) {
              const mapName = pickMatch[1].trim()
              if (mapName && !maps.includes(mapName)) {
                maps.push(mapName)
              }
            }

            const remainsMatch = part.match(/\b([A-Za-z]+)\s+remains\b/i)
            if (remainsMatch && remainsMatch[1]) {
              const mapName = remainsMatch[1].trim()
              if (mapName && !maps.includes(mapName)) {
                maps.push(mapName)
              }
            }
          }

          return maps
        } catch (error) {
          console.error('Error extracting maps played:', error)
          return maps
        }
      }

      // Helper function to extract VOD links from match HTML (same as team matches)
      const extractVODLinks = (html: string, mapsPlayed: string[]): Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string; mapName?: string }> => {
        const $ = cheerio.load(html)
        const vodLinks: Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string; mapName?: string }> = []
        let youtubeLinkCount = 0

        $('a[href*="youtube.com"], a[href*="youtu.be"], a[href*="twitch.tv"]').each((_, element) => {
          const href = $(element).attr('href')
          if (href) {
            let platform: 'youtube' | 'twitch' | 'other' = 'other'
            let embedUrl: string | undefined
            let mapName: string | undefined = undefined

            if (href.includes('youtube.com') || href.includes('youtu.be')) {
              platform = 'youtube'
              let videoId: string | null = null

              if (href.includes('youtu.be/')) {
                const match = href.match(/youtu\.be\/([^?&]+)/)
                videoId = match ? match[1] : null
              } else if (href.includes('youtube.com/watch')) {
                const match = href.match(/[?&]v=([^&]+)/)
                videoId = match ? match[1] : null
              } else if (href.includes('youtube.com/embed/')) {
                const match = href.match(/embed\/([^?&]+)/)
                videoId = match ? match[1] : null
              }

              if (videoId) {
                const timeMatch = href.match(/[?&]t=(\d+)/)
                const timestamp = timeMatch ? timeMatch[1] : undefined
                const params = new URLSearchParams()
                if (timestamp) params.set('start', timestamp)
                params.set('enablejsapi', '1')
                params.set('origin', typeof window !== 'undefined' ? window.location.origin : '')
                embedUrl = `https://www.youtube.com/embed/${videoId}?${params.toString()}`

                if (mapsPlayed.length > 0 && youtubeLinkCount < mapsPlayed.length) {
                  mapName = mapsPlayed[youtubeLinkCount]
                }
                youtubeLinkCount++
              }
            } else if (href.includes('twitch.tv')) {
              platform = 'twitch'
              const videoMatch = href.match(/twitch\.tv\/videos\/(\d+)/)
              const channelMatch = href.match(/twitch\.tv\/([^/?]+)/)

              if (videoMatch) {
                embedUrl = `https://player.twitch.tv/?video=${videoMatch[1]}&parent=localhost`
              } else if (channelMatch) {
                embedUrl = `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=localhost`
              }
            }

            if (!vodLinks.find(link => link.url === href)) {
              vodLinks.push({
                url: href,
                platform,
                embedUrl,
                mapName
              })
            }
          }
        })

        return vodLinks
      }

      // Helper function to extract match info from match detail page
      const extractMatchInfo = (html: string): MatchData['matchInfo'] | undefined => {
        const $ = cheerio.load(html)

        try {
          const team1Link = $('.match-header-link.mod-1').first()
          const team1Name = team1Link.find('.wf-title-med').text().trim() ||
            team1Link.find('img').attr('alt')?.replace(' team logo', '') ||
            'Team 1'
          const team1Logo = team1Link.find('img').attr('src') || null
          const team1LogoFull = team1Logo && !team1Logo.startsWith('http')
            ? `https:${team1Logo}`
            : team1Logo

          const team2Link = $('.match-header-link.mod-2').first()
          const team2Name = team2Link.find('.wf-title-med').text().trim() ||
            team2Link.find('img').attr('alt')?.replace(' team logo', '') ||
            'Team 2'
          const team2Logo = team2Link.find('img').attr('src') || null
          const team2LogoFull = team2Logo && !team2Logo.startsWith('http')
            ? `https:${team2Logo}`
            : team2Logo

          const scoreContainer = $('.match-header-vs-score').first()
          const team1Score = parseInt(scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').first().text().trim()) || 0
          const team2Score = parseInt(scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').last().text().trim()) || 0

          let winner: 1 | 2 | null = null
          if (team1Score > team2Score) {
            winner = 1
          } else if (team2Score > team1Score) {
            winner = 2
          }

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

      if (finalMatchElements.length === 0) {
        // Additional debugging
        const sampleLinks: string[] = []
        $('a[href]').each((index, element) => {
          if (index < 20) {
            const href = $(element).attr('href')
            if (href && href.startsWith('/')) sampleLinks.push(href)
          }
        })
        console.log('Sample links found on page (first 20):', sampleLinks)
      }

      // Fetch full match detail pages for all matches (like team matches does)
      const matchData: Array<MatchData> = []
      const matchesToFetch = finalMatchElements.slice(0, matchLimit)

      console.log(`Fetching ${matchesToFetch.length} match detail pages for VOD extraction...`)

      for (const matchElement of matchesToFetch) {
        try {
          console.log(`Fetching match ${matchElement.matchId}: ${matchElement.fullUrl}`)
          const matchResponse = await fetch(matchElement.fullUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html',
            },
          })

          if (matchResponse.ok) {
            const matchHtml = await matchResponse.text()
            const mapsPlayed = extractMapsPlayed(matchHtml)
            const vodLinks = extractVODLinks(matchHtml, mapsPlayed)
            const matchInfo = extractMatchInfo(matchHtml)

            matchData.push({
              href: matchElement.fullUrl,
              matchId: matchElement.matchId,
              vodLinks,
              matchInfo: matchInfo || {
                team1: { name: matchElement.matchTeam1Name, logo: null },
                team2: { name: matchElement.matchTeam2Name, logo: null },
                score: matchElement.score,
                winner: matchElement.score.winner
              },
              tournament: matchElement.tournament
            })

            console.log(`Match ${matchElement.matchId}: Found ${vodLinks.length} VOD links, Maps: ${mapsPlayed.join(', ') || 'N/A'}`)
          } else {
            console.log(`Failed to fetch match ${matchElement.matchId}: ${matchResponse.status}`)
            // Still add the match without VODs
            matchData.push({
              href: matchElement.fullUrl,
              matchId: matchElement.matchId,
              vodLinks: [],
              matchInfo: {
                team1: { name: matchElement.matchTeam1Name, logo: null },
                team2: { name: matchElement.matchTeam2Name, logo: null },
                score: matchElement.score,
                winner: matchElement.score.winner
              },
              tournament: matchElement.tournament
            })
          }
        } catch (error) {
          console.error(`Error fetching match ${matchElement.matchId}:`, error)
          // Still add the match without VODs
          matchData.push({
            href: matchElement.fullUrl,
            matchId: matchElement.matchId,
            vodLinks: [],
            matchInfo: {
              team1: { name: matchElement.matchTeam1Name, logo: null },
              team2: { name: matchElement.matchTeam2Name, logo: null },
              score: matchElement.score,
              winner: matchElement.score.winner
            },
            tournament: matchElement.tournament
          })
        }
      }

      console.log(`Successfully fetched ${matchData.length} matches with ${matchData.filter(m => m.vodLinks.length > 0).length} having VODs`)

      return {
        matches: matchData.map(match => ({
          href: match.href,
          matchId: match.matchId,
          vodLinks: match.vodLinks,
          hasVODs: match.vodLinks.length > 0,
          matchInfo: match.matchInfo,
          tournament: match.tournament
        })),
        totalMatches: matchData.length,
        fetchedMatches: matchData.length,
        matchesWithVODs: matchData.filter(m => m.vodLinks.length > 0).length,
        latestMatch: matchData.length > 0 ? matchData[0] : null,
        requestedLimit: matchLimit
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

