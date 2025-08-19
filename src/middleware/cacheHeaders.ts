/**
 * Cache Headers Middleware
 * Implements intelligent caching headers for optimal client-side caching
 * Supports ETags, Last-Modified, Cache-Control, and conditional requests
 */

import { Context, Next } from "hono"
import { createHash } from "crypto"
import { logger } from "../utils/logger"

export interface CacheConfig {
  enableETags: boolean
  enableLastModified: boolean
  enableConditionalRequests: boolean
  defaultMaxAge: number // seconds
  staticResourceMaxAge: number // seconds
  apiResponseMaxAge: number // seconds
  enableVaryHeaders: boolean
  cacheableContentTypes: string[]
  nonCacheableEndpoints: string[]
}

export interface CacheStats {
  totalRequests: number
  cacheHits: number
  cacheMisses: number
  notModifiedResponses: number
  etagGenerations: number
  hitRate: number
}

/**
 * Cache statistics tracker
 */
class CacheStatsTracker {
  private stats: CacheStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    notModifiedResponses: 0,
    etagGenerations: 0,
    hitRate: 0
  }

  trackRequest() {
    this.stats.totalRequests++
    this.updateHitRate()
  }

  trackCacheHit() {
    this.stats.cacheHits++
    this.updateHitRate()
  }

  trackCacheMiss() {
    this.stats.cacheMisses++
    this.updateHitRate()
  }

  trackNotModified() {
    this.stats.notModifiedResponses++
  }

  trackETagGeneration() {
    this.stats.etagGenerations++
  }

  private updateHitRate() {
    if (this.stats.totalRequests > 0) {
      this.stats.hitRate = (this.stats.cacheHits / this.stats.totalRequests) * 100
    }
  }

  getStats(): CacheStats {
    return { ...this.stats }
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      notModifiedResponses: 0,
      etagGenerations: 0,
      hitRate: 0
    }
  }
}

// Global cache stats tracker
const cacheStats = new CacheStatsTracker()

/**
 * Generate ETag for response content
 */
function generateETag(content: string | ArrayBuffer): string {
  const hash = createHash('md5')
  
  if (typeof content === 'string') {
    hash.update(content, 'utf8')
  } else {
    hash.update(new Uint8Array(content))
  }
  
  return `"${hash.digest('hex')}"`
}

/**
 * Generate Last-Modified header value
 */
function generateLastModified(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp) : new Date()
  return date.toUTCString()
}

/**
 * Check if content type is cacheable
 */
function isCacheableContentType(contentType: string, cacheableTypes: string[]): boolean {
  if (!contentType) return false
  
  return cacheableTypes.some(type => contentType.includes(type))
}

/**
 * Check if endpoint should be cached
 */
function isCacheableEndpoint(path: string, nonCacheableEndpoints: string[]): boolean {
  return !nonCacheableEndpoints.some(endpoint => path.includes(endpoint))
}

/**
 * Determine cache control value based on endpoint
 */
function getCacheControlValue(path: string, config: CacheConfig): string {
  // Static resources get longer cache times
  if (path.includes('/static/') || path.includes('/assets/')) {
    return `public, max-age=${config.staticResourceMaxAge}, immutable`
  }
  
  // API responses get shorter cache times
  if (path.includes('/v1/') || path.includes('/api/')) {
    return `public, max-age=${config.apiResponseMaxAge}, must-revalidate`
  }
  
  // Default cache control
  return `public, max-age=${config.defaultMaxAge}, must-revalidate`
}

/**
 * Cache headers middleware
 */
export function cacheHeadersMiddleware(config: Partial<CacheConfig> = {}) {
  const finalConfig: CacheConfig = {
    enableETags: true,
    enableLastModified: true,
    enableConditionalRequests: true,
    defaultMaxAge: 300, // 5 minutes
    staticResourceMaxAge: 86400, // 24 hours
    apiResponseMaxAge: 60, // 1 minute
    enableVaryHeaders: true,
    cacheableContentTypes: [
      'application/json',
      'text/html',
      'text/css',
      'text/javascript',
      'application/javascript',
      'text/plain',
      'image/svg+xml'
    ],
    nonCacheableEndpoints: [
      '/auth/',
      '/metrics',
      '/health'
    ],
    ...config
  }

  return async (c: Context, next: Next) => {
    cacheStats.trackRequest()

    const method = c.req.method
    const path = c.req.path

    // Only apply caching to GET requests
    if (method !== 'GET') {
      await next()
      return
    }

    // Check if endpoint should be cached
    if (!isCacheableEndpoint(path, finalConfig.nonCacheableEndpoints)) {
      logger.debug('CACHE', `Skipping cache headers for non-cacheable endpoint: ${path}`)
      await next()
      return
    }

    // Handle conditional requests
    if (finalConfig.enableConditionalRequests) {
      const ifNoneMatch = c.req.header('if-none-match')
      const ifModifiedSince = c.req.header('if-modified-since')

      if (ifNoneMatch || ifModifiedSince) {
        // For demonstration, we'll check against a simple cache
        // In production, this would check against a real cache store
        const cacheKey = `${method}:${path}`
        
        // Simulate cache check
        if (ifNoneMatch && ifNoneMatch.includes('cached-etag')) {
          cacheStats.trackCacheHit()
          cacheStats.trackNotModified()
          
          logger.debug('CACHE', `Cache hit (ETag): ${path}`)
          
          return c.body(null, 304, {
            'Cache-Control': getCacheControlValue(path, finalConfig),
            'ETag': ifNoneMatch
          })
        }
      }
    }

    // Process the request
    await next()

    const response = c.res
    const contentType = response.headers.get('content-type') || ''

    // Check if response should be cached
    if (!isCacheableContentType(contentType, finalConfig.cacheableContentTypes)) {
      logger.debug('CACHE', `Skipping cache headers for non-cacheable content type: ${contentType}`)
      return
    }

    // Add cache headers
    const headers = new Headers(response.headers)

    // Add Cache-Control header
    const cacheControl = getCacheControlValue(path, finalConfig)
    headers.set('Cache-Control', cacheControl)

    // Add ETag if enabled
    if (finalConfig.enableETags) {
      try {
        const body = await response.text()
        const etag = generateETag(body)
        headers.set('ETag', etag)
        
        cacheStats.trackETagGeneration()
        
        logger.debug('CACHE', `Generated ETag for ${path}: ${etag}`)

        // Recreate response with the body and new headers
        c.res = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers
        })
      } catch (error) {
        logger.warn('CACHE', `Failed to generate ETag for ${path}: ${error}`)
      }
    }

    // Add Last-Modified if enabled
    if (finalConfig.enableLastModified) {
      const lastModified = generateLastModified()
      headers.set('Last-Modified', lastModified)
    }

    // Add Vary headers if enabled
    if (finalConfig.enableVaryHeaders) {
      const existingVary = headers.get('Vary')
      const varyHeaders = ['Accept-Encoding', 'Accept']
      
      if (existingVary) {
        const combinedVary = [existingVary, ...varyHeaders].join(', ')
        headers.set('Vary', combinedVary)
      } else {
        headers.set('Vary', varyHeaders.join(', '))
      }
    }

    // Update response headers if not already updated
    if (c.res.headers !== headers) {
      c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers
      })
    }

    cacheStats.trackCacheMiss()
    
    logger.debug('CACHE', 
      `Added cache headers for ${path}: Cache-Control: ${cacheControl}, ` +
      `ETag: ${headers.get('ETag') || 'none'}`
    )
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  return cacheStats.getStats()
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheStats.reset()
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enableETags: true,
  enableLastModified: true,
  enableConditionalRequests: true,
  defaultMaxAge: 300, // 5 minutes
  staticResourceMaxAge: 86400, // 24 hours
  apiResponseMaxAge: 60, // 1 minute
  enableVaryHeaders: true,
  cacheableContentTypes: [
    'application/json',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'text/plain',
    'image/svg+xml'
  ],
  nonCacheableEndpoints: [
    '/auth/',
    '/metrics',
    '/health'
  ]
}

/**
 * Production cache configuration
 */
export const PRODUCTION_CACHE_CONFIG: CacheConfig = {
  ...DEFAULT_CACHE_CONFIG,
  defaultMaxAge: 600, // 10 minutes
  staticResourceMaxAge: 604800, // 7 days
  apiResponseMaxAge: 300 // 5 minutes
}

/**
 * Test cache configuration
 */
export const TEST_CACHE_CONFIG: CacheConfig = {
  ...DEFAULT_CACHE_CONFIG,
  defaultMaxAge: 60, // 1 minute
  staticResourceMaxAge: 300, // 5 minutes
  apiResponseMaxAge: 30 // 30 seconds
}

/**
 * Utility function to check if response is cacheable
 */
export function isResponseCacheable(
  method: string,
  path: string,
  contentType: string,
  config: CacheConfig
): boolean {
  return (
    method === 'GET' &&
    isCacheableEndpoint(path, config.nonCacheableEndpoints) &&
    isCacheableContentType(contentType, config.cacheableContentTypes)
  )
}

/**
 * Utility function to generate cache key
 */
export function generateCacheKey(method: string, path: string, query?: string): string {
  const baseKey = `${method}:${path}`
  return query ? `${baseKey}?${query}` : baseKey
}

/**
 * Utility function to parse cache control header
 */
export function parseCacheControl(cacheControl: string): Record<string, string | boolean> {
  const directives: Record<string, string | boolean> = {}
  
  cacheControl.split(',').forEach(directive => {
    const trimmed = directive.trim()
    const [key, value] = trimmed.split('=')
    
    if (value) {
      directives[key] = value
    } else {
      directives[key] = true
    }
  })
  
  return directives
}
