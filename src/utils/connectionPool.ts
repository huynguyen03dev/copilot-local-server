/**
 * HTTP Connection Pool Manager
 * Manages persistent HTTP connections to reduce network latency
 */

import { Agent, Pool, request } from 'undici'
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
}

export class ConnectionPoolManager {
  private pools = new Map<string, Pool>()
  private globalAgent: Agent
  private config: ConnectionPoolConfig
  private stats = new Map<string, PoolStats>()

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

    // Create global agent for connection pooling
    this.globalAgent = new Agent({
      connections: this.config.maxConnections,
      keepAliveTimeout: this.config.keepAliveTimeout,
      keepAliveMaxTimeout: this.config.keepAliveMaxTimeout,
      connect: {
        timeout: this.config.connectTimeout
      }
    })

    logger.info('CONNECTION_POOL', `Initialized with ${this.config.maxConnections} max connections`)
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
        averageResponseTime: 0
      })

      logger.debug('CONNECTION_POOL', `Created new pool for ${origin}`)
    }

    return this.pools.get(origin)!
  }

  /**
   * Make an HTTP request using connection pooling
   */
  async request(url: string, options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
    headers?: Record<string, string>
    body?: string | Buffer
    timeout?: number
    bypassCircuitBreaker?: boolean
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

    stats.pendingRequests++
    stats.totalRequests++

    try {
      const response = await request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        dispatcher: pool,
        headersTimeout: options.timeout || this.config.headersTimeout,
        bodyTimeout: options.timeout || this.config.bodyTimeout
      })

      const body = await response.body.text()
      const responseTime = Date.now() - startTime

      // Update stats
      stats.pendingRequests--
      stats.averageResponseTime = this.calculateMovingAverage(
        stats.averageResponseTime,
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

    stats.pendingRequests++
    stats.totalRequests++

    try {
      const response = await request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        dispatcher: pool,
        headersTimeout: options.timeout || this.config.headersTimeout,
        bodyTimeout: options.timeout || this.config.bodyTimeout
      })

      const responseTime = Date.now() - startTime

      // Update stats
      stats.pendingRequests--
      stats.averageResponseTime = this.calculateMovingAverage(
        stats.averageResponseTime,
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
        averageResponseTime: 0
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
        : 0
    }
  }

  /**
   * Close all connection pools
   */
  async close(): Promise<void> {
    logger.info('CONNECTION_POOL', 'Closing all connection pools...')
    
    const closePromises = Array.from(this.pools.values()).map(pool => pool.close())
    await Promise.all(closePromises)
    
    await this.globalAgent.close()
    
    this.pools.clear()
    this.stats.clear()
    
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

  private calculateMovingAverage(current: number, newValue: number, count: number): number {
    if (count <= 1) return newValue
    return (current * (count - 1) + newValue) / count
  }
}

// Singleton instance
export const connectionPool = new ConnectionPoolManager()
