import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth } from '@clerk/nextjs/server'
import Redis from 'ioredis'

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify authentication
        const { userId } = getAuth(req)
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const { jobId, videoId } = req.query

        // Check by jobId or videoId
        if (jobId && typeof jobId === 'string') {
            return await getJobStatus(jobId, res)
        } else if (videoId && typeof videoId === 'string') {
            return await getVideoRounds(videoId, res)
        } else {
            return res.status(400).json({ error: 'jobId or videoId is required' })
        }

    } catch (error: any) {
        console.error('Error getting status:', error)
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        })
    }
}

async function getJobStatus(jobId: string, res: NextApiResponse) {
    // Get job status
    const status = await redis.get(`job:${jobId}:status`)

    if (!status) {
        return res.status(404).json({ error: 'Job not found' })
    }

    const response: any = {
        jobId,
        status
    }

    // If completed, get result
    if (status === 'completed') {
        const result = await redis.get(`job:${jobId}:result`)
        if (result) {
            response.result = JSON.parse(result)
        }
    }

    // If failed, get error
    if (status === 'failed') {
        const error = await redis.get(`job:${jobId}:error`)
        if (error) {
            response.error = error
        }
    }

    return res.status(200).json(response)
}

async function getVideoRounds(videoId: string, res: NextApiResponse) {
    // Check cache for video rounds
    const cacheKey = `rounds:${videoId}`
    const cached = await redis.get(cacheKey)

    if (cached) {
        return res.status(200).json({
            cached: true,
            ...JSON.parse(cached)
        })
    }

    return res.status(404).json({
        error: 'Rounds not found',
        message: 'Video has not been processed yet'
    })
}
