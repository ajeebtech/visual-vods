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

    const { tournamentId, team1Id, team2Id, limit } = req.query

    if (!tournamentId || typeof tournamentId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid tournamentId parameter' })
    }

    const DEFAULT_LIMIT = 50
    const MIN_LIMIT = 10
    const MAX_LIMIT = 150

    let matchLimit = DEFAULT_LIMIT
    if (typeof limit === 'string') {
        const parsed = parseInt(limit, 10)
        if (!Number.isNaN(parsed)) {
            matchLimit = Math.max(MIN_LIMIT, Math.min(parsed, MAX_LIMIT))
        }
    }

    // Create cache key based on query params
    const cacheKey = getCacheKey(
        'vlr:tournament-matches',
        tournamentId,
        team1Id ? `t1:${team1Id}` : 'none',
        team2Id ? `t2:${team2Id}` : 'none',
        `limit:${matchLimit}`
    )

    try {
        // Cache for 1 hour (3600 seconds) - VLR data doesn't change often
        const data = await getCached(
            cacheKey,
            async () => {
                // Helper function to fetch matches from a specific page
                const fetchMatchesPage = async (): Promise<{ matchLinks: MatchLink[], hasMorePages: boolean }> => {
                    // Tournament matches are usually on a single page or paginated differently
                    // For now, we'll fetch the main matches page
                    // URL format: https://www.vlr.gg/event/matches/{id}/?series_id=all
                    const url = `https://www.vlr.gg/event/matches/${tournamentId}/?series_id=all`

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

                    // Extract match links
                    const matchLinks: MatchLink[] = []
                    const seenHrefsInitial = new Set<string>()

                    // Look for match links in the event matches page
                    // Usually they are in .wf-card or similar containers
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

                    return { matchLinks, hasMorePages: false } // Assuming single page for now or "load more" which is harder to scrape
                }

                const { matchLinks } = await fetchMatchesPage()
                console.log(`Found ${matchLinks.length} total match links for tournament ${tournamentId}`)

                // Helper function to extract match date from HTML (reused from vlr-team-matches.ts)
                const extractMatchDate = (html: string): string | undefined => {
                    const $ = cheerio.load(html)
                    try {
                        const headerEventDiv = $('.match-header-event > div').first()
                        if (headerEventDiv.length) {
                            const text = headerEventDiv.text()
                            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
                            let dateStr = ''
                            let timeStr = ''
                            let year = new Date().getFullYear().toString()

                            for (const line of lines) {
                                const yearMatch = line.match(/\b20\d{2}\b/)
                                if (yearMatch) {
                                    year = yearMatch[0]
                                    break
                                }
                            }

                            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                            const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

                            for (const line of lines) {
                                const hasMonth = months.some(m => line.includes(m)) || shortMonths.some(m => line.includes(m))
                                const hasDigit = /\d/.test(line)
                                if (hasMonth && hasDigit && !line.includes(':')) {
                                    dateStr = line.replace(/^[A-Za-z]+,\s*/, '')
                                    break
                                }
                            }

                            for (const line of lines) {
                                if (line.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)) {
                                    timeStr = line
                                    break
                                }
                            }

                            if (dateStr) {
                                const fullDateStr = dateStr.match(/\d{4}/)
                                    ? `${dateStr} ${timeStr}`
                                    : `${dateStr}, ${year} ${timeStr}`
                                const parsed = new Date(fullDateStr)
                                if (!isNaN(parsed.getTime())) {
                                    return parsed.toISOString()
                                }
                            }
                        }

                        // Fallback strategies
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
                        const team1Link = $('.match-header-link.mod-1').first()
                        const team1Name = team1Link.find('.wf-title-med').text().trim() || 'Team 1'
                        const team1Logo = team1Link.find('img').attr('src') || null
                        const team1LogoFull = team1Logo && !team1Logo.startsWith('http') ? `https:${team1Logo}` : team1Logo

                        const team2Link = $('.match-header-link.mod-2').first()
                        const team2Name = team2Link.find('.wf-title-med').text().trim() || 'Team 2'
                        const team2Logo = team2Link.find('img').attr('src') || null
                        const team2LogoFull = team2Logo && !team2Logo.startsWith('http') ? `https:${team2Logo}` : team2Logo

                        const scoreContainer = $('.match-header-vs-score').first()
                        const team1Score = parseInt(scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').first().text().trim()) || 0
                        const team2Score = parseInt(scoreContainer.find('.match-header-vs-score-loser, .match-header-vs-score-winner').last().text().trim()) || 0

                        let winner: 1 | 2 | null = null
                        if (team1Score > team2Score) winner = 1
                        else if (team2Score > team1Score) winner = 2

                        return {
                            team1: { name: team1Name, logo: team1LogoFull },
                            team2: { name: team2Name, logo: team2LogoFull },
                            score: { team1: team1Score, team2: team2Score },
                            winner
                        }
                    } catch (error) {
                        console.error('Error extracting match info:', error)
                        return undefined
                    }
                }

                // Helper function to extract maps played
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
                                if (mapName && !maps.includes(mapName)) maps.push(mapName)
                            }
                            const remainsMatch = part.match(/\b([A-Za-z]+)\s+remains\b/i)
                            if (remainsMatch && remainsMatch[1]) {
                                const mapName = remainsMatch[1].trim()
                                if (mapName && !maps.includes(mapName)) maps.push(mapName)
                            }
                        }
                        return maps
                    } catch (error) {
                        console.error('Error extracting maps played:', error)
                        return maps
                    }
                }

                // Helper function to extract VOD links
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
                                if (href.includes('youtu.be/')) videoId = href.match(/youtu\.be\/([^?&]+)/)?.[1] || null
                                else if (href.includes('youtube.com/watch')) videoId = href.match(/[?&]v=([^&]+)/)?.[1] || null
                                else if (href.includes('youtube.com/embed/')) videoId = href.match(/embed\/([^?&]+)/)?.[1] || null

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
                                if (videoMatch) embedUrl = `https://player.twitch.tv/?video=${videoMatch[1]}&parent=${req.headers.host || 'localhost:3000'}`
                                else if (channelMatch) embedUrl = `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${req.headers.host || 'localhost:3000'}`
                            }

                            if (!vodLinks.find(link => link.url === href)) {
                                vodLinks.push({ url: href, platform, embedUrl, mapName })
                            }
                        }
                    })
                    return vodLinks
                }

                // Fetch matches
                const matchData: MatchData[] = []
                // Limit fetching to avoid timeouts
                const matchesToFetch = matchLinks.slice(0, matchLimit)

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
                            const matchInfo = extractMatchInfo(matchHtml)

                            // Filter logic
                            if (matchInfo) {
                                const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
                                const t1Name = normalize(matchInfo.team1.name)
                                const t2Name = normalize(matchInfo.team2.name)

                                // If team1Id is provided, one of the teams must match team1
                                // Note: We don't have team names passed in query for validation, so we rely on what we find in the match
                                // Ideally we should pass team names too, but for now let's assume if we filter by ID we want to match loosely by name if possible
                                // OR we just return all matches and let frontend filter? No, better to filter here if possible.
                                // But we only have IDs. 
                                // Actually, let's fetch all matches for the tournament and THEN filter if we can't easily match IDs to names here.
                                // However, the prompt says "if two teams were in the search, find those two teams in the tournament and get those matches only"

                                // Since we don't have team names in the query params for this endpoint yet (I didn't add them), 
                                // let's rely on the fact that we return all matches and let the frontend filter? 
                                // NO, that's inefficient.
                                // Let's assume the user passes team names in the query params if they want filtering.
                                // I'll update the handler to accept team names.
                            }

                            const mapsPlayed = extractMapsPlayed(matchHtml)
                            const vodLinks = extractVODLinks(matchHtml, mapsPlayed)
                            const matchDate = extractMatchDate(matchHtml)

                            matchData.push({
                                href: matchLink.href,
                                html: matchHtml,
                                matchId: matchLink.matchId,
                                date: matchDate,
                                vodLinks,
                                matchInfo,
                                mapsPlayed
                            })
                        }
                    } catch (error) {
                        console.error(`Error fetching match ${matchLink.href}:`, error)
                    }
                }

                // Filter matches based on team names if provided
                // We need team names to filter effectively since match info only has names
                // I'll update the query params to include team names

                return {
                    tournamentId,
                    matchLinks: matchLinks.map(link => ({
                        href: link.href,
                        fullUrl: link.fullUrl,
                        matchId: link.matchId
                    })),
                    totalMatches: matchLinks.length,
                    requestedLimit: matchLimit,
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
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600')

        // Post-processing filter (since we cache the full tournament result usually)
        // Actually, if we cache based on team filters, we bake the filtering into the cache.
        // Let's do that.

        let filteredMatches = data.matches
        const { team1Name, team2Name } = req.query

        if (team1Name && typeof team1Name === 'string') {
            const t1 = team1Name.toLowerCase().trim()
            filteredMatches = filteredMatches.filter((m: any) => {
                if (!m.matchInfo) return false
                const mt1 = m.matchInfo.team1.name.toLowerCase().trim()
                const mt2 = m.matchInfo.team2.name.toLowerCase().trim()
                return mt1.includes(t1) || mt2.includes(t1) || t1.includes(mt1) || t1.includes(mt2)
            })
        }

        if (team2Name && typeof team2Name === 'string') {
            const t2 = team2Name.toLowerCase().trim()
            filteredMatches = filteredMatches.filter((m: any) => {
                if (!m.matchInfo) return false
                const mt1 = m.matchInfo.team1.name.toLowerCase().trim()
                const mt2 = m.matchInfo.team2.name.toLowerCase().trim()
                return mt1.includes(t2) || mt2.includes(t2) || t2.includes(mt1) || t2.includes(mt2)
            })
        }

        return res.status(200).json({
            ...data,
            matches: filteredMatches,
            totalMatches: filteredMatches.length // Update total to reflect filter
        })
    } catch (error: any) {
        console.error('Error proxying VLR.gg tournament matches request:', error)
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
