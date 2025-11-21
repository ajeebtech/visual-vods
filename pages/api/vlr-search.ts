import type { NextApiRequest, NextApiResponse } from 'next'
import { getCached, getCacheKey } from '../../lib/redis'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { term } = req.query

  if (!term || typeof term !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid term parameter' })
  }

  const cacheKey = getCacheKey('vlr:search', term.toLowerCase())

  try {
    const data = await getCached(
      cacheKey,
      async () => {
    const response = await fetch(
      `https://www.vlr.gg/search/auto/?term=${encodeURIComponent(term)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
          throw new Error('Failed to fetch from VLR.gg')
    }

        return await response.json()
      },
      1800 // 30 minutes TTL
    )
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    return res.status(200).json(data)
  } catch (error: any) {
    console.error('Error proxying VLR.gg request:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}

