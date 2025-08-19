/**
 * Circuit Breaker Pattern Implementation
 * Provides fault tolerance and resilience for external service calls
 * Prevents cascading failures and enables fast failure recovery
 */

import { logger } from "./logger"
import { getPerformanceLogger } from "./performanceLogger"

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures before opening
  recoveryTimeout: number // Time in ms before attempting recovery
  successThreshold: number // Number of successes needed to close from half-open
  timeout: number // Request timeout in ms
  monitoringWindow: number // Time window for failure rate calculation
  enableMetrics: boolean // Enable detailed metrics collection
  name: string // Circuit breaker identifier
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState
  failureCount: number
  successCount: number
  totalRequests: number
  failureRate: number
  lastFailureTime: number
  lastSuccessTime: number
  stateChanges: number
  timeInCurrentState: number
  averageResponseTime: number
}

export interface CircuitBreakerEvent {
  type: 'STATE_CHANGE' | 'REQUEST_SUCCESS' | 'REQUEST_FAILURE' | 'TIMEOUT'
  timestamp: number
  state: CircuitBreakerState
  previousState?: CircuitBreakerState
  error?: Error
  duration?: number
  metadata?: Record<string, any>
}

/**
 * Circuit Breaker implementation with advanced monitoring
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED'
  private failureCount = 0
  private successCount = 0
  private totalRequests = 0
  private lastFailureTime = 0
  private lastSuccessTime = 0
  private stateChangeTime = Date.now()
  private stateChanges = 0
  private recentRequests: Array<{ timestamp: number; success: boolean; duration: number }> = []
  private eventListeners: Array<(event: CircuitBreakerEvent) => void> = []

  constructor(private config: CircuitBreakerConfig) {
    this.logStateChange('CLOSED', 'CLOSED', 'Circuit breaker initialized')
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    const startTime = Date.now()
    this.totalRequests++

    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (this.shouldAttemptRecovery()) {
        this.transitionToHalfOpen()
      } else {
        const error = new Error(`Circuit breaker is OPEN for ${this.config.name}`)
        this.emitEvent({
          type: 'REQUEST_FAILURE',
          timestamp: Date.now(),
          state: this.state,
          error,
          metadata
        })
        throw error
      }
    }

    try {
      // Execute operation with timeout
      const result = await this.executeWithTimeout(operation)
      const duration = Date.now() - startTime

      // Record success
      this.recordSuccess(duration)
      
      this.emitEvent({
        type: 'REQUEST_SUCCESS',
        timestamp: Date.now(),
        state: this.state,
        duration,
        metadata
      })

      return result

    } catch (error) {
      const duration = Date.now() - startTime
      
      // Record failure
      this.recordFailure(duration, error as Error)
      
      this.emitEvent({
        type: 'REQUEST_FAILURE',
        timestamp: Date.now(),
        state: this.state,
        error: error as Error,
        duration,
        metadata
      })

      throw error
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const timeoutError = new Error(`Operation timeout after ${this.config.timeout}ms`)
        this.emitEvent({
          type: 'TIMEOUT',
          timestamp: Date.now(),
          state: this.state,
          error: timeoutError
        })
        reject(timeoutError)
      }, this.config.timeout)

      operation()
        .then(result => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Record successful operation
   */
  private recordSuccess(duration: number): void {
    this.successCount++
    this.lastSuccessTime = Date.now()
    
    this.addToRecentRequests(true, duration)

    // Transition from HALF_OPEN to CLOSED if enough successes
    if (this.state === 'HALF_OPEN' && this.successCount >= this.config.successThreshold) {
      this.transitionToClosed()
    }

    if (this.config.enableMetrics) {
      const performanceLogger = getPerformanceLogger()
      performanceLogger.recordRequest()
    }
  }

  /**
   * Record failed operation
   */
  private recordFailure(duration: number, error: Error): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    this.addToRecentRequests(false, duration)

    // Transition to OPEN if failure threshold exceeded
    if (this.state !== 'OPEN' && this.shouldOpen()) {
      this.transitionToOpen()
    }

    logger.warn('CIRCUIT_BREAKER', 
      `Failure recorded for ${this.config.name}: ${error.message} ` +
      `(${this.failureCount}/${this.config.failureThreshold} failures)`
    )
  }

  /**
   * Add request to recent requests tracking
   */
  private addToRecentRequests(success: boolean, duration: number): void {
    const now = Date.now()
    this.recentRequests.push({ timestamp: now, success, duration })

    // Clean old requests outside monitoring window
    const cutoff = now - this.config.monitoringWindow
    this.recentRequests = this.recentRequests.filter(req => req.timestamp > cutoff)
  }

  /**
   * Check if circuit should open
   */
  private shouldOpen(): boolean {
    if (this.failureCount < this.config.failureThreshold) {
      return false
    }

    // Calculate failure rate within monitoring window
    const recentFailures = this.recentRequests.filter(req => !req.success).length
    const recentTotal = this.recentRequests.length

    if (recentTotal === 0) {
      return false
    }

    const failureRate = recentFailures / recentTotal
    return failureRate >= 0.5 // 50% failure rate threshold
  }

  /**
   * Check if should attempt recovery from OPEN state
   */
  private shouldAttemptRecovery(): boolean {
    return Date.now() - this.stateChangeTime >= this.config.recoveryTimeout
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state
    this.state = 'CLOSED'
    this.failureCount = 0
    this.successCount = 0
    this.stateChangeTime = Date.now()
    this.stateChanges++

    this.logStateChange(previousState, 'CLOSED', 'Circuit breaker closed - service recovered')
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state
    this.state = 'OPEN'
    this.stateChangeTime = Date.now()
    this.stateChanges++

    this.logStateChange(previousState, 'OPEN', 
      `Circuit breaker opened - failure threshold exceeded (${this.failureCount}/${this.config.failureThreshold})`
    )
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state
    this.state = 'HALF_OPEN'
    this.successCount = 0
    this.stateChangeTime = Date.now()
    this.stateChanges++

    this.logStateChange(previousState, 'HALF_OPEN', 'Circuit breaker attempting recovery')
  }

  /**
   * Log state change
   */
  private logStateChange(from: CircuitBreakerState, to: CircuitBreakerState, message: string): void {
    logger.info('CIRCUIT_BREAKER', `${this.config.name}: ${message} (${from} → ${to})`)
    
    this.emitEvent({
      type: 'STATE_CHANGE',
      timestamp: Date.now(),
      state: to,
      previousState: from
    })
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: CircuitBreakerEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        logger.error('CIRCUIT_BREAKER', `Event listener error: ${error}`)
      }
    })
  }

  /**
   * Add event listener
   */
  addEventListener(listener: (event: CircuitBreakerEvent) => void): void {
    this.eventListeners.push(listener)
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: CircuitBreakerEvent) => void): void {
    const index = this.eventListeners.indexOf(listener)
    if (index > -1) {
      this.eventListeners.splice(index, 1)
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const recentFailures = this.recentRequests.filter(req => !req.success).length
    const recentTotal = this.recentRequests.length
    const failureRate = recentTotal > 0 ? recentFailures / recentTotal : 0

    const averageResponseTime = this.recentRequests.length > 0
      ? this.recentRequests.reduce((sum, req) => sum + req.duration, 0) / this.recentRequests.length
      : 0

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      failureRate,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChanges: this.stateChanges,
      timeInCurrentState: Date.now() - this.stateChangeTime,
      averageResponseTime
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state
  }

  /**
   * Force state change (for testing)
   */
  forceState(state: CircuitBreakerState): void {
    const previousState = this.state
    this.state = state
    this.stateChangeTime = Date.now()
    this.stateChanges++

    this.logStateChange(previousState, state, `Circuit breaker state forced to ${state}`)
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    const previousState = this.state
    this.state = 'CLOSED'
    this.failureCount = 0
    this.successCount = 0
    this.totalRequests = 0
    this.lastFailureTime = 0
    this.lastSuccessTime = 0
    this.stateChangeTime = Date.now()
    this.stateChanges++
    this.recentRequests = []

    this.logStateChange(previousState, 'CLOSED', 'Circuit breaker reset')
  }
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  successThreshold: 3,
  timeout: 30000, // 30 seconds
  monitoringWindow: 300000, // 5 minutes
  enableMetrics: true
}

/**
 * Production circuit breaker configuration
 */
export const PRODUCTION_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 10,
  recoveryTimeout: 30000, // 30 seconds
  successThreshold: 5,
  timeout: 15000, // 15 seconds
  monitoringWindow: 600000, // 10 minutes
  enableMetrics: true
}

/**
 * Test circuit breaker configuration
 */
export const TEST_CIRCUIT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 3,
  recoveryTimeout: 1000, // 1 second
  successThreshold: 2,
  timeout: 5000, // 5 seconds
  monitoringWindow: 30000, // 30 seconds
  enableMetrics: true
}

/**
 * Create circuit breaker with configuration
 */
export function createCircuitBreaker(
  name: string, 
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  const finalConfig: CircuitBreakerConfig = {
    ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
    ...config,
    name
  }
  
  return new CircuitBreaker(finalConfig)
}
