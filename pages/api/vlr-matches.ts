import type { NextApiRequest, NextApiResponse } from 'next'

interface MatchData {
  matchId: string
  team1: string
  team2: string
  maps: Array<{
    mapName: string
    matchUrl: string
  }>
}

interface ParsedMatch {
  matchId: string
  team1: string
  team2: string
  maps: string[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { page } = req.query
  const pageNum = page ? parseInt(page as string) : 1

  try {
    const response = await fetch(
      `https://www.vlr.gg/matches/results/?page=${pageNum}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch from VLR.gg')
    }

    const html = await response.text()
    const matches: ParsedMatch[] = []

    // Parse HTML to extract match information
    // Match items are typically in anchor tags with href to match pages
    const matchLinks = html.match(/<a[^>]*href="(\/matches\/\d+\/[^"]+)"[^>]*>[\s\S]*?<\/a>/g) || []

    for (const link of matchLinks) {
      // Extract match URL and ID
      const matchUrlMatch = link.match(/href="(\/matches\/(\d+)\/[^"]+)"/)
      if (!matchUrlMatch) continue

      const matchUrl = matchUrlMatch[1]
      const matchId = matchUrlMatch[2]

      // Extract team names - look for team name patterns in the link content
      const teamPatterns = [
        /<div[^>]*class="[^"]*mod-team[^"]*"[^>]*>[\s\S]*?<div[^>]*>([^<]+)<\/div>/g,
        /<span[^>]*>([A-Z][A-Za-z0-9\s]+)<\/span>/g
      ]

      const teams: string[] = []
      for (const pattern of teamPatterns) {
        const teamMatches = Array.from(link.matchAll(pattern))
        teamMatches.forEach(match => {
          const teamName = match[1]?.trim()
          if (teamName && teamName.length > 1 && teams.length < 2) {
            teams.push(teamName)
          }
        })
      }

      // Try alternative pattern - direct text extraction
      if (teams.length < 2) {
        const textContent = link.replace(/<[^>]+>/g, ' ').trim()
        const words = textContent.split(/\s+/).filter(w => w.length > 2)
        // Look for capitalized words that might be team names
        const potentialTeams = words.filter(w => /^[A-Z]/.test(w))
        if (potentialTeams.length >= 2) {
          teams.push(...potentialTeams.slice(0, 2))
        }
      }

      if (teams.length >= 2 && matchId) {
        matches.push({
          matchId,
          team1: teams[0],
          team2: teams[1],
          maps: [] // Will be populated when we fetch individual match pages
        })
      }
    }

    // Remove duplicates based on matchId
    const uniqueMatches = matches.filter((match, index, self) =>
      index === self.findIndex(m => m.matchId === match.matchId)
    )

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    return res.status(200).json({ matches: uniqueMatches, page: pageNum })
  } catch (error: any) {
    console.error('Error fetching VLR.gg matches:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

