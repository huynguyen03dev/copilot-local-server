/**
 * Performance Logging and Metrics Collection
 * Advanced performance monitoring with detailed metrics and dashboards
 */

import { AsyncLogger, createAsyncLogger, LogContext } from "./asyncLogger"
import { logger } from "./logger"

export interface PerformanceEntry {
  operation: string
  startTime: number
  endTime: number
  duration: number
  category: string
  metadata?: Record<string, any>
  correlationId?: string
}

export interface PerformanceStats {
  operation: string
  count: number
  totalDuration: number
  averageDuration: number
  minDuration: number
  maxDuration: number
  p50Duration: number
  p95Duration: number
  p99Duration: number
  errorCount: number
  errorRate: number
}

export interface SystemMetrics {
  memoryUsage: {
    used: number
    total: number
    percentage: number
  }
  cpuUsage?: number
  requestsPerSecond: number
  activeConnections: number
  responseTimeP95: number
  errorRate: number
}

/**
 * Performance logger with advanced metrics collection
 */
export class PerformanceLogger {
  private asyncLogger: AsyncLogger
  private performanceEntries: PerformanceEntry[] = []
  private operationStats = new Map<string, PerformanceStats>()
  private requestCounts = new Map<number, number>() // timestamp -> count
  private readonly MAX_ENTRIES = 10000
  private readonly STATS_WINDOW_MS = 60000 // 1 minute

  constructor(asyncLogger?: AsyncLogger) {
    this.asyncLogger = asyncLogger || createAsyncLogger()
    this.startPeriodicCleanup()
  }

  /**
   * Start performance measurement
   */
  startMeasurement(operation: string, category: string = 'GENERAL', metadata?: Record<string, any>): PerformanceMeasurement {
    return new PerformanceMeasurement(this, operation, category, metadata)
  }

  /**
   * Record performance entry
   */
  async recordPerformance(entry: PerformanceEntry): Promise<void> {
    // Add to entries list
    this.performanceEntries.push(entry)

    // Maintain max entries limit
    if (this.performanceEntries.length > this.MAX_ENTRIES) {
      this.performanceEntries.shift()
    }

    // Update operation statistics
    this.updateOperationStats(entry)

    // Log performance entry
    await this.asyncLogger.logPerformanceAsync(
      entry.operation,
      entry.duration,
      entry.metadata,
      { correlationId: entry.correlationId }
    )

    // Log slow operations
    if (entry.duration > 1000) { // > 1 second
      await this.asyncLogger.warnAsync(
        'PERFORMANCE',
        `Slow operation detected: ${entry.operation} took ${entry.duration}ms`,
        { correlationId: entry.correlationId },
        entry.metadata
      )
    }
  }

  /**
   * Update operation statistics
   */
  private updateOperationStats(entry: PerformanceEntry): void {
    const key = `${entry.category}:${entry.operation}`
    let stats = this.operationStats.get(key)

    if (!stats) {
      stats = {
        operation: entry.operation,
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorCount: 0,
        errorRate: 0
      }
      this.operationStats.set(key, stats)
    }

    // Update basic stats
    stats.count++
    stats.totalDuration += entry.duration
    stats.averageDuration = stats.totalDuration / stats.count
    stats.minDuration = Math.min(stats.minDuration, entry.duration)
    stats.maxDuration = Math.max(stats.maxDuration, entry.duration)

    // Update percentiles (simplified calculation)
    const recentEntries = this.performanceEntries
      .filter(e => e.operation === entry.operation && e.category === entry.category)
      .map(e => e.duration)
      .sort((a, b) => a - b)

    if (recentEntries.length > 0) {
      stats.p50Duration = this.calculatePercentile(recentEntries, 50)
      stats.p95Duration = this.calculatePercentile(recentEntries, 95)
      stats.p99Duration = this.calculatePercentile(recentEntries, 99)
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1
    return sortedArray[Math.max(0, index)] || 0
  }

  /**
   * Record request for rate calculation
   */
  recordRequest(): void {
    const now = Math.floor(Date.now() / 1000) // Round to seconds
    const current = this.requestCounts.get(now) || 0
    this.requestCounts.set(now, current + 1)

    // Clean old entries
    const cutoff = now - 60 // Keep last 60 seconds
    for (const [timestamp] of this.requestCounts) {
      if (timestamp < cutoff) {
        this.requestCounts.delete(timestamp)
      }
    }
  }

  /**
   * Get requests per second
   */
  getRequestsPerSecond(): number {
    const now = Math.floor(Date.now() / 1000)
    const lastMinute = Array.from(this.requestCounts.entries())
      .filter(([timestamp]) => timestamp > now - 60)
      .reduce((sum, [, count]) => sum + count, 0)

    return Math.round(lastMinute / 60)
  }

  /**
   * Get operation statistics
   */
  getOperationStats(operation?: string): PerformanceStats[] {
    const stats = Array.from(this.operationStats.values())
    
    if (operation) {
      return stats.filter(s => s.operation.includes(operation))
    }
    
    return stats.sort((a, b) => b.count - a.count) // Sort by frequency
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage()
    const used = Math.round(memoryUsage.heapUsed / 1024 / 1024)
    const total = Math.round(memoryUsage.heapTotal / 1024 / 1024)

    // Calculate P95 response time from recent entries
    const recentDurations = this.performanceEntries
      .filter(e => Date.now() - e.endTime < this.STATS_WINDOW_MS)
      .map(e => e.duration)
      .sort((a, b) => a - b)

    const responseTimeP95 = recentDurations.length > 0
      ? this.calculatePercentile(recentDurations, 95)
      : 0

    return {
      memoryUsage: {
        used,
        total,
        percentage: Math.round((used / total) * 100)
      },
      requestsPerSecond: this.getRequestsPerSecond(),
      activeConnections: 0, // Would be provided by connection pool
      responseTimeP95,
      errorRate: 0 // Would be calculated from error stats
    }
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): {
    summary: SystemMetrics
    topOperations: PerformanceStats[]
    slowOperations: PerformanceStats[]
    recentEntries: PerformanceEntry[]
  } {
    const stats = this.getOperationStats()
    
    return {
      summary: this.getSystemMetrics(),
      topOperations: stats.slice(0, 10), // Top 10 by frequency
      slowOperations: stats
        .filter(s => s.averageDuration > 100) // > 100ms average
        .sort((a, b) => b.averageDuration - a.averageDuration)
        .slice(0, 10),
      recentEntries: this.performanceEntries
        .slice(-20) // Last 20 entries
        .reverse()
    }
  }

  /**
   * Log performance dashboard
   */
  async logPerformanceDashboard(): Promise<void> {
    const report = this.generatePerformanceReport()
    
    await this.asyncLogger.infoAsync('PERFORMANCE', 'Performance Dashboard', undefined, {
      summary: report.summary,
      topOperations: report.topOperations.slice(0, 5),
      slowOperations: report.slowOperations.slice(0, 3)
    })

    // Log to console for immediate visibility
    logger.info('PERFORMANCE', '📊 Performance Dashboard:')
    logger.info('PERFORMANCE', `   Memory: ${report.summary.memoryUsage.used}MB / ${report.summary.memoryUsage.total}MB (${report.summary.memoryUsage.percentage}%)`)
    logger.info('PERFORMANCE', `   Requests/sec: ${report.summary.requestsPerSecond}`)
    logger.info('PERFORMANCE', `   P95 Response Time: ${report.summary.responseTimeP95}ms`)
    
    if (report.topOperations.length > 0) {
      logger.info('PERFORMANCE', '   Top Operations:')
      report.topOperations.slice(0, 3).forEach(op => {
        logger.info('PERFORMANCE', `     ${op.operation}: ${op.count} calls, ${op.averageDuration.toFixed(1)}ms avg`)
      })
    }
  }

  /**
   * Start periodic cleanup of old entries
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      const cutoff = Date.now() - (5 * 60 * 1000) // 5 minutes ago
      
      // Remove old performance entries
      this.performanceEntries = this.performanceEntries.filter(
        entry => entry.endTime > cutoff
      )

      // Clean operation stats for operations with no recent activity
      for (const [key, stats] of this.operationStats) {
        const hasRecentActivity = this.performanceEntries.some(
          entry => `${entry.category}:${entry.operation}` === key
        )
        
        if (!hasRecentActivity && stats.count < 10) {
          this.operationStats.delete(key)
        }
      }
    }, 60000) // Run every minute
  }

  /**
   * Flush all pending logs
   */
  async flush(): Promise<void> {
    await this.asyncLogger.flush()
  }

  /**
   * Shutdown performance logger
   */
  async shutdown(): Promise<void> {
    await this.asyncLogger.shutdown()
  }
}

/**
 * Performance measurement helper class
 */
export class PerformanceMeasurement {
  private startTime: number
  private correlationId?: string

  constructor(
    private logger: PerformanceLogger,
    private operation: string,
    private category: string,
    private metadata?: Record<string, any>
  ) {
    this.startTime = Date.now()
  }

  /**
   * Set correlation ID for tracking
   */
  setCorrelationId(id: string): this {
    this.correlationId = id
    return this
  }

  /**
   * Add metadata
   */
  addMetadata(key: string, value: any): this {
    if (!this.metadata) {
      this.metadata = {}
    }
    this.metadata[key] = value
    return this
  }

  /**
   * End measurement and record performance
   */
  async end(): Promise<number> {
    const endTime = Date.now()
    const duration = endTime - this.startTime

    const entry: PerformanceEntry = {
      operation: this.operation,
      startTime: this.startTime,
      endTime,
      duration,
      category: this.category,
      metadata: this.metadata,
      correlationId: this.correlationId
    }

    await this.logger.recordPerformance(entry)
    return duration
  }
}

/**
 * Global performance logger instance
 */
let globalPerformanceLogger: PerformanceLogger | null = null

/**
 * Get or create global performance logger
 */
export function getPerformanceLogger(): PerformanceLogger {
  if (!globalPerformanceLogger) {
    globalPerformanceLogger = new PerformanceLogger()
  }
  return globalPerformanceLogger
}

/**
 * Initialize global performance logger
 */
export function initializePerformanceLogger(asyncLogger?: AsyncLogger): PerformanceLogger {
  globalPerformanceLogger = new PerformanceLogger(asyncLogger)
  return globalPerformanceLogger
}

/**
 * Convenience function to measure performance
 */
export function measurePerformance(
  operation: string,
  category: string = 'GENERAL',
  metadata?: Record<string, any>
): PerformanceMeasurement {
  return getPerformanceLogger().startMeasurement(operation, category, metadata)
}
