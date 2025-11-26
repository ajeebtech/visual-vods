import type { NextApiRequest, NextApiResponse } from 'next'
import * as cheerio from 'cheerio'
import { getCached, getCacheKey } from '../../lib/redis'

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
    mapName?: string // Map name extracted from match header note
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
  mapsPlayed?: string[] // List of maps that were played (picked or remains)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { teamId, teamName, team2Id, team2Name } = req.query

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid teamId parameter' })
  }

  if (!teamName || typeof teamName !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid teamName parameter' })
  }

  // If team2 is provided, we'll fetch from team2's matches page and filter
  const hasTeam2 = team2Id && typeof team2Id === 'string' && team2Name && typeof team2Name === 'string'
  const targetTeamId = hasTeam2 ? team2Id : teamId
  const targetTeamName = hasTeam2 ? team2Name : teamName
  const filterTeam1Name = hasTeam2 ? teamName : null // Team to filter for when team2 is provided

  // Create cache key based on query params
  const cacheKey = getCacheKey(
    'vlr:team-matches',
    teamId,
    teamName.toLowerCase(),
    hasTeam2 ? team2Id : 'none',
    hasTeam2 ? team2Name.toLowerCase() : 'none'
  )

  try {
    // Cache for 1 hour (3600 seconds) - VLR data doesn't change often
    const data = await getCached(
      cacheKey,
      async () => {
        // Helper function to fetch matches from a specific page
        const fetchMatchesPage = async (page: number = 1): Promise<{ matchLinks: MatchLink[], hasMorePages: boolean }> => {
          const currentPageNum = page
          // Convert team name to lowercase and replace spaces with hyphens for URL
          const teamSlug = targetTeamName.toLowerCase().replace(/\s+/g, '-')
          const url = page === 1
            ? `https://www.vlr.gg/team/matches/${targetTeamId}/${teamSlug}/`
            : `https://www.vlr.gg/team/matches/${targetTeamId}/${teamSlug}/?group=completed&page=${page}`

          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html',
            },
          })

          if (!response.ok) {
            return { matchLinks: [], hasMorePages: false }
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

          // Check if there are more pages by looking for pagination
          // Look for pagination links that indicate a next page exists
          let hasMorePages = false

          // Check for pagination buttons/links
          const paginationLinks = $('.pagination a, .page-link, a[href*="page="]')
          paginationLinks.each((_, element) => {
            const href = $(element).attr('href')
            const text = $(element).text().toLowerCase().trim()

            // Check if there's a next page link or a page number higher than current
            if (href && href.includes('page=')) {
              const pageMatch = href.match(/page=(\d+)/)
              if (pageMatch) {
                const pageNum = parseInt(pageMatch[1])
                if (pageNum > currentPageNum) {
                  hasMorePages = true
                  return false // Break the loop
                }
              }
            }

            // Check for "next" or ">" indicators
            if (text === 'next' || text === '>' || text.includes('next')) {
              hasMorePages = true
              return false // Break the loop
            }
          })

          // Also check if we found matches on this page (if no matches, probably no more pages)
          if (uniqueMatchLinks.length === 0 && currentPageNum > 1) {
            hasMorePages = false
          }

          return { matchLinks: uniqueMatchLinks, hasMorePages }
        }

        // Fetch matches from multiple pages if needed
        const allMatchLinks: MatchLink[] = []
        const seenMatchIds = new Set<string>()
        let currentPage = 1
        let hasMorePages = true
        const maxPages = 10 // Limit to 10 pages to avoid infinite loops

        while (hasMorePages && currentPage <= maxPages) {
          console.log(`Fetching page ${currentPage}...`)
          const { matchLinks, hasMorePages: morePages } = await fetchMatchesPage(currentPage)

          // Add unique match links
          for (const link of matchLinks) {
            if (link.matchId && !seenMatchIds.has(link.matchId)) {
              seenMatchIds.add(link.matchId)
              allMatchLinks.push(link)
            } else if (!link.matchId) {
              // If no matchId, check by href
              const exists = allMatchLinks.some(l => l.href === link.href)
              if (!exists) {
                allMatchLinks.push(link)
              }
            }
          }

          hasMorePages = morePages && matchLinks.length > 0
          currentPage++

          // If we're filtering by team2, stop if we have enough matches (50)
          if (hasTeam2 && allMatchLinks.length >= 50) {
            break
          }
        }

        console.log(`Found ${allMatchLinks.length} total match links across ${currentPage - 1} pages`)

        // Helper function to extract match date from HTML
        const extractMatchDate = (html: string): string | undefined => {
          const $ = cheerio.load(html)

          try {
            // Strategy 1: Look for the new header format (text in .match-header-event > div)
            // Content example: "Game Changers 2025: Championship Seoul\nMain Event: Upper Semifinals\nWednesday, November 26\n4:30 PM IST\nPatch 11.09"
            const headerEventDiv = $('.match-header-event > div').first()
            if (headerEventDiv.length) {
              const text = headerEventDiv.text()
              // Split by newlines and clean up
              const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

              let dateStr = ''
              let timeStr = ''
              let year = new Date().getFullYear().toString()

              // Try to find year in the first few lines (e.g. "Game Changers 2025")
              for (const line of lines) {
                const yearMatch = line.match(/\b20\d{2}\b/)
                if (yearMatch) {
                  year = yearMatch[0]
                  break
                }
              }

              // Try to find date line (e.g. "Wednesday, November 26")
              // Look for month names
              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
              const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

              for (const line of lines) {
                // Check if line contains a month
                const hasMonth = months.some(m => line.includes(m)) || shortMonths.some(m => line.includes(m))
                // Check if line contains a digit (day)
                const hasDigit = /\d/.test(line)

                if (hasMonth && hasDigit && !line.includes(':')) { // Exclude lines with time like "4:30 PM" if they have month (unlikely but safe)
                  dateStr = line
                  // Remove day name if present (e.g. "Wednesday, ")
                  dateStr = dateStr.replace(/^[A-Za-z]+,\s*/, '')
                  break
                }
              }

              // Try to find time line (e.g. "4:30 PM IST")
              for (const line of lines) {
                if (line.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)) {
                  timeStr = line
                  break
                }
              }

              if (dateStr) {
                // Construct full date string
                // If dateStr already has year, don't add it
                const fullDateStr = dateStr.match(/\d{4}/)
                  ? `${dateStr} ${timeStr}`
                  : `${dateStr}, ${year} ${timeStr}`

                const parsed = new Date(fullDateStr)
                if (!isNaN(parsed.getTime())) {
                  return parsed.toISOString()
                }
              }
            }

            // Strategy 2: Try to find date in various common locations (Legacy/Fallback)
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

            // Strategy 3: Try to find date in page metadata or structured data
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

        // Helper function to extract maps played from match header note
        const extractMapsPlayed = (html: string): string[] => {
          const $ = cheerio.load(html)
          const maps: string[] = []

          try {
            // Find the match header note element
            const headerNote = $('.match-header-note').text().trim()

            if (!headerNote) {
              return maps
            }

            // Parse the header note to extract maps
            // Format: "NRG ban Bind; NRG ban Sunset; NRG pick Corrode; G2 pick Split; NRG pick Pearl; G2 pick Abyss; Haven remains"
            // We want maps that were "picked" or "remains"
            const parts = headerNote.split(';').map(p => p.trim()).filter(p => p.length > 0)

            for (const part of parts) {
              // Check for "pick <map>" pattern (e.g., "NRG pick Corrode" or "pick Corrode")
              // Match word after "pick" or "picked"
              const pickMatch = part.match(/\b(?:pick|picked)\s+([A-Za-z]+)\b/i)
              if (pickMatch && pickMatch[1]) {
                const mapName = pickMatch[1].trim()
                if (mapName && !maps.includes(mapName)) {
                  maps.push(mapName)
                }
              }

              // Check for "<map> remains" pattern (e.g., "Haven remains")
              // Match word before "remains"
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

        // Helper function to extract VOD links from match HTML
        const extractVODLinks = (html: string, mapsPlayed: string[]): Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string; mapName?: string }> => {
          const $ = cheerio.load(html)
          const vodLinks: Array<{ url: string; platform: 'youtube' | 'twitch' | 'other'; embedUrl?: string; mapName?: string }> = []
          let youtubeLinkCount = 0 // Track only YouTube links for map name assignment

          // Find all links that might be VOD links
          // Look for links in VOD sections, typically with classes like 'od-dark', 'wf-label' containing 'VOD'
          $('a[href*="youtube.com"], a[href*="youtu.be"], a[href*="twitch.tv"]').each((_, element) => {
            const href = $(element).attr('href')
            if (href) {
              let platform: 'youtube' | 'twitch' | 'other' = 'other'
              let embedUrl: string | undefined
              let mapName: string | undefined = undefined

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
                  // Add enablejsapi=1 to enable YouTube IFrame API for getting current time
                  const params = new URLSearchParams()
                  if (timestamp) params.set('start', timestamp)
                  params.set('enablejsapi', '1')
                  params.set('origin', typeof window !== 'undefined' ? window.location.origin : '')
                  embedUrl = `https://www.youtube.com/embed/${videoId}?${params.toString()}`

                  // Assign map name to YouTube links only, based on YouTube link index
                  if (mapsPlayed.length > 0 && youtubeLinkCount < mapsPlayed.length) {
                    mapName = mapsPlayed[youtubeLinkCount]
                  }
                  youtubeLinkCount++
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
                // Twitch links don't get map names
              }

              // Only add if we haven't seen this URL before
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

        // Fetch each match page (limit to first 50 matches) - use unique links
        const matchesToFetch = allMatchLinks.slice(0, 50)
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
              const mapsPlayed = extractMapsPlayed(matchHtml)
              const vodLinks = extractVODLinks(matchHtml, mapsPlayed)
              const matchInfo = extractMatchInfo(matchHtml)
              const matchDate = extractMatchDate(matchHtml)

              // If filtering by team2, only include matches where both teams played
              if (hasTeam2 && filterTeam1Name && matchInfo) {
                // Normalize team names for comparison (remove extra spaces, convert to lowercase)
                const normalizeName = (name: string) => name.toLowerCase().trim().replace(/\s+/g, ' ')
                const team1NameNormalized = normalizeName(matchInfo.team1.name)
                const team2NameNormalized = normalizeName(matchInfo.team2.name)
                const filterTeam1NameNormalized = normalizeName(filterTeam1Name)
                const targetTeamNameNormalized = normalizeName(targetTeamName)

                // Check if the match is between the two teams (either order)
                const isMatchBetweenTeams =
                  (team1NameNormalized === filterTeam1NameNormalized && team2NameNormalized === targetTeamNameNormalized) ||
                  (team1NameNormalized === targetTeamNameNormalized && team2NameNormalized === filterTeam1NameNormalized)

                if (!isMatchBetweenTeams) {
                  console.log(`Skipping match ${matchLink.matchId}: ${matchInfo.team1.name} vs ${matchInfo.team2.name} (not ${filterTeam1Name} vs ${targetTeamName})`)
                  continue // Skip this match
                }
              }

              matchData.push({
                href: matchLink.href,
                html: matchHtml,
                matchId: matchLink.matchId,
                date: matchDate,
                vodLinks,
                matchInfo,
                mapsPlayed
              })

              console.log(`Match ${matchLink.matchId}: Found ${vodLinks.length} VOD links, Maps: ${mapsPlayed.join(', ') || 'N/A'}, Date: ${matchDate || 'N/A'}, Match: ${matchInfo?.team1.name} vs ${matchInfo?.team2.name} ${matchInfo?.score.team1}:${matchInfo?.score.team2}`)
            }
          } catch (error) {
            console.error(`Error fetching match ${matchLink.href}:`, error)
          }
        }

        // Return the data to be cached
        return {
          teamId,
          teamName,
          team2Id: hasTeam2 ? team2Id : undefined,
          team2Name: hasTeam2 ? team2Name : undefined,
          url: hasTeam2 ? `https://www.vlr.gg/team/matches/${targetTeamId}/${targetTeamName.toLowerCase().replace(/\s+/g, '-')}/` : undefined,
          matchLinks: allMatchLinks.map(link => ({
            href: link.href,
            fullUrl: link.fullUrl,
            matchId: link.matchId
          })),
          totalMatches: allMatchLinks.length,
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
        }
      },
      3600 // 1 hour TTL
    )

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    return res.status(200).json(data)
  } catch (error: any) {
    console.error('Error proxying VLR.gg team matches request:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

