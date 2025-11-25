import type { NextApiRequest, NextApiResponse } from 'next'
import * as cheerio from 'cheerio'
import { getCached, getCacheKey } from '../../lib/redis'

interface MapStat {
  mapName: string
  winPercent: string
  wins: number
  losses: number
  mostPlayedComp: string[] // Array of agent names
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { teamId } = req.query

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid teamId parameter' })
  }

  const cacheKey = getCacheKey('vlr:team-stats', teamId)

  try {
    const data = await getCached(
      cacheKey,
      async () => {
        const url = `https://www.vlr.gg/team/stats/${teamId}/`
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch team stats: ${response.status}`)
        }

        const html = await response.text()
        const $ = cheerio.load(html)

        const mapStats: MapStat[] = []

        // Find the stats table - looking for table rows with map data
        // The table structure: Map | Expand | WIN% | W | L | ... | Agent Compositions
        $('table tbody tr').each((_, row) => {
          const $row = $(row)
          const cells = $row.find('td')
          
          // Need at least 5 columns (Map, Expand, WIN%, W, L)
          if (cells.length < 5) return
          
          // Get map name from the first cell (format: "MapName (count)")
          const mapNameCell = $(cells[0])
          const mapNameText = mapNameCell.text().trim()
          
          // Extract map name, removing the count in parentheses
          const mapNameMatch = mapNameText.match(/^([^(]+)/)
          if (!mapNameMatch) return
          
          const mapName = mapNameMatch[1].trim()
          if (!mapName) return
          
          // WIN% is in the 3rd column (index 2)
          const winPercent = $(cells[2]).text().trim()
          
          // W (wins) is in the 4th column (index 3)
          const winsText = $(cells[3]).text().trim()
          const wins = parseInt(winsText, 10) || 0
          
          // L (losses) is in the 5th column (index 4)
          const lossesText = $(cells[4]).text().trim()
          const losses = parseInt(lossesText, 10) || 0
          
          // Find most played composition - look for the first agent-comp-agg div
          // The most played comp is typically the first one listed with the highest count
          const agentComps: string[] = []
          const firstCompSection = $row.find('.agent-comp-agg.mod-first, .agent-comp-agg').first()
          
          if (firstCompSection.length > 0) {
            // Find all agent images in the first composition section
            firstCompSection.find('img[src*="/agents/"]').each((_, img) => {
              const src = $(img).attr('src') || ''
              // Extract agent name from path like /img/vlr/game/agents/jett.png
              const agentMatch = src.match(/\/agents\/([^.]+)\.png/)
              if (agentMatch) {
                const agentName = agentMatch[1] // Keep lowercase for image path
                agentComps.push(agentName)
              }
            })
          } else {
            // Fallback: look for agent images anywhere in the row
            $row.find('img[src*="/agents/"]').slice(0, 5).each((_, img) => {
              const src = $(img).attr('src') || ''
              const agentMatch = src.match(/\/agents\/([^.]+)\.png/)
              if (agentMatch) {
                const agentName = agentMatch[1] // Keep lowercase for image path
                agentComps.push(agentName)
              }
            })
          }
          
          // Only add if we have valid data
          if (mapName && winPercent && !isNaN(wins) && !isNaN(losses)) {
            mapStats.push({
              mapName,
              winPercent,
              wins,
              losses,
              mostPlayedComp: agentComps.slice(0, 5) // Take first 5 agents
            })
          }
        })

        return { mapStats }
      },
      3600 // Cache for 1 hour
    )

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    return res.status(200).json(data)
  } catch (error: any) {
    console.error('Error fetching team stats:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

