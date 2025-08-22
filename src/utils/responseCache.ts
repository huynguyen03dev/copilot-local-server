/**
 * Response Cache and Request Deduplication Manager
 * Provides short-TTL response caching and in-flight request deduplication
 * to reduce redundant upstream calls and improve performance
 */

import { logger } from './logger'
import { createHash } from 'crypto'

export interface CachedResponse {
  data: any
  timestamp: number
  ttl: number
  hits: number
}

export interface PendingRequest {
  promise: Promise<any>
  timestamp: number
  resolvers: Array<(value: any) => void>
  rejectors: Array<(error: any) => void>
}

export interface CacheStats {
  size: number
  maxSize: number
  hitRate: number
  totalRequests: number
  cacheHits: number
  dedupHits: number
  evictions: number
}

export class ResponseCacheManager {
  private cache = new Map<string, CachedResponse>()
  private pendingRequests = new Map<string, PendingRequest>()
  private readonly MAX_CACHE_SIZE = 1000
  private readonly DEFAULT_TTL = 60000 // 60 seconds
  private readonly MAX_PENDING_TIME = 30000 // 30 seconds
  
  // Statistics
  private totalRequests = 0
  private cacheHits = 0
  private dedupHits = 0
  private evictions = 0

  /**
   * Generate cache key from request parameters
   */
  private generateCacheKey(
    model: string,
    messages: any[],
    temperature?: number,
    maxTokens?: number,
    stream?: boolean
  ): string {
    // Create a stable hash from key request parameters
    const keyData = {
      model,
      // Use first message content (truncated) for cache key
      firstMessage: messages?.[0]?.content?.slice(0, 200) || '',
      messageCount: messages?.length || 0,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || null,
      stream: stream || false
    }
    
    const keyString = JSON.stringify(keyData)
    return createHash('sha256').update(keyString).digest('hex').slice(0, 16)
  }

  /**
   * Check if response is cacheable
   */
  private isCacheable(statusCode: number, data: any): boolean {
    // Only cache successful responses
    if (statusCode !== 200) return false
    
    // Don't cache streaming responses (they're consumed)
    if (data && typeof data === 'object' && data.stream) return false
    
    // Don't cache very large responses
    const dataSize = JSON.stringify(data).length
    if (dataSize > 100000) return false // 100KB limit
    
    return true
  }

  /**
   * Get cached response if available and valid
   */
  getCachedResponse(
    model: string,
    messages: any[],
    temperature?: number,
    maxTokens?: number,
    stream?: boolean
  ): any | null {
    this.totalRequests++
    
    const key = this.generateCacheKey(model, messages, temperature, maxTokens, stream)
    const cached = this.cache.get(key)
    
    if (!cached) {
      return null
    }
    
    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key)
      logger.debug('RESPONSE_CACHE', `Cache entry expired for key ${key}`)
      return null
    }
    
    // Cache hit!
    cached.hits++
    this.cacheHits++
    
    logger.debug('RESPONSE_CACHE', `Cache hit for key ${key} (${cached.hits} total hits)`)
    return cached.data
  }

  /**
   * Cache a response
   */
  cacheResponse(
    model: string,
    messages: any[],
    temperature: number | undefined,
    maxTokens: number | undefined,
    stream: boolean | undefined,
    statusCode: number,
    data: any,
    ttl: number = this.DEFAULT_TTL
  ): void {
    if (!this.isCacheable(statusCode, data)) {
      return
    }
    
    const key = this.generateCacheKey(model, messages, temperature, maxTokens, stream)
    
    // Evict old entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldEntries()
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      hits: 0
    })
    
    logger.debug('RESPONSE_CACHE', `Cached response for key ${key}`)
  }

  /**
   * Deduplicate in-flight requests
   */
  async deduplicateRequest<T>(
    model: string,
    messages: any[],
    temperature: number | undefined,
    maxTokens: number | undefined,
    stream: boolean | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    const key = this.generateCacheKey(model, messages, temperature, maxTokens, stream)
    
    // Check if request is already in flight
    const pending = this.pendingRequests.get(key)
    if (pending) {
      this.dedupHits++
      logger.debug('RESPONSE_CACHE', `Deduplicating request for key ${key}`)
      
      // Return a promise that resolves when the original request completes
      return new Promise<T>((resolve, reject) => {
        pending.resolvers.push(resolve)
        pending.rejectors.push(reject)
      })
    }
    
    // Create new pending request
    const resolvers: Array<(value: any) => void> = []
    const rejectors: Array<(error: any) => void> = []
    
    const promise = operation()
      .then((result) => {
        // Resolve all waiting requests
        resolvers.forEach(resolve => resolve(result))
        return result
      })
      .catch((error) => {
        // Reject all waiting requests
        rejectors.forEach(reject => reject(error))
        throw error
      })
      .finally(() => {
        // Clean up pending request
        this.pendingRequests.delete(key)
      })
    
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
      resolvers,
      rejectors
    })
    
    return promise
  }

  /**
   * Evict old cache entries using LRU strategy
   */
  private evictOldEntries(): void {
    const entries = Array.from(this.cache.entries())
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    
    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2)
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0])
      this.evictions++
    }
    
    logger.debug('RESPONSE_CACHE', `Evicted ${toRemove} old cache entries`)
  }

  /**
   * Clean up expired pending requests
   */
  cleanupPendingRequests(): void {
    const now = Date.now()
    const expired: string[] = []
    
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > this.MAX_PENDING_TIME) {
        expired.push(key)
      }
    }
    
    expired.forEach(key => {
      const pending = this.pendingRequests.get(key)
      if (pending) {
        // Reject all waiting requests
        const error = new Error('Request deduplication timeout')
        pending.rejectors.forEach(reject => reject(error))
        this.pendingRequests.delete(key)
      }
    })
    
    if (expired.length > 0) {
      logger.debug('RESPONSE_CACHE', `Cleaned up ${expired.length} expired pending requests`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0,
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      dedupHits: this.dedupHits,
      evictions: this.evictions
    }
  }

  /**
   * Clear cache and pending requests
   */
  clear(): void {
    this.cache.clear()
    this.pendingRequests.clear()
    this.totalRequests = 0
    this.cacheHits = 0
    this.dedupHits = 0
    this.evictions = 0
    
    logger.info('RESPONSE_CACHE', 'Cache and pending requests cleared')
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startPeriodicCleanup(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanupPendingRequests()
      
      // Clean up expired cache entries
      const now = Date.now()
      const expired: string[] = []
      
      for (const [key, cached] of this.cache.entries()) {
        if (now - cached.timestamp > cached.ttl) {
          expired.push(key)
        }
      }
      
      expired.forEach(key => this.cache.delete(key))
      
      if (expired.length > 0) {
        logger.debug('RESPONSE_CACHE', `Cleaned up ${expired.length} expired cache entries`)
      }
    }, intervalMs)
  }
}

// Singleton instance
export const responseCache = new ResponseCacheManager()
