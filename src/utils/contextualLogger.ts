/**
 * Contextual Logger Utility
 * Provides enhanced logging with automatic context injection and correlation tracking
 */

import { Logger, LogLevel } from './logger'
import { ENVIRONMENTS } from '../constants'

export interface LogContext {
  correlationId?: string
  userId?: string
  requestId?: string
  streamId?: string
  endpoint?: string
  method?: string
  userAgent?: string
  [key: string]: unknown
}

export interface ContextualLoggerConfig {
  enableContextLogging: boolean
  enablePerformanceLogging: boolean
  enableDebugContext: boolean
  maxContextSize: number
}

const DEFAULT_CONTEXTUAL_CONFIG: ContextualLoggerConfig = {
  enableContextLogging: true,
  enablePerformanceLogging: true,
  enableDebugContext: process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT,
  maxContextSize: 1000 // Max characters for context serialization
}

/**
 * Enhanced logger with automatic context injection
 */
export class ContextualLogger {
  private config: ContextualLoggerConfig

  constructor(
    private baseLogger: Logger,
    private defaultContext: LogContext = {},
    config: Partial<ContextualLoggerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONTEXTUAL_CONFIG, ...config }
  }

  /**
   * Create a new logger with additional context
   */
  withContext(context: LogContext): ContextualLogger {
    return new ContextualLogger(
      this.baseLogger,
      { ...this.defaultContext, ...context },
      this.config
    )
  }

  /**
   * Create a logger for a specific operation
   */
  forOperation(operation: string, additionalContext: LogContext = {}): ContextualLogger {
    return this.withContext({
      operation,
      timestamp: new Date().toISOString(),
      ...additionalContext
    })
  }

  /**
   * Create a logger for a specific request
   */
  forRequest(requestId: string, method: string, path: string, additionalContext: LogContext = {}): ContextualLogger {
    return this.withContext({
      requestId,
      method,
      path,
      requestStartTime: Date.now(),
      ...additionalContext
    })
  }

  /**
   * Create a logger for streaming operations
   */
  forStream(streamId: string, additionalContext: LogContext = {}): ContextualLogger {
    return this.withContext({
      streamId,
      streamStartTime: Date.now(),
      ...additionalContext
    })
  }

  /**
   * Serialize context for logging with size limits
   */
  private serializeContext(additionalContext?: LogContext): string {
    if (!this.config.enableContextLogging) {
      return ''
    }

    const fullContext = { ...this.defaultContext, ...additionalContext }
    
    // Remove undefined values
    const cleanContext = Object.fromEntries(
      Object.entries(fullContext).filter(([_, value]) => value !== undefined)
    )

    if (Object.keys(cleanContext).length === 0) {
      return ''
    }

    try {
      let serialized = JSON.stringify(cleanContext)
      
      // Truncate if too large
      if (serialized.length > this.config.maxContextSize) {
        serialized = serialized.substring(0, this.config.maxContextSize - 3) + '...'
      }
      
      return ` ${serialized}`
    } catch (error) {
      // Fallback if serialization fails
      return ` [Context serialization failed: ${error}]`
    }
  }

  /**
   * Enhanced debug logging with context
   */
  debug(category: string, message: string, additionalContext?: LogContext): void {
    if (!this.baseLogger.isLevelEnabled?.(LogLevel.DEBUG)) return

    const contextStr = this.serializeContext(additionalContext)
    this.baseLogger.debug(category, `${message}${contextStr}`)
  }

  /**
   * Enhanced info logging with context
   */
  info(category: string, message: string, additionalContext?: LogContext): void {
    if (!this.baseLogger.isLevelEnabled?.(LogLevel.INFO)) return

    const contextStr = this.serializeContext(additionalContext)
    this.baseLogger.info(category, `${message}${contextStr}`)
  }

  /**
   * Enhanced warning logging with context
   */
  warn(category: string, message: string, additionalContext?: LogContext): void {
    if (!this.baseLogger.isLevelEnabled?.(LogLevel.WARN)) return

    const contextStr = this.serializeContext(additionalContext)
    this.baseLogger.warn(category, `${message}${contextStr}`)
  }

  /**
   * Enhanced error logging with context
   */
  error(category: string, message: string, error?: Error, additionalContext?: LogContext): void {
    if (!this.baseLogger.isLevelEnabled?.(LogLevel.ERROR)) return

    const errorContext = error ? {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: this.config.enableDebugContext ? error.stack : undefined,
      ...additionalContext
    } : additionalContext

    const contextStr = this.serializeContext(errorContext)
    this.baseLogger.error(category, `${message}${contextStr}`)
  }

  /**
   * Performance logging with automatic timing
   */
  performance(category: string, operation: string, startTime: number, additionalContext?: LogContext): void {
    if (!this.config.enablePerformanceLogging) return

    const duration = Date.now() - startTime
    const perfContext = {
      operation,
      duration: `${duration}ms`,
      ...additionalContext
    }

    if (duration > 1000) {
      this.warn(category, `Slow operation: ${operation}`, perfContext)
    } else if (duration > 100) {
      this.info(category, `Operation completed: ${operation}`, perfContext)
    } else {
      this.debug(category, `Fast operation: ${operation}`, perfContext)
    }
  }

  /**
   * Structured logging for API requests
   */
  apiRequest(method: string, path: string, statusCode: number, duration: number, additionalContext?: LogContext): void {
    const apiContext = {
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
      ...additionalContext
    }

    if (statusCode >= 500) {
      this.error('API', `${method} ${path} failed`, undefined, apiContext)
    } else if (statusCode >= 400) {
      this.warn('API', `${method} ${path} client error`, apiContext)
    } else if (duration > 5000) {
      this.warn('API', `${method} ${path} slow response`, apiContext)
    } else {
      this.info('API', `${method} ${path} completed`, apiContext)
    }
  }

  /**
   * Structured logging for streaming operations
   */
  streamEvent(event: 'start' | 'progress' | 'complete' | 'error', streamId: string, additionalContext?: LogContext): void {
    const streamContext = {
      streamId,
      event,
      ...additionalContext
    }

    switch (event) {
      case 'start':
        this.info('STREAM', `Stream started: ${streamId}`, streamContext)
        break
      case 'progress':
        this.debug('STREAM', `Stream progress: ${streamId}`, streamContext)
        break
      case 'complete':
        this.info('STREAM', `Stream completed: ${streamId}`, streamContext)
        break
      case 'error':
        this.error('STREAM', `Stream error: ${streamId}`, undefined, streamContext)
        break
    }
  }

  /**
   * Structured logging for authentication events
   */
  authEvent(event: 'login' | 'logout' | 'refresh' | 'failed', userId?: string, additionalContext?: LogContext): void {
    const authContext = {
      userId,
      event,
      timestamp: new Date().toISOString(),
      ...additionalContext
    }

    switch (event) {
      case 'login':
        this.info('AUTH', `User authenticated: ${userId || 'unknown'}`, authContext)
        break
      case 'logout':
        this.info('AUTH', `User logged out: ${userId || 'unknown'}`, authContext)
        break
      case 'refresh':
        this.debug('AUTH', `Token refreshed: ${userId || 'unknown'}`, authContext)
        break
      case 'failed':
        this.warn('AUTH', `Authentication failed: ${userId || 'unknown'}`, authContext)
        break
    }
  }

  /**
   * Get the underlying logger for direct access
   */
  getBaseLogger(): Logger {
    return this.baseLogger
  }

  /**
   * Get current context
   */
  getContext(): LogContext {
    return { ...this.defaultContext }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextualLoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/**
 * Create a contextual logger instance
 */
export function createContextualLogger(
  baseLogger: Logger,
  defaultContext?: LogContext,
  config?: Partial<ContextualLoggerConfig>
): ContextualLogger {
  return new ContextualLogger(baseLogger, defaultContext, config)
}

/**
 * Utility function to safely log objects with circular references
 */
export function safeStringify(obj: unknown, maxDepth: number = 3): string {
  const seen = new WeakSet()
  
  const replacer = (key: string, value: any, depth: number = 0): any => {
    if (depth > maxDepth) {
      return '[Max depth reached]'
    }
    
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular reference]'
      }
      seen.add(value)
    }
    
    return value
  }

  try {
    return JSON.stringify(obj, (key, value) => replacer(key, value))
  } catch (error) {
    return `[Stringify error: ${error}]`
  }
}
