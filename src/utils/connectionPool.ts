/**
 * HTTP Connection Pool Manager
 * Manages persistent HTTP connections to reduce network latency
 */

import { Pool, request } from 'undici'
import { logger } from './logger'
import {
  getCircuitBreakerManager,
  executeWithCircuitBreaker,
  CircuitBreakerConfig
} from './circuitBreakerManager'

export interface ConnectionPoolConfig {
  maxConnections: number
  maxConcurrentRequests: number
  keepAliveTimeout: number
  keepAliveMaxTimeout: number
  connectTimeout: number
  bodyTimeout: number
  headersTimeout: number
  enableCircuitBreaker: boolean
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
}

export interface PoolStats {
  activeConnections: number
  pendingRequests: number
  totalRequests: number
  totalErrors: number
  averageResponseTime: number
  // PERFORMANCE OPTIMIZATION: Queue metrics for concurrency control
  queuedRequests: number
  averageQueueTime: number
  connectionUtilization: number
}

export class ConnectionPoolManager {
  private pools = new Map<string, Pool>()
  private config: ConnectionPoolConfig
  private stats = new Map<string, PoolStats>()

  // PERFORMANCE OPTIMIZATION: Per-origin concurrency control
  // Enforces maxConcurrentRequests to prevent burst overload and stabilize latency
  private inFlightCount = new Map<string, number>()
  private waitQueues = new Map<string, Array<{ resolve: () => void, timestamp: number }>>()
  private queueStats = new Map<string, { totalWaits: number, totalWaitTime: number }>()

  // PERFORMANCE OPTIMIZATION: Periodic statistics updates
  private statsUpdateInterval: NodeJS.Timeout | null = null
  private readonly STATS_UPDATE_INTERVAL_MS = 5000 // Update every 5 seconds

  // PERFORMANCE OPTIMIZATION: Cached moving averages to reduce per-request calculations
  private cachedAverages = new Map<string, {
    averageResponseTime: number
    averageQueueTime: number
    connectionUtilization: number
    lastUpdated: number
  }>()

  constructor(config?: Partial<ConnectionPoolConfig>) {
    this.config = {
      maxConnections: 10,
      maxConcurrentRequests: 100,
      keepAliveTimeout: 60000, // 60 seconds
      keepAliveMaxTimeout: 300000, // 5 minutes
      connectTimeout: 10000, // 10 seconds
      bodyTimeout: 30000, // 30 seconds
      headersTimeout: 10000, // 10 seconds
      enableCircuitBreaker: true,
      circuitBreakerConfig: {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        timeout: 15000
      },
      ...config
    }

    logger.info('CONNECTION_POOL', `Initialized with ${this.config.maxConnections} max connections per origin`)

    // PERFORMANCE OPTIMIZATION: Start periodic statistics updates
    this.startPeriodicStatsUpdate()
  }

  /**
   * Get or create a connection pool for a specific origin
   */
  private getPool(origin: string): Pool {
    if (!this.pools.has(origin)) {
      const pool = new Pool(origin, {
        connections: this.config.maxConnections,
        keepAliveTimeout: this.config.keepAliveTimeout,
        keepAliveMaxTimeout: this.config.keepAliveMaxTimeout,
        connect: {
          timeout: this.config.connectTimeout
        }
      })

      this.pools.set(origin, pool)
      this.stats.set(origin, {
        activeConnections: 0,
        pendingRequests: 0,
        totalRequests: 0,
        totalErrors: 0,
        averageResponseTime: 0,
        queuedRequests: 0,
        averageQueueTime: 0,
        connectionUtilization: 0
      })

      logger.debug('CONNECTION_POOL', `Created new pool for ${origin}`)
    }

    return this.pools.get(origin)!
  }

  /**
   * PERFORMANCE OPTIMIZATION: Acquire semaphore for origin
   * Enforces maxConcurrentRequests to prevent overload and stabilize latency
   */
  private async acquire(origin: string): Promise<void> {
    const currentInFlight = this.inFlightCount.get(origin) || 0

    if (currentInFlight < this.config.maxConcurrentRequests) {
      // Fast path: can proceed immediately
      this.inFlightCount.set(origin, currentInFlight + 1)

      // Update stats - track as active connection
      const stats = this.stats.get(origin)
      if (stats) {
        stats.activeConnections++
      }

      this.updateDerivedStats(origin)
      return
    }

    // Slow path: must wait in queue
    const startWaitTime = Date.now()

    return new Promise<void>((resolve) => {
      const queue = this.waitQueues.get(origin) || []
      queue.push({ resolve, timestamp: startWaitTime })
      this.waitQueues.set(origin, queue)

      logger.debug('CONNECTION_POOL', `Request queued for ${origin}, queue length: ${queue.length}`)
    })
  }

  /**
   * PERFORMANCE OPTIMIZATION: Start periodic statistics updates
   * Updates derived statistics every few seconds instead of on every request
   */
  private startPeriodicStatsUpdate(): void {
    this.statsUpdateInterval = setInterval(() => {
      this.updateAllDerivedStats()
    }, this.STATS_UPDATE_INTERVAL_MS)

    logger.debug('CONNECTION_POOL', `Started periodic stats updates every ${this.STATS_UPDATE_INTERVAL_MS}ms`)
  }

  /**
   * PERFORMANCE OPTIMIZATION: Update all derived stats periodically
   * Batch updates all statistics to reduce per-request overhead
   */
  private updateAllDerivedStats(): void {
    for (const [origin] of this.stats) {
      this.updateDerivedStatsForOrigin(origin)
    }
  }

  /**
   * PERFORMANCE OPTIMIZATION: Update derived stats for origin (optimized version)
   * Calculates queue metrics and connection utilization with caching
   */
  private updateDerivedStatsForOrigin(origin: string): void {
    const stats = this.stats.get(origin)
    if (!stats) return

    const queue = this.waitQueues.get(origin) || []
    const queueStat = this.queueStats.get(origin) || { totalWaits: 0, totalWaitTime: 0 }

    // Update real-time stats
    stats.queuedRequests = queue.length
    stats.averageQueueTime = queueStat.totalWaits > 0 ? queueStat.totalWaitTime / queueStat.totalWaits : 0
    stats.connectionUtilization = stats.activeConnections / this.config.maxConnections

    // Cache the calculated values
    this.cachedAverages.set(origin, {
      averageResponseTime: stats.averageResponseTime,
      averageQueueTime: stats.averageQueueTime,
      connectionUtilization: stats.connectionUtilization,
      lastUpdated: Date.now()
    })
  }

  /**
   * PERFORMANCE OPTIMIZATION: Update derived stats for origin (lightweight version)
   * Only updates critical stats during request processing
   */
  private updateDerivedStats(origin: string): void {
    const stats = this.stats.get(origin)
    if (!stats) return

    // Only update queue length during request processing (lightweight)
    const queue = this.waitQueues.get(origin) || []
    stats.queuedRequests = queue.length

    // Other stats are updated periodically to reduce overhead
  }

  /**
   * PERFORMANCE OPTIMIZATION: Release semaphore for origin
   * Decrements in-flight count and processes next queued request
   */
  private release(origin: string): void {
    const currentInFlight = this.inFlightCount.get(origin) || 0

    if (currentInFlight > 0) {
      this.inFlightCount.set(origin, currentInFlight - 1)

      // Update stats - track as released connection
      const stats = this.stats.get(origin)
      if (stats) {
        stats.activeConnections = Math.max(0, stats.activeConnections - 1)
      }
    }

    // Process next queued request if any
    const queue = this.waitQueues.get(origin) || []
    if (queue.length > 0) {
      const next = queue.shift()!
      this.waitQueues.set(origin, queue)

      // Update in-flight count for the released request
      this.inFlightCount.set(origin, (this.inFlightCount.get(origin) || 0) + 1)

      // Update stats for the newly active connection
      const stats = this.stats.get(origin)
      if (stats) {
        stats.activeConnections++
      }

      // Track queue wait time
      const waitTime = Date.now() - next.timestamp
      const queueStat = this.queueStats.get(origin) || { totalWaits: 0, totalWaitTime: 0 }
      queueStat.totalWaits++
      queueStat.totalWaitTime += waitTime
      this.queueStats.set(origin, queueStat)

      logger.debug('CONNECTION_POOL', `Released queued request for ${origin}, waited ${waitTime}ms`)

      // Resolve the waiting request
      next.resolve()
    }

    // Update derived stats after any changes
    this.updateDerivedStats(origin)
  }

  /**
   * Make an HTTP request using connection pooling
   * @param signal - AbortSignal for cancelling the request (performance optimization for parallel discovery)
   */
  async request(url: string, options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
    headers?: Record<string, string>
    body?: string | Buffer
    timeout?: number
    bypassCircuitBreaker?: boolean
    signal?: AbortSignal  // Added for parallel endpoint discovery optimization
  } = {}): Promise<{
    statusCode: number
    headers: Record<string, string | string[]>
    body: string
    responseTime: number
  }> {
    const urlObj = new URL(url)
    const origin = `${urlObj.protocol}//${urlObj.host}`

    // Use circuit breaker if enabled
    if (this.config.enableCircuitBreaker && !options.bypassCircuitBreaker) {
      return this.requestWithCircuitBreaker(url, options, origin)
    } else {
      return this.requestDirect(url, options, origin)
    }
  }

  /**
   * Make request with circuit breaker protection
   */
  private async requestWithCircuitBreaker(
    url: string,
    options: any,
    origin: string
  ): Promise<{
    statusCode: number
    headers: Record<string, string | string[]>
    body: string
    responseTime: number
  }> {
    const circuitBreakerName = `connection-pool-${origin}`

    return executeWithCircuitBreaker(
      circuitBreakerName,
      () => this.requestDirect(url, options, origin),
      this.config.circuitBreakerConfig,
      {
        url,
        method: options.method || 'GET',
        origin
      }
    )
  }

  /**
   * Make direct HTTP request without circuit breaker
   * Enhanced with AbortSignal support for parallel endpoint discovery optimization
   */
  private async requestDirect(
    url: string,
    options: any,
    origin: string
  ): Promise<{
    statusCode: number
    headers: Record<string, string | string[]>
    body: string
    responseTime: number
  }> {
    const startTime = Date.now()
    const pool = this.getPool(origin)
    const stats = this.stats.get(origin)!

    // PERFORMANCE OPTIMIZATION: Enforce maxConcurrentRequests with semaphore
    await this.acquire(origin)

    stats.pendingRequests++
    stats.totalRequests++

    try {
      // Pass AbortSignal to undici for cancellable requests (parallel discovery optimization)
      const requestOptions: any = {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        dispatcher: pool,
        headersTimeout: options.timeout || this.config.headersTimeout,
        bodyTimeout: options.timeout || this.config.bodyTimeout
      }

      // Add signal if provided for request cancellation
      if (options.signal) {
        requestOptions.signal = options.signal
      }

      const response = await request(url, requestOptions)

      const body = await response.body.text()
      const responseTime = Date.now() - startTime

      // Update stats
      stats.pendingRequests--

      // PERFORMANCE OPTIMIZATION: Use optimized moving average calculation
      stats.averageResponseTime = this.calculateMovingAverageOptimized(
        origin,
        responseTime,
        stats.totalRequests
      )

      logger.debug('CONNECTION_POOL', `Request completed: ${url} (${responseTime}ms)`)

      return {
        statusCode: response.statusCode,
        headers: response.headers as Record<string, string | string[]>,
        body,
        responseTime
      }
    } catch (error) {
      stats.pendingRequests--
      stats.totalErrors++

      logger.error('CONNECTION_POOL', `Request failed: ${url} - ${error}`)
      throw error
    } finally {
      // PERFORMANCE OPTIMIZATION: Always release semaphore to prevent deadlock
      this.release(origin)
    }
  }

  /**
   * Make a streaming request using connection pooling
   */
  async streamRequest(url: string, options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
    headers?: Record<string, string>
    body?: string | Buffer
    timeout?: number
    signal?: AbortSignal  // Added for consistency with request method
  } = {}): Promise<{
    statusCode: number
    headers: Record<string, string | string[]>
    body: any
    responseTime: number
  }> {
    const startTime = Date.now()
    const urlObj = new URL(url)
    const origin = `${urlObj.protocol}//${urlObj.host}`
    const pool = this.getPool(origin)
    const stats = this.stats.get(origin)!

    // PERFORMANCE OPTIMIZATION: Enforce maxConcurrentRequests with semaphore
    await this.acquire(origin)

    stats.pendingRequests++
    stats.totalRequests++

    try {
      // Support AbortSignal for streaming requests too
      const requestOptions: any = {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        dispatcher: pool,
        headersTimeout: options.timeout || this.config.headersTimeout,
        bodyTimeout: options.timeout || this.config.bodyTimeout
      }

      if (options.signal) {
        requestOptions.signal = options.signal
      }

      const response = await request(url, requestOptions)

      const responseTime = Date.now() - startTime

      // Update stats
      stats.pendingRequests--

      // PERFORMANCE OPTIMIZATION: Use optimized moving average calculation
      stats.averageResponseTime = this.calculateMovingAverageOptimized(
        origin,
        responseTime,
        stats.totalRequests
      )

      logger.debug('CONNECTION_POOL', `Streaming request started: ${url} (${responseTime}ms)`)

      return {
        statusCode: response.statusCode,
        headers: response.headers as Record<string, string | string[]>,
        body: response.body,
        responseTime
      }
    } catch (error) {
      stats.pendingRequests--
      stats.totalErrors++

      logger.error('CONNECTION_POOL', `Streaming request failed: ${url} - ${error}`)
      throw error
    } finally {
      // PERFORMANCE OPTIMIZATION: Always release semaphore to prevent deadlock
      this.release(origin)
    }
  }

  /**
   * Get connection pool statistics
   */
  getStats(origin?: string): PoolStats | Map<string, PoolStats> {
    if (origin) {
      return this.stats.get(origin) || {
        activeConnections: 0,
        pendingRequests: 0,
        totalRequests: 0,
        totalErrors: 0,
        averageResponseTime: 0,
        queuedRequests: 0,
        averageQueueTime: 0,
        connectionUtilization: 0
      }
    }
    return new Map(this.stats)
  }

  /**
   * Get overall pool statistics
   */
  getOverallStats(): PoolStats {
    const allStats = Array.from(this.stats.values())
    
    return {
      activeConnections: allStats.reduce((sum, s) => sum + s.activeConnections, 0),
      pendingRequests: allStats.reduce((sum, s) => sum + s.pendingRequests, 0),
      totalRequests: allStats.reduce((sum, s) => sum + s.totalRequests, 0),
      totalErrors: allStats.reduce((sum, s) => sum + s.totalErrors, 0),
      averageResponseTime: allStats.length > 0
        ? allStats.reduce((sum, s) => sum + s.averageResponseTime, 0) / allStats.length
        : 0,
      queuedRequests: allStats.reduce((sum, s) => sum + s.queuedRequests, 0),
      averageQueueTime: allStats.length > 0
        ? allStats.reduce((sum, s) => sum + s.averageQueueTime, 0) / allStats.length
        : 0,
      connectionUtilization: allStats.length > 0
        ? allStats.reduce((sum, s) => sum + s.connectionUtilization, 0) / allStats.length
        : 0
    }
  }

  /**
   * PERFORMANCE OPTIMIZATION: Warmup connections to an origin
   * Pre-establishes connections to reduce cold-hit latency
   */
  async warmupConnections(origin: string, count: number = 3): Promise<void> {
    try {
      logger.debug('CONNECTION_POOL', `Warming up ${count} connections to ${origin}`)

      // Create lightweight HEAD requests to establish connections
      const warmupPromises = Array(count).fill(null).map(async () => {
        try {
          const pool = this.getPool(origin)
          // Use HEAD request with short timeout for warmup
          await request(`${origin}/`, {
            method: 'HEAD',
            dispatcher: pool,
            headersTimeout: 2000,
            bodyTimeout: 2000
          })
        } catch (error) {
          // Ignore warmup failures - they're best-effort
          logger.debug('CONNECTION_POOL', `Warmup request failed for ${origin}: ${error}`)
        }
      })

      // Wait for all warmup attempts (with timeout)
      await Promise.allSettled(warmupPromises)

      logger.debug('CONNECTION_POOL', `Connection warmup completed for ${origin}`)
    } catch (error) {
      // Warmup is best-effort, don't fail the main operation
      logger.debug('CONNECTION_POOL', `Connection warmup error for ${origin}: ${error}`)
    }
  }

  /**
   * Close all connection pools
   */
  async close(): Promise<void> {
    logger.info('CONNECTION_POOL', 'Closing all connection pools...')

    // PERFORMANCE OPTIMIZATION: Stop periodic stats updates
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval)
      this.statsUpdateInterval = null
    }

    const closePromises = Array.from(this.pools.values()).map(pool => pool.close())
    await Promise.all(closePromises)

    this.pools.clear()
    this.stats.clear()
    this.inFlightCount.clear()
    this.waitQueues.clear()
    this.queueStats.clear()
    this.cachedAverages.clear()

    logger.info('CONNECTION_POOL', 'All connection pools closed')
  }

  /**
   * Clear statistics for a specific origin or all origins
   */
  clearStats(origin?: string): void {
    if (origin) {
      const stats = this.stats.get(origin)
      if (stats) {
        stats.totalRequests = 0
        stats.totalErrors = 0
        stats.averageResponseTime = 0
      }
    } else {
      for (const stats of this.stats.values()) {
        stats.totalRequests = 0
        stats.totalErrors = 0
        stats.averageResponseTime = 0
      }
    }
    
    logger.info('CONNECTION_POOL', `Statistics cleared for ${origin || 'all origins'}`)
  }

  /**
   * PERFORMANCE OPTIMIZATION: Optimized moving average calculation with caching
   * Reduces calculation overhead by using cached values when possible
   */
  private calculateMovingAverageOptimized(origin: string, newValue: number, count: number): number {
    if (count <= 1) return newValue

    // Use cached value if available and recent
    const cached = this.cachedAverages.get(origin)
    const now = Date.now()

    if (cached && (now - cached.lastUpdated) < this.STATS_UPDATE_INTERVAL_MS) {
      // Use cached average for calculation
      return (cached.averageResponseTime * (count - 1) + newValue) / count
    }

    // Fallback to traditional calculation
    return this.calculateMovingAverage(
      this.stats.get(origin)?.averageResponseTime || 0,
      newValue,
      count
    )
  }

  private calculateMovingAverage(current: number, newValue: number, count: number): number {
    if (count <= 1) return newValue
    return (current * (count - 1) + newValue) / count
  }
}

// Singleton instance
export const connectionPool = new ConnectionPoolManager()
