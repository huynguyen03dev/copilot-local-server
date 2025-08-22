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
 * PERFORMANCE OPTIMIZATION: Circular buffer for bounded memory usage
 * Prevents unbounded array growth in high-traffic scenarios
 */
class CircularBuffer<T> {
  private buffer: T[]
  private head = 0
  private tail = 0
  private size = 0

  constructor(private capacity: number) {
    this.buffer = new Array(capacity)
  }

  add(item: T): void {
    this.buffer[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity

    if (this.size < this.capacity) {
      this.size++
    } else {
      // Buffer is full, move head forward
      this.head = (this.head + 1) % this.capacity
    }
  }

  filter(predicate: (item: T) => boolean): T[] {
    const result: T[] = []
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity
      const item = this.buffer[index]
      if (predicate(item)) {
        result.push(item)
      }
    }
    return result
  }

  getAll(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity
      result.push(this.buffer[index])
    }
    return result
  }

  get length(): number {
    return this.size
  }

  clear(): void {
    this.head = 0
    this.tail = 0
    this.size = 0
  }
}

/**
 * Circuit Breaker implementation with advanced monitoring and performance optimizations
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

  // PERFORMANCE OPTIMIZATION: Use circular buffer instead of unbounded array
  private recentRequests: CircularBuffer<{ timestamp: number; success: boolean; duration: number }>

  // PERFORMANCE OPTIMIZATION: Cache failure rate calculations
  private cachedMetrics: {
    failureRate: number
    averageResponseTime: number
    lastCalculated: number
  } | null = null

  private eventListeners: Array<(event: CircuitBreakerEvent) => void> = []

  // Cache invalidation threshold (1 second)
  private static readonly CACHE_TTL_MS = 1000

  // Maximum requests to track (prevents unbounded growth)
  private static readonly MAX_RECENT_REQUESTS = 100

  constructor(private config: CircuitBreakerConfig) {
    // PERFORMANCE OPTIMIZATION: Initialize circular buffer with bounded capacity
    this.recentRequests = new CircularBuffer(CircuitBreaker.MAX_RECENT_REQUESTS)
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
   * PERFORMANCE OPTIMIZATION: Add request to recent requests tracking using circular buffer
   * No need for filtering - circular buffer automatically manages capacity
   */
  private addToRecentRequests(success: boolean, duration: number): void {
    const now = Date.now()
    this.recentRequests.add({ timestamp: now, success, duration })

    // Invalidate cached metrics when new data is added
    this.cachedMetrics = null
  }

  /**
   * PERFORMANCE OPTIMIZATION: Check if circuit should open using cached calculations
   */
  private shouldOpen(): boolean {
    if (this.failureCount < this.config.failureThreshold) {
      return false
    }

    // Use cached failure rate calculation
    const metrics = this.getCachedMetrics()
    return metrics.failureRate >= 0.5 // 50% failure rate threshold
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

    // PERFORMANCE OPTIMIZATION: Invalidate cache on state change
    this.cachedMetrics = null

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

    // PERFORMANCE OPTIMIZATION: Invalidate cache on state change
    this.cachedMetrics = null

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

    // PERFORMANCE OPTIMIZATION: Invalidate cache on state change
    this.cachedMetrics = null

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
   * PERFORMANCE OPTIMIZATION: Get cached metrics to avoid recalculation
   */
  private getCachedMetrics(): { failureRate: number; averageResponseTime: number } {
    const now = Date.now()

    // Return cached metrics if still valid
    if (this.cachedMetrics && (now - this.cachedMetrics.lastCalculated) < CircuitBreaker.CACHE_TTL_MS) {
      return {
        failureRate: this.cachedMetrics.failureRate,
        averageResponseTime: this.cachedMetrics.averageResponseTime
      }
    }

    // Calculate fresh metrics
    const cutoff = now - this.config.monitoringWindow
    const recentRequests = this.recentRequests.filter(req => req.timestamp > cutoff)

    const recentFailures = recentRequests.filter(req => !req.success).length
    const recentTotal = recentRequests.length
    const failureRate = recentTotal > 0 ? recentFailures / recentTotal : 0

    const averageResponseTime = recentRequests.length > 0
      ? recentRequests.reduce((sum, req) => sum + req.duration, 0) / recentRequests.length
      : 0

    // Cache the results
    this.cachedMetrics = {
      failureRate,
      averageResponseTime,
      lastCalculated: now
    }

    return { failureRate, averageResponseTime }
  }

  /**
   * Get current metrics with performance optimizations
   */
  getMetrics(): CircuitBreakerMetrics {
    const cachedMetrics = this.getCachedMetrics()

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      failureRate: cachedMetrics.failureRate,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChanges: this.stateChanges,
      timeInCurrentState: Date.now() - this.stateChangeTime,
      averageResponseTime: cachedMetrics.averageResponseTime
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

    // PERFORMANCE OPTIMIZATION: Clear circular buffer and cache
    this.recentRequests.clear()
    this.cachedMetrics = null

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
