import type { NextApiRequest, NextApiResponse } from 'next'

interface MapAgentData {
  mapName: string
  agents: Record<string, number> // agent name -> count
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { matchId } = req.query

  if (!matchId || typeof matchId !== 'string') {
    return res.status(400).json({ error: 'Missing matchId parameter' })
  }

  try {
    const response = await fetch(
      `https://www.vlr.gg${matchId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch match details from VLR.gg')
    }

    const html = await response.text()
    const mapAgentData: MapAgentData[] = []

    // Parse map blocks - look for map switch buttons
    const mapBlocks = html.match(/<div[^>]*class="[^"]*js-map-switch[^"]*"[^>]*data-game-id="([^"]*)"[^>]*>[\s\S]*?<\/div>/g) || []

    for (const block of mapBlocks) {
      // Extract map name
      const mapNameMatch = block.match(/<div[^>]*>[\s\S]*?(\w+)[\s\S]*?<\/div>/)
      // Try to find map name from the structure - maps are usually in spans or divs
      
      // Look for agent images in this map's stats section
      // Agent images are typically in img tags with paths like /img/vlr/game/agents/
      const agentImageMatches = html.match(/\/img\/vlr\/game\/agents\/(\w+)\.png/g) || []
      
      // For now, we'll need to parse the map stats section more carefully
      // This is a simplified version - you may need to adjust based on actual HTML structure
    }

    // Alternative: Parse the stats page directly
    // Try to find map stats sections
    const statsSection = html.match(/<div[^>]*class="[^"]*vm-stats[^"]*"[^>]*>[\s\S]*?<\/div>/)?.[0] || html

    // Extract map names from map switch buttons
    const mapSwitchMatches = html.match(/<div[^>]*class="[^"]*js-map-switch[^"]*"[^>]*>[\s\S]*?<\/div>/g) || []
    
    for (const mapSwitch of mapSwitchMatches) {
      // Try to extract map name - this will depend on the actual HTML structure
      const mapTextMatch = mapSwitch.match(/>([^<]+)</)
      if (mapTextMatch) {
        const mapName = mapTextMatch[1].trim().replace(/\d+\s*/, '').trim() // Remove map number prefix
        
        // Find agents for this map - this requires parsing the stats for each map
        // For now, return structure
        mapAgentData.push({
          mapName,
          agents: {}
        })
      }
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    return res.status(200).json({ mapAgentData, matchId })
  } catch (error: any) {
    console.error('Error fetching VLR.gg match details:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

