/**
 * Local storage-based caching utility
 * Provides client-side caching for API responses
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

/**
 * Get a cache key from parts
 */
export function getCacheKey(...parts: (string | number | null | undefined)[]): string {
  return parts
    .filter(part => part !== null && part !== undefined)
    .map(part => String(part).toLowerCase().replace(/\s+/g, '-'))
    .join(':')
}

/**
 * Get cached data if it exists and is not expired
 */
export function getCached<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null // Server-side rendering - no localStorage
  }

  try {
    const cached = localStorage.getItem(`cache:${key}`)
    if (!cached) {
      return null
    }

    const entry: CacheEntry<T> = JSON.parse(cached)
    const now = Date.now()

    // Check if cache is expired
    if (now - entry.timestamp > entry.ttl) {
      // Remove expired cache
      localStorage.removeItem(`cache:${key}`)
      return null
    }

    return entry.data
  } catch (error) {
    console.error('Error reading from cache:', error)
    return null
  }
}

/**
 * Set cached data with TTL
 */
export function setCached<T>(key: string, data: T, ttlSeconds: number = 300): void {
  if (typeof window === 'undefined') {
    return // Server-side rendering - no localStorage
  }

  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000 // Convert to milliseconds
    }
    localStorage.setItem(`cache:${key}`, JSON.stringify(entry))
  } catch (error) {
    console.error('Error writing to cache:', error)
    // If storage is full, try to clear old entries
    if (error instanceof DOMException && error.code === 22) {
      clearExpiredCache()
      try {
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          ttl: ttlSeconds * 1000
        }
        localStorage.setItem(`cache:${key}`, JSON.stringify(entry))
      } catch (retryError) {
        console.error('Error writing to cache after cleanup:', retryError)
      }
    }
  }
}

/**
 * Remove cached data
 */
export function removeCached(key: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.removeItem(`cache:${key}`)
  } catch (error) {
    console.error('Error removing from cache:', error)
  }
}

/**
 * Invalidate cache by pattern (removes all keys matching the pattern)
 */
export function invalidateCache(pattern: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('cache:')) {
        const cacheKey = key.replace('cache:', '')
        // Simple pattern matching - supports wildcard at the end
        if (pattern.endsWith('*')) {
          const prefix = pattern.slice(0, -1)
          if (cacheKey.startsWith(prefix)) {
            keys.push(key)
          }
        } else if (cacheKey === pattern) {
          keys.push(key)
        }
      }
    }
    keys.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.error('Error invalidating cache:', error)
  }
}

/**
 * Clear all expired cache entries
 */
export function clearExpiredCache(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('cache:')) {
        try {
          const cached = localStorage.getItem(key)
          if (cached) {
            const entry: CacheEntry<any> = JSON.parse(cached)
            const now = Date.now()
            if (now - entry.timestamp > entry.ttl) {
              keysToRemove.push(key)
            }
          }
        } catch (error) {
          // Invalid cache entry, remove it
          keysToRemove.push(key)
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.error('Error clearing expired cache:', error)
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('cache:')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.error('Error clearing all cache:', error)
  }
}

/**
 * Fetch with caching - wraps fetch to automatically cache responses
 */
export async function fetchCached<T>(
  url: string,
  options: RequestInit = {},
  cacheKey: string,
  ttlSeconds: number = 300
): Promise<T> {
  // Try to get from cache first
  const cached = getCached<T>(cacheKey)
  if (cached !== null) {
    return cached
  }

  // Fetch from API
  const response = await fetch(url, options)
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = await response.json() as T

  // Cache the response
  setCached(cacheKey, data, ttlSeconds)

  return data
}

// Clean up expired cache on load
if (typeof window !== 'undefined') {
  clearExpiredCache()
}

