import { NextApiRequest, NextApiResponse } from 'next'
import { getAuth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import Redis from 'ioredis'

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify authentication
        const { userId } = getAuth(req)
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const { videoUrl, matchHref, sessionId } = req.body

        if (!videoUrl) {
            return res.status(400).json({ error: 'videoUrl is required' })
        }

        // Validate YouTube URL
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[\w-]+/
        if (!youtubeRegex.test(videoUrl)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' })
        }

        // Extract video ID for caching
        const videoId = extractVideoId(videoUrl)
        if (!videoId) {
            return res.status(400).json({ error: 'Could not extract video ID' })
        }

        // Check if already cached
        const cacheKey = `rounds:${videoId}`
        const cached = await redis.get(cacheKey)

        if (cached) {
            console.log(`Found cached rounds for video ${videoId}`)
            return res.status(200).json({
                cached: true,
                ...JSON.parse(cached)
            })
        }

        // Generate job ID
        const jobId = uuidv4()

        // Create job data
        const jobData = {
            jobId,
            videoUrl,
            videoId,
            matchHref,
            sessionId,
            userId,
            createdAt: new Date().toISOString()
        }

        // Add job to queue
        await redis.lpush('job_queue', JSON.stringify(jobData))

        // Set initial job status
        await redis.setex(`job:${jobId}:status`, 3600, 'queued')

        console.log(`Queued job ${jobId} for video ${videoId}`)

        return res.status(200).json({
            jobId,
            status: 'queued',
            message: 'Video processing queued'
        })

    } catch (error: any) {
        console.error('Error processing request:', error)
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        })
    }
}

function extractVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    ]

    for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }

    return null
}
