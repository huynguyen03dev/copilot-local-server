/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers and provides centralized monitoring
 */

import { 
  CircuitBreaker, 
  CircuitBreakerConfig, 
  CircuitBreakerMetrics,
  CircuitBreakerEvent,
  createCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  PRODUCTION_CIRCUIT_BREAKER_CONFIG
} from "./circuitBreaker"
import { logger } from "./logger"
import { getAsyncLogger } from "./asyncLogger"

export interface CircuitBreakerManagerConfig {
  enableGlobalMetrics: boolean
  enableEventLogging: boolean
  enablePeriodicReporting: boolean
  reportingInterval: number // milliseconds
  enableAutoRecovery: boolean
  globalTimeout: number
}

export interface GlobalCircuitBreakerMetrics {
  totalCircuitBreakers: number
  openCircuitBreakers: number
  halfOpenCircuitBreakers: number
  closedCircuitBreakers: number
  totalRequests: number
  totalFailures: number
  globalFailureRate: number
  averageResponseTime: number
  circuitBreakers: Record<string, CircuitBreakerMetrics>
}

/**
 * Circuit Breaker Manager for centralized management
 */
export class CircuitBreakerManager {
  private circuitBreakers = new Map<string, CircuitBreaker>()
  private globalMetrics: GlobalCircuitBreakerMetrics = {
    totalCircuitBreakers: 0,
    openCircuitBreakers: 0,
    halfOpenCircuitBreakers: 0,
    closedCircuitBreakers: 0,
    totalRequests: 0,
    totalFailures: 0,
    globalFailureRate: 0,
    averageResponseTime: 0,
    circuitBreakers: {}
  }
  private reportingTimer: NodeJS.Timeout | null = null

  constructor(private config: CircuitBreakerManagerConfig) {
    if (config.enablePeriodicReporting) {
      this.startPeriodicReporting()
    }
  }

  /**
   * Get or create circuit breaker
   */
  getCircuitBreaker(
    name: string, 
    config: Partial<CircuitBreakerConfig> = {}
  ): CircuitBreaker {
    if (this.circuitBreakers.has(name)) {
      return this.circuitBreakers.get(name)!
    }

    // Create new circuit breaker
    const circuitBreaker = createCircuitBreaker(name, config)
    
    // Add event listener for monitoring
    if (this.config.enableEventLogging) {
      circuitBreaker.addEventListener(this.handleCircuitBreakerEvent.bind(this))
    }

    this.circuitBreakers.set(name, circuitBreaker)
    
    logger.info('CIRCUIT_BREAKER_MANAGER', `Created circuit breaker: ${name}`)
    
    return circuitBreaker
  }

  /**
   * Execute operation with circuit breaker
   */
  async execute<T>(
    circuitBreakerName: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(circuitBreakerName, config)
    return circuitBreaker.execute(operation, metadata)
  }

  /**
   * Handle circuit breaker events
   */
  private async handleCircuitBreakerEvent(event: CircuitBreakerEvent): Promise<void> {
    if (this.config.enableEventLogging) {
      const asyncLogger = getAsyncLogger()
      
      await asyncLogger.infoAsync(
        'CIRCUIT_BREAKER_EVENT',
        `Circuit breaker event: ${event.type}`,
        { correlationId: `cb-${Date.now()}` },
        {
          type: event.type,
          state: event.state,
          previousState: event.previousState,
          timestamp: event.timestamp,
          error: event.error?.message,
          duration: event.duration,
          metadata: event.metadata
        }
      )
    }

    // Update global metrics
    if (this.config.enableGlobalMetrics) {
      this.updateGlobalMetrics()
    }
  }

  /**
   * Update global metrics
   */
  private updateGlobalMetrics(): void {
    let totalRequests = 0
    let totalFailures = 0
    let totalResponseTime = 0
    let openCount = 0
    let halfOpenCount = 0
    let closedCount = 0

    const circuitBreakerMetrics: Record<string, CircuitBreakerMetrics> = {}

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      const metrics = circuitBreaker.getMetrics()
      circuitBreakerMetrics[name] = metrics

      totalRequests += metrics.totalRequests
      totalFailures += metrics.failureCount
      totalResponseTime += metrics.averageResponseTime

      switch (metrics.state) {
        case 'OPEN':
          openCount++
          break
        case 'HALF_OPEN':
          halfOpenCount++
          break
        case 'CLOSED':
          closedCount++
          break
      }
    }

    this.globalMetrics = {
      totalCircuitBreakers: this.circuitBreakers.size,
      openCircuitBreakers: openCount,
      halfOpenCircuitBreakers: halfOpenCount,
      closedCircuitBreakers: closedCount,
      totalRequests,
      totalFailures,
      globalFailureRate: totalRequests > 0 ? totalFailures / totalRequests : 0,
      averageResponseTime: this.circuitBreakers.size > 0 ? totalResponseTime / this.circuitBreakers.size : 0,
      circuitBreakers: circuitBreakerMetrics
    }
  }

  /**
   * Get global metrics
   */
  getGlobalMetrics(): GlobalCircuitBreakerMetrics {
    this.updateGlobalMetrics()
    return { ...this.globalMetrics }
  }

  /**
   * Get circuit breaker by name
   */
  getCircuitBreakerByName(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name)
  }

  /**
   * Get all circuit breaker names
   */
  getCircuitBreakerNames(): string[] {
    return Array.from(this.circuitBreakers.keys())
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(name: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(name)
    if (circuitBreaker) {
      circuitBreaker.reset()
      logger.info('CIRCUIT_BREAKER_MANAGER', `Reset circuit breaker: ${name}`)
      return true
    }
    return false
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    for (const [name, circuitBreaker] of this.circuitBreakers) {
      circuitBreaker.reset()
    }
    logger.info('CIRCUIT_BREAKER_MANAGER', 'Reset all circuit breakers')
  }

  /**
   * Remove circuit breaker
   */
  removeCircuitBreaker(name: string): boolean {
    const removed = this.circuitBreakers.delete(name)
    if (removed) {
      logger.info('CIRCUIT_BREAKER_MANAGER', `Removed circuit breaker: ${name}`)
    }
    return removed
  }

  /**
   * Start periodic reporting
   */
  private startPeriodicReporting(): void {
    this.reportingTimer = setInterval(async () => {
      try {
        await this.generatePeriodicReport()
      } catch (error) {
        logger.error('CIRCUIT_BREAKER_MANAGER', `Periodic reporting error: ${error}`)
      }
    }, this.config.reportingInterval)
  }

  /**
   * Generate periodic report
   */
  private async generatePeriodicReport(): Promise<void> {
    const metrics = this.getGlobalMetrics()
    
    if (metrics.totalCircuitBreakers === 0) {
      return // No circuit breakers to report
    }

    const asyncLogger = getAsyncLogger()
    
    await asyncLogger.infoAsync(
      'CIRCUIT_BREAKER_REPORT',
      'Circuit Breaker Status Report',
      undefined,
      {
        totalCircuitBreakers: metrics.totalCircuitBreakers,
        openCircuitBreakers: metrics.openCircuitBreakers,
        halfOpenCircuitBreakers: metrics.halfOpenCircuitBreakers,
        closedCircuitBreakers: metrics.closedCircuitBreakers,
        globalFailureRate: metrics.globalFailureRate.toFixed(3),
        averageResponseTime: metrics.averageResponseTime.toFixed(1)
      }
    )

    // Log details for open circuit breakers
    for (const [name, cbMetrics] of Object.entries(metrics.circuitBreakers)) {
      if (cbMetrics.state === 'OPEN') {
        await asyncLogger.warnAsync(
          'CIRCUIT_BREAKER_REPORT',
          `Circuit breaker OPEN: ${name}`,
          undefined,
          {
            failureCount: cbMetrics.failureCount,
            failureRate: cbMetrics.failureRate.toFixed(3),
            timeInCurrentState: cbMetrics.timeInCurrentState,
            lastFailureTime: cbMetrics.lastFailureTime
          }
        )
      }
    }

    // Console log for immediate visibility
    logger.info('CIRCUIT_BREAKER_MANAGER', 
      `📊 Circuit Breaker Report: ${metrics.totalCircuitBreakers} total, ` +
      `${metrics.openCircuitBreakers} open, ${metrics.halfOpenCircuitBreakers} half-open, ` +
      `${metrics.closedCircuitBreakers} closed`
    )
  }

  /**
   * Stop periodic reporting
   */
  stopPeriodicReporting(): void {
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer)
      this.reportingTimer = null
    }
  }

  /**
   * Generate detailed health report
   */
  generateHealthReport(): {
    healthy: boolean
    summary: GlobalCircuitBreakerMetrics
    issues: string[]
    recommendations: string[]
  } {
    const metrics = this.getGlobalMetrics()
    const issues: string[] = []
    const recommendations: string[] = []

    // Check for open circuit breakers
    if (metrics.openCircuitBreakers > 0) {
      issues.push(`${metrics.openCircuitBreakers} circuit breaker(s) are OPEN`)
      recommendations.push('Investigate and fix underlying service issues')
    }

    // Check global failure rate
    if (metrics.globalFailureRate > 0.1) { // 10% failure rate
      issues.push(`High global failure rate: ${(metrics.globalFailureRate * 100).toFixed(1)}%`)
      recommendations.push('Review service health and error handling')
    }

    // Check for slow responses
    if (metrics.averageResponseTime > 5000) { // 5 seconds
      issues.push(`Slow average response time: ${metrics.averageResponseTime.toFixed(0)}ms`)
      recommendations.push('Optimize service performance or adjust timeouts')
    }

    const healthy = issues.length === 0

    return {
      healthy,
      summary: metrics,
      issues,
      recommendations
    }
  }

  /**
   * Shutdown manager
   */
  shutdown(): void {
    this.stopPeriodicReporting()
    this.circuitBreakers.clear()
    logger.info('CIRCUIT_BREAKER_MANAGER', 'Circuit breaker manager shutdown')
  }
}

/**
 * Default circuit breaker manager configuration
 */
export const DEFAULT_MANAGER_CONFIG: CircuitBreakerManagerConfig = {
  enableGlobalMetrics: true,
  enableEventLogging: true,
  enablePeriodicReporting: true,
  reportingInterval: 300000, // 5 minutes
  enableAutoRecovery: true,
  globalTimeout: 30000 // 30 seconds
}

/**
 * Production circuit breaker manager configuration
 */
export const PRODUCTION_MANAGER_CONFIG: CircuitBreakerManagerConfig = {
  enableGlobalMetrics: true,
  enableEventLogging: true,
  enablePeriodicReporting: true,
  reportingInterval: 180000, // 3 minutes
  enableAutoRecovery: true,
  globalTimeout: 15000 // 15 seconds
}

/**
 * Test circuit breaker manager configuration
 */
export const TEST_MANAGER_CONFIG: CircuitBreakerManagerConfig = {
  enableGlobalMetrics: true,
  enableEventLogging: false, // Reduce noise in tests
  enablePeriodicReporting: false,
  reportingInterval: 10000, // 10 seconds
  enableAutoRecovery: true,
  globalTimeout: 5000 // 5 seconds
}

/**
 * Global circuit breaker manager instance
 */
let globalCircuitBreakerManager: CircuitBreakerManager | null = null

/**
 * Get or create global circuit breaker manager
 */
export function getCircuitBreakerManager(): CircuitBreakerManager {
  if (!globalCircuitBreakerManager) {
    globalCircuitBreakerManager = new CircuitBreakerManager(DEFAULT_MANAGER_CONFIG)
  }
  return globalCircuitBreakerManager
}

/**
 * Initialize global circuit breaker manager
 */
export function initializeCircuitBreakerManager(config: Partial<CircuitBreakerManagerConfig>): CircuitBreakerManager {
  const finalConfig = { ...DEFAULT_MANAGER_CONFIG, ...config }
  globalCircuitBreakerManager = new CircuitBreakerManager(finalConfig)
  return globalCircuitBreakerManager
}

/**
 * Convenience function to execute with circuit breaker
 */
export async function executeWithCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>,
  metadata?: Record<string, any>
): Promise<T> {
  const manager = getCircuitBreakerManager()
  return manager.execute(name, operation, config, metadata)
}
