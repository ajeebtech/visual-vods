import Redis from 'ioredis'

// Create Redis client (singleton pattern)
let redis: Redis | null = null

export function getRedisClient(): Redis {
  if (redis) {
    return redis
  }

  // Support both local Redis and Upstash Redis
  // Upstash provides a Redis URL in format: redis://default:password@host:port
  // or rediss:// (with TLS) for secure connections
  const redisUrl = (process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || 'redis://localhost:6379').trim()
  
  // Parse Upstash URL if provided
  let redisConfig: any = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY'
      if (err.message.includes(targetError)) {
        return true
      }
      return false
    },
  }

  // If using Upstash or rediss:// (TLS), add TLS configuration
  const isUpstash = redisUrl.includes('upstash.io') || redisUrl.includes('upstash.com')
  const isTLS = redisUrl.startsWith('rediss://')
  
  if (isUpstash || isTLS) {
    redisConfig = {
      ...redisConfig,
      tls: {
        rejectUnauthorized: false
      },
      enableReadyCheck: false,
      maxRetriesPerRequest: null, // Upstash doesn't support this
    }
  }
  
  redis = new Redis(redisUrl, redisConfig)

  redis.on('error', (err) => {
    console.error('Redis Client Error:', err)
  })

  redis.on('connect', () => {
    console.log('Redis Client Connected')
  })

  return redis
}

// Cache helper functions
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 3600
): Promise<T> {
  const client = getRedisClient()
  
  try {
    // Try to get from cache
    const cached = await client.get(key)
    if (cached) {
      return JSON.parse(cached) as T
    }
  } catch (error) {
    console.error('Redis get error:', error)
    // Fall through to fetch fresh data
  }

  // Fetch fresh data
  const data = await fetcher()

  // Cache it
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(data))
  } catch (error) {
    console.error('Redis set error:', error)
    // Continue even if caching fails
  }

  return data
}

// Invalidate cache
export async function invalidateCache(pattern: string): Promise<void> {
  const client = getRedisClient()
  try {
    const keys = await client.keys(pattern)
    if (keys.length > 0) {
      await client.del(...keys)
    }
  } catch (error) {
    console.error('Redis invalidate error:', error)
  }
}

// Get cache key helpers
export function getCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`
}

