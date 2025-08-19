/**
 * Async Logger Implementation
 * High-performance async logging with queue management and performance tracking
 */

import { BatchLogger, LogEntry, createBatchLogger } from "./batchLogger"
import { LogLevel } from "./logger"

export interface AsyncLoggerConfig {
  enableBatchLogging: boolean
  enablePerformanceTracking: boolean
  enableAsyncQueue: boolean
  queueMaxSize: number
  queueFlushInterval: number
  enableMetrics: boolean
}

export interface PerformanceMetrics {
  totalLogs: number
  averageLogTime: number
  maxLogTime: number
  minLogTime: number
  queueOverflows: number
  asyncOperations: number
  totalAsyncTime: number
}

export interface LogContext {
  correlationId?: string
  requestId?: string
  userId?: string
  sessionId?: string
  metadata?: Record<string, any>
}

/**
 * High-performance async logger
 */
export class AsyncLogger {
  private batchLogger: BatchLogger
  private logQueue: Promise<void> = Promise.resolve()
  private queueSize = 0
  private metrics: PerformanceMetrics = {
    totalLogs: 0,
    averageLogTime: 0,
    maxLogTime: 0,
    minLogTime: Infinity,
    queueOverflows: 0,
    asyncOperations: 0,
    totalAsyncTime: 0
  }

  constructor(
    private config: AsyncLoggerConfig,
    batchLogger?: BatchLogger
  ) {
    this.batchLogger = batchLogger || createBatchLogger()
  }

  /**
   * Async log method with performance tracking
   */
  async logAsync(
    level: LogLevel, 
    category: string, 
    message: string, 
    context?: LogContext,
    ...args: unknown[]
  ): Promise<void> {
    const startTime = Date.now()

    try {
      // Create log entry
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: LogLevel[level],
        category,
        message: this.formatMessage(message, ...args),
        correlationId: context?.correlationId,
        metadata: {
          ...context?.metadata,
          requestId: context?.requestId,
          userId: context?.userId,
          sessionId: context?.sessionId
        }
      }

      // Queue the log operation
      if (this.config.enableAsyncQueue) {
        await this.queueLogOperation(entry)
      } else {
        await this.batchLogger.log(entry)
      }

      // Track performance
      if (this.config.enablePerformanceTracking) {
        this.updatePerformanceMetrics(startTime)
      }

    } catch (error) {
      // Fallback to console if async logging fails
      console.error(`Async logging failed: ${error}`)
      console.log(`${LogLevel[level]} [${category}] ${message}`)
    }
  }

  /**
   * Queue log operation to prevent blocking
   */
  private async queueLogOperation(entry: LogEntry): Promise<void> {
    // Check queue size limit
    if (this.queueSize >= this.config.queueMaxSize) {
      this.metrics.queueOverflows++
      
      // Skip this log entry to prevent memory issues
      console.warn(`Log queue overflow, dropping log entry: ${entry.message}`)
      return
    }

    this.queueSize++
    this.metrics.asyncOperations++

    const asyncStartTime = Date.now()

    // Add to queue
    this.logQueue = this.logQueue
      .then(async () => {
        try {
          await this.batchLogger.log(entry)
        } finally {
          this.queueSize--
          
          if (this.config.enablePerformanceTracking) {
            const asyncTime = Date.now() - asyncStartTime
            this.metrics.totalAsyncTime += asyncTime
          }
        }
      })
      .catch(error => {
        this.queueSize--
        console.error(`Queued log operation failed: ${error}`)
      })

    return this.logQueue
  }

  /**
   * Format message with arguments
   */
  private formatMessage(message: string, ...args: unknown[]): string {
    if (args.length === 0) {
      return message
    }

    const formattedArgs = args.map(arg => {
      if (arg === null) return 'null'
      if (arg === undefined) return 'undefined'
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg)
        } catch {
          return '[Circular Object]'
        }
      }
      return String(arg)
    })

    return `${message} ${formattedArgs.join(' ')}`
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(startTime: number): void {
    const logTime = Date.now() - startTime
    
    this.metrics.totalLogs++
    this.metrics.maxLogTime = Math.max(this.metrics.maxLogTime, logTime)
    this.metrics.minLogTime = Math.min(this.metrics.minLogTime, logTime)
    
    // Calculate running average
    const totalTime = (this.metrics.averageLogTime * (this.metrics.totalLogs - 1)) + logTime
    this.metrics.averageLogTime = totalTime / this.metrics.totalLogs
  }

  /**
   * Convenience methods for different log levels
   */
  async debugAsync(category: string, message: string, context?: LogContext, ...args: unknown[]): Promise<void> {
    return this.logAsync(LogLevel.DEBUG, category, message, context, ...args)
  }

  async infoAsync(category: string, message: string, context?: LogContext, ...args: unknown[]): Promise<void> {
    return this.logAsync(LogLevel.INFO, category, message, context, ...args)
  }

  async warnAsync(category: string, message: string, context?: LogContext, ...args: unknown[]): Promise<void> {
    return this.logAsync(LogLevel.WARN, category, message, context, ...args)
  }

  async errorAsync(category: string, message: string, context?: LogContext, ...args: unknown[]): Promise<void> {
    return this.logAsync(LogLevel.ERROR, category, message, context, ...args)
  }

  /**
   * Specialized async logging methods
   */
  async logRequestAsync(
    method: string,
    path: string,
    status: number,
    duration: number,
    context?: LogContext
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'INFO',
      category: 'REQUEST',
      message: `${method} ${path} ${status}`,
      duration,
      correlationId: context?.correlationId,
      metadata: {
        method,
        path,
        status,
        duration,
        ...context?.metadata
      }
    }

    if (this.config.enableAsyncQueue) {
      await this.queueLogOperation(entry)
    } else {
      await this.batchLogger.log(entry)
    }
  }

  async logPerformanceAsync(
    operation: string,
    duration: number,
    metadata?: Record<string, any>,
    context?: LogContext
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'DEBUG',
      category: 'PERFORMANCE',
      message: `${operation} completed in ${duration}ms`,
      duration,
      correlationId: context?.correlationId,
      metadata: {
        operation,
        duration,
        ...metadata,
        ...context?.metadata
      }
    }

    if (this.config.enableAsyncQueue) {
      await this.queueLogOperation(entry)
    } else {
      await this.batchLogger.log(entry)
    }
  }

  async logErrorAsync(
    error: Error,
    category: string,
    context?: LogContext,
    additionalInfo?: Record<string, any>
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'ERROR',
      category,
      message: error.message,
      correlationId: context?.correlationId,
      metadata: {
        errorName: error.name,
        errorStack: error.stack,
        ...additionalInfo,
        ...context?.metadata
      }
    }

    if (this.config.enableAsyncQueue) {
      await this.queueLogOperation(entry)
    } else {
      await this.batchLogger.log(entry)
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Get combined metrics (async + batch)
   */
  getCombinedMetrics(): {
    asyncMetrics: PerformanceMetrics
    batchMetrics: any
    queueStatus: {
      currentSize: number
      maxSize: number
      utilizationPercent: number
    }
  } {
    return {
      asyncMetrics: this.getPerformanceMetrics(),
      batchMetrics: this.batchLogger.getMetrics(),
      queueStatus: {
        currentSize: this.queueSize,
        maxSize: this.config.queueMaxSize,
        utilizationPercent: (this.queueSize / this.config.queueMaxSize) * 100
      }
    }
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalLogs: 0,
      averageLogTime: 0,
      maxLogTime: 0,
      minLogTime: Infinity,
      queueOverflows: 0,
      asyncOperations: 0,
      totalAsyncTime: 0
    }
    this.batchLogger.resetMetrics()
  }

  /**
   * Flush all pending logs
   */
  async flush(): Promise<void> {
    // Wait for queue to empty
    await this.logQueue
    
    // Flush batch logger
    await this.batchLogger.flush()
  }

  /**
   * Shutdown async logger
   */
  async shutdown(): Promise<void> {
    // Wait for all queued operations
    await this.logQueue
    
    // Shutdown batch logger
    await this.batchLogger.shutdown()
  }
}

/**
 * Default async logger configuration
 */
export const DEFAULT_ASYNC_CONFIG: AsyncLoggerConfig = {
  enableBatchLogging: true,
  enablePerformanceTracking: true,
  enableAsyncQueue: true,
  queueMaxSize: 1000,
  queueFlushInterval: 1000,
  enableMetrics: true
}

/**
 * Production async logger configuration
 */
export const PRODUCTION_ASYNC_CONFIG: AsyncLoggerConfig = {
  enableBatchLogging: true,
  enablePerformanceTracking: true,
  enableAsyncQueue: true,
  queueMaxSize: 5000,
  queueFlushInterval: 500,
  enableMetrics: true
}

/**
 * Test async logger configuration
 */
export const TEST_ASYNC_CONFIG: AsyncLoggerConfig = {
  enableBatchLogging: true,
  enablePerformanceTracking: true,
  enableAsyncQueue: false, // Synchronous for predictable testing
  queueMaxSize: 100,
  queueFlushInterval: 100,
  enableMetrics: true
}

/**
 * Create async logger instance
 */
export function createAsyncLogger(config: Partial<AsyncLoggerConfig> = {}): AsyncLogger {
  const finalConfig = { ...DEFAULT_ASYNC_CONFIG, ...config }
  return new AsyncLogger(finalConfig)
}

/**
 * Global async logger instance
 */
let globalAsyncLogger: AsyncLogger | null = null

/**
 * Get or create global async logger
 */
export function getAsyncLogger(): AsyncLogger {
  if (!globalAsyncLogger) {
    globalAsyncLogger = createAsyncLogger()
  }
  return globalAsyncLogger
}

/**
 * Initialize global async logger with configuration
 */
export function initializeAsyncLogger(config: Partial<AsyncLoggerConfig>): AsyncLogger {
  globalAsyncLogger = createAsyncLogger(config)
  return globalAsyncLogger
}
