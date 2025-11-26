import type { NextApiRequest, NextApiResponse } from 'next'

interface AgentCount {
  agent: string
  page1Count: number
  page2Count: number
  difference: number
}

interface MapData {
  mapName: string
  page1Count: number
  page2Count: number
  difference: number
}

interface MetaResponse {
  agentCounts: AgentCount[]
  mapData: MapData[]
  totalMatchesPage1: number
  totalMatchesPage2: number
}

const VALORANT_AGENTS = [
  'astra', 'breach', 'brimstone', 'chamber', 'clove', 'cypher', 'deadlock', 'fade',
  'gekko', 'harbor', 'iso', 'jett', 'kayo', 'killjoy', 'neon', 'omen',
  'phoenix', 'raze', 'reyna', 'sage', 'skye', 'sova', 'tejo', 'veto', 'viper', 'vyse',
  'waylay', 'yoru'
]

async function fetchMatchResults(page: number) {
  const response = await fetch(
    `https://www.vlr.gg/matches/results/?page=${page}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch page ${page}`)
  }

  return await response.text()
}

async function extractMatchUrls(html: string): Promise<string[]> {
  const matchUrls: string[] = []
  // VLR.gg match URLs are like: /581497/nova-esports-gc-vs-kr-blaze...
  // They're in links with class "wf-module-item match-item"
  const patterns = [
    /href="\/(\d+\/[^"]+)"[^>]*class="[^"]*match-item[^"]*"/g,
    /href="\/(\d+\/[^"]+)"/g,
    /href='\/(\d+\/[^']+)'/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const url = `/${match[1]}`
      // Only add if it looks like a match URL (starts with number, has dash-separated words)
      if (url.match(/^\/\d+\/.+/) && !matchUrls.includes(url)) {
        matchUrls.push(url)
      }
    }
  }

  // Remove duplicates
  const uniqueUrls = Array.from(new Set(matchUrls))
  console.log(`Extracted ${uniqueUrls.length} match URLs`)
  return uniqueUrls
}

async function fetchMatchDetails(matchUrl: string): Promise<{ agents: Record<string, number>, maps: string[] }> {
  try {
    const response = await fetch(
      `https://www.vlr.gg${matchUrl}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      }
    )

    if (!response.ok) {
      return { agents: {}, maps: [] }
    }

    const html = await response.text()
    const agents: Record<string, number> = {}
    const maps: string[] = []

    // Extract agent images - the pattern is /img/vlr/game/agents/{agent}.png
    const agentPattern = /\/img\/vlr\/game\/agents\/([a-z]+)\.(png|webp)/gi
    let match
    
    while ((match = agentPattern.exec(html)) !== null) {
      const agentName = match[1].toLowerCase().trim()
      if (agentName && VALORANT_AGENTS.includes(agentName)) {
        agents[agentName] = (agents[agentName] || 0) + 1
      }
    }

    // Extract map names from map switch buttons
    const VALORANT_MAPS = ['bind', 'haven', 'split', 'ascent', 'icebox', 'breeze', 'fracture', 'pearl', 'lotus', 'sunset', 'abyss', 'coliseo', 'district', 'kuronami', 'pitt']
    const mapPattern = /<div[^>]*class="[^"]*js-map-switch[^"]*"[^>]*>[\s\S]*?(\d+)\s+(\w+)/gi
    let mapMatch
    
    while ((mapMatch = mapPattern.exec(html)) !== null) {
      const mapName = mapMatch[2].toLowerCase()
      if (mapName && VALORANT_MAPS.includes(mapName) && !maps.includes(mapName)) {
        maps.push(mapName)
      }
    }

    return { agents, maps }
  } catch (error) {
    console.error(`Error fetching match ${matchUrl}:`, error)
    return { agents: {}, maps: [] }
  }
}

async function processPage(page: number, maxMatches: number = 20): Promise<{ agentCounts: Record<string, number>, mapCounts: Record<string, number>, totalMatches: number }> {
  const html = await fetchMatchResults(page)
  const matchUrls = await extractMatchUrls(html)
  
  // Limit matches to process (for performance)
  const matchesToProcess = matchUrls.slice(0, maxMatches)
  
  // Aggregate all agent counts and map counts across all matches
  const agentCounts: Record<string, number> = {}
  const mapCounts: Record<string, number> = {}

  // Process matches in batches (but limit concurrency to avoid rate limiting)
  const batchSize = 5
  for (let i = 0; i < matchesToProcess.length; i += batchSize) {
    const batch = matchesToProcess.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(url => fetchMatchDetails(url)))

    // Aggregate agent counts and map counts from all matches
    results.forEach(({ agents, maps }) => {
      Object.entries(agents).forEach(([agent, count]) => {
        agentCounts[agent] = (agentCounts[agent] || 0) + count
      })
      maps.forEach(map => {
        mapCounts[map] = (mapCounts[map] || 0) + 1
      })
    })
  }

  return { agentCounts, mapCounts, totalMatches: matchesToProcess.length }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Process both pages in parallel
    const [page1Data, page2Data] = await Promise.all([
      processPage(1, 20), // Process first 20 matches from page 1
      processPage(2, 20)  // Process first 20 matches from page 2
    ])

    // Combine agent counts and calculate differences (page 1 compared to page 2)
    const agentCounts: AgentCount[] = VALORANT_AGENTS.map(agent => {
      const page1Count = page1Data.agentCounts[agent] || 0
      const page2Count = page2Data.agentCounts[agent] || 0
      
      return {
        agent,
        page1Count,
        page2Count,
        difference: page1Count - page2Count // Compare page 1 (latest) to page 2 (older) - positive = increase, negative = decrease
      }
    }).filter(ac => ac.page1Count > 0 || ac.page2Count > 0) // Only show agents that appear

    // Sort by total usage (descending)
    agentCounts.sort((a, b) => {
      const totalA = a.page1Count + a.page2Count
      const totalB = b.page1Count + b.page2Count
      return totalB - totalA
    })

    // Combine map counts and calculate differences
    const allMaps = new Set([...Object.keys(page1Data.mapCounts), ...Object.keys(page2Data.mapCounts)])
    const mapData: MapData[] = Array.from(allMaps).map(mapName => {
      const page1Count = page1Data.mapCounts[mapName] || 0
      const page2Count = page2Data.mapCounts[mapName] || 0
      
      return {
        mapName: mapName.charAt(0).toUpperCase() + mapName.slice(1), // Capitalize
        page1Count,
        page2Count,
        difference: page1Count - page2Count
      }
    }).filter(m => m.page1Count > 0 || m.page2Count > 0)
    .sort((a, b) => {
      const totalA = a.page1Count + a.page2Count
      const totalB = b.page1Count + b.page2Count
      return totalB - totalA
    })

    const response: MetaResponse = {
      agentCounts,
      mapData,
      totalMatchesPage1: page1Data.totalMatches,
      totalMatchesPage2: page2Data.totalMatches
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    return res.status(200).json(response)
  } catch (error: any) {
    console.error('Error fetching meta data:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

