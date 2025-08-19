/**
 * Authentication Token Cache Manager
 * Caches access tokens in memory to eliminate file I/O overhead
 */

import { logger } from './logger'

export interface CachedToken {
  token: string
  expiresAt: number
  refreshToken: string
  endpoint?: string
  lastRefresh: number
}

export class TokenCacheManager {
  private cache: CachedToken | null = null
  private readonly REFRESH_BUFFER = 300000 // 5 minutes before expiry
  private readonly MAX_CACHE_AGE = 3600000 // 1 hour max cache age
  private refreshPromise: Promise<CachedToken | null> | null = null

  /**
   * Get cached token if valid, otherwise return null
   */
  getCachedToken(): CachedToken | null {
    if (!this.cache) {
      return null
    }

    const now = Date.now()
    
    // Check if token is expired
    if (now >= this.cache.expiresAt) {
      logger.debug('TOKEN_CACHE', 'Token expired, clearing cache')
      this.cache = null
      return null
    }

    // Check if cache is too old (safety measure)
    if (now - this.cache.lastRefresh > this.MAX_CACHE_AGE) {
      logger.debug('TOKEN_CACHE', 'Cache too old, clearing')
      this.cache = null
      return null
    }

    logger.debug('TOKEN_CACHE', `Token cache hit, expires in ${Math.round((this.cache.expiresAt - now) / 1000)}s`)
    return this.cache
  }

  /**
   * Check if token needs refresh (within buffer time)
   */
  needsRefresh(): boolean {
    if (!this.cache) {
      return true
    }

    const now = Date.now()
    const timeUntilExpiry = this.cache.expiresAt - now
    
    return timeUntilExpiry <= this.REFRESH_BUFFER
  }

  /**
   * Cache a new token
   */
  cacheToken(token: string, expiresAt: number, refreshToken: string, endpoint?: string): void {
    this.cache = {
      token,
      expiresAt,
      refreshToken,
      endpoint,
      lastRefresh: Date.now()
    }

    const expiresInSeconds = Math.round((expiresAt - Date.now()) / 1000)
    logger.info('TOKEN_CACHE', `Token cached, expires in ${expiresInSeconds}s`)
  }

  /**
   * Get token with automatic refresh if needed
   */
  async getTokenWithRefresh(refreshCallback: () => Promise<CachedToken | null>): Promise<string | null> {
    // Check if we have a valid cached token
    const cached = this.getCachedToken()
    if (cached && !this.needsRefresh()) {
      return cached.token
    }

    // If refresh is already in progress, wait for it
    if (this.refreshPromise) {
      logger.debug('TOKEN_CACHE', 'Refresh already in progress, waiting...')
      const refreshed = await this.refreshPromise
      return refreshed?.token || null
    }

    // Start refresh process
    logger.debug('TOKEN_CACHE', 'Starting token refresh')
    this.refreshPromise = this.performRefresh(refreshCallback)
    
    try {
      const refreshed = await this.refreshPromise
      return refreshed?.token || null
    } finally {
      this.refreshPromise = null
    }
  }

  /**
   * Perform token refresh
   */
  private async performRefresh(refreshCallback: () => Promise<CachedToken | null>): Promise<CachedToken | null> {
    try {
      const newToken = await refreshCallback()
      
      if (newToken) {
        this.cacheToken(
          newToken.token,
          newToken.expiresAt,
          newToken.refreshToken,
          newToken.endpoint
        )
        logger.info('TOKEN_CACHE', 'Token refresh successful')
        return newToken
      } else {
        logger.warn('TOKEN_CACHE', 'Token refresh returned null')
        this.clearCache()
        return null
      }
    } catch (error) {
      logger.error('TOKEN_CACHE', `Token refresh failed: ${error}`)
      this.clearCache()
      return null
    }
  }

  /**
   * Clear the token cache
   */
  clearCache(): void {
    this.cache = null
    this.refreshPromise = null
    logger.info('TOKEN_CACHE', 'Token cache cleared')
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    hasCachedToken: boolean
    expiresIn: number | null
    needsRefresh: boolean
    cacheAge: number | null
  } {
    if (!this.cache) {
      return {
        hasCachedToken: false,
        expiresIn: null,
        needsRefresh: true,
        cacheAge: null
      }
    }

    const now = Date.now()
    return {
      hasCachedToken: true,
      expiresIn: Math.max(0, this.cache.expiresAt - now),
      needsRefresh: this.needsRefresh(),
      cacheAge: now - this.cache.lastRefresh
    }
  }

  /**
   * Force refresh token (for testing or manual refresh)
   */
  async forceRefresh(refreshCallback: () => Promise<CachedToken | null>): Promise<string | null> {
    this.clearCache()
    return this.getTokenWithRefresh(refreshCallback)
  }
}

// Singleton instance
export const tokenCache = new TokenCacheManager()
