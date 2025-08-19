/**
 * Endpoint Discovery Cache Manager
 * Caches successful Copilot API endpoints to eliminate sequential discovery overhead
 */

import { logger } from './logger'

export interface CachedEndpoint {
  url: string
  path: string
  format: number
  lastUsed: number
  successCount: number
  failureCount: number
  averageResponseTime: number
}

export interface EndpointConfig {
  path: string
  format: number
}

export class EndpointCacheManager {
  private cache = new Map<string, CachedEndpoint>()
  private readonly CACHE_TTL = 900000 // 15 minutes (increased from 5 minutes for better performance)
  private readonly MAX_FAILURE_COUNT = 3
  private readonly HEALTH_CHECK_INTERVAL = 60000 // 1 minute

  // Default endpoint configurations (from existing code)
  private readonly DEFAULT_CONFIGS: EndpointConfig[] = [
    { path: "/v1/chat/completions", format: 0 },
    { path: "/chat/completions", format: 0 },
    { path: "/v1/chat/completions", format: 1 },
    { path: "/v1/engines/copilot-codex/completions", format: 2 },
    { path: "/engines/copilot-codex/completions", format: 2 },
    { path: "/completions", format: 2 },
  ]

  constructor() {
    // Start periodic health checks
    setInterval(() => this.performHealthChecks(), this.HEALTH_CHECK_INTERVAL)
  }

  /**
   * Get the best endpoint for a given base URL and model
   */
  getBestEndpoint(baseUrl: string, model: string): CachedEndpoint | null {
    const cacheKey = this.getCacheKey(baseUrl, model)
    const cached = this.cache.get(cacheKey)

    if (!cached) {
      return null
    }

    // Check if cache is still valid
    if (Date.now() - cached.lastUsed > this.CACHE_TTL) {
      logger.debug('ENDPOINT_CACHE', `Cache expired for ${cacheKey}`)
      this.cache.delete(cacheKey)
      return null
    }

    // Check if endpoint is healthy
    if (cached.failureCount >= this.MAX_FAILURE_COUNT) {
      logger.warn('ENDPOINT_CACHE', `Endpoint unhealthy for ${cacheKey}`)
      return null
    }

    logger.debug('ENDPOINT_CACHE', `Cache hit for ${cacheKey}`)
    return cached
  }

  /**
   * Cache a successful endpoint
   */
  cacheSuccessfulEndpoint(
    baseUrl: string, 
    model: string, 
    config: EndpointConfig, 
    responseTime: number
  ): void {
    const cacheKey = this.getCacheKey(baseUrl, model)
    const url = `${baseUrl}${config.path}`
    
    const existing = this.cache.get(cacheKey)
    
    if (existing) {
      // Update existing cache entry
      existing.lastUsed = Date.now()
      existing.successCount++
      existing.failureCount = 0 // Reset failure count on success
      existing.averageResponseTime = this.calculateMovingAverage(
        existing.averageResponseTime,
        responseTime,
        existing.successCount
      )
    } else {
      // Create new cache entry
      this.cache.set(cacheKey, {
        url,
        path: config.path,
        format: config.format,
        lastUsed: Date.now(),
        successCount: 1,
        failureCount: 0,
        averageResponseTime: responseTime
      })
    }

    logger.info('ENDPOINT_CACHE', `Cached successful endpoint: ${url} (${responseTime}ms)`)
  }

  /**
   * Record endpoint failure
   */
  recordEndpointFailure(baseUrl: string, model: string, config: EndpointConfig): void {
    const cacheKey = this.getCacheKey(baseUrl, model)
    const cached = this.cache.get(cacheKey)

    if (cached) {
      cached.failureCount++
      logger.warn('ENDPOINT_CACHE', `Endpoint failure recorded: ${cached.url} (failures: ${cached.failureCount})`)
      
      // Remove from cache if too many failures
      if (cached.failureCount >= this.MAX_FAILURE_COUNT) {
        this.cache.delete(cacheKey)
        logger.error('ENDPOINT_CACHE', `Endpoint removed from cache due to failures: ${cached.url}`)
      }
    }
  }

  /**
   * Get all endpoint configurations for discovery
   */
  getEndpointConfigs(): EndpointConfig[] {
    return [...this.DEFAULT_CONFIGS]
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number
    healthyEndpoints: number
    unhealthyEndpoints: number
    averageResponseTime: number
  } {
    const entries = Array.from(this.cache.values())
    const healthy = entries.filter(e => e.failureCount < this.MAX_FAILURE_COUNT)
    const unhealthy = entries.filter(e => e.failureCount >= this.MAX_FAILURE_COUNT)
    
    const avgResponseTime = entries.length > 0 
      ? entries.reduce((sum, e) => sum + e.averageResponseTime, 0) / entries.length
      : 0

    return {
      totalEntries: entries.length,
      healthyEndpoints: healthy.length,
      unhealthyEndpoints: unhealthy.length,
      averageResponseTime: Math.round(avgResponseTime)
    }
  }

  /**
   * Clear cache (for testing or manual reset)
   */
  clearCache(): void {
    this.cache.clear()
    logger.info('ENDPOINT_CACHE', 'Cache cleared')
  }

  private getCacheKey(baseUrl: string, model: string): string {
    return `${baseUrl}:${model}`
  }

  private calculateMovingAverage(current: number, newValue: number, count: number): number {
    return (current * (count - 1) + newValue) / count
  }

  private async performHealthChecks(): Promise<void> {
    // Implement periodic health checks for cached endpoints
    // This is a placeholder for future implementation
    logger.debug('ENDPOINT_CACHE', 'Performing health checks...')
  }
}

// Singleton instance
export const endpointCache = new EndpointCacheManager()
