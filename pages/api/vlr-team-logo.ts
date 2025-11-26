import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { teamId } = req.query

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'Team ID is required' })
  }

  try {
    // Fetch team page to get logo URL
    const response = await fetch(
      `https://www.vlr.gg/team/${teamId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      }
    )

    if (!response.ok) {
      return res.status(404).json({ error: 'Team not found' })
    }

    const html = await response.text()
    
    // Extract logo URL from team header
    // Look for: <img src="//owcdn.net/img/..." alt="... team logo">
    const logoMatch = html.match(/<img[^>]*src="([^"]*)"[^>]*alt="[^"]*team logo"/i)
    
    if (logoMatch && logoMatch[1]) {
      let logoUrl = logoMatch[1]
      // Ensure full URL
      if (logoUrl.startsWith('//')) {
        logoUrl = `https:${logoUrl}`
      } else if (logoUrl.startsWith('/')) {
        logoUrl = `https://www.vlr.gg${logoUrl}`
      }
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
      
      return res.status(200).json({ logo: logoUrl })
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    return res.status(200).json({ logo: null })
  } catch (error: any) {
    console.error('Error fetching team logo:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

