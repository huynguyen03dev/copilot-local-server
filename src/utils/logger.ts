/**
 * Enhanced Logging System for VS Code Copilot API Server
 * Provides structured, configurable, and performance-optimized logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LoggerConfig {
  level: LogLevel
  enableColors: boolean
  enableTimestamps: boolean
  enableCategories: boolean
  chunkLogFrequency: number
  enableProgressLogs: boolean
  enableEndpointLogs: boolean
  enableModelLogs: boolean
  enableMemoryLogs: boolean
}

export interface StreamingLogConfig {
  streamId: string
  chunkCount: number
  totalExpected?: number
  model?: string
  endpoint?: string
  duration?: number
  startTime?: number
}

export interface EndpointAttempt {
  url: string
  status: number
  error?: string
}

export class Logger {
  private config: LoggerConfig
  private logBuffer: string[] = []
  private readonly BATCH_SIZE = 5
  private batchTimeout: NodeJS.Timeout | null = null

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: this.parseLogLevel(process.env.LOG_LEVEL || 'info'),
      enableColors: process.env.LOG_COLORS !== 'false',
      enableTimestamps: process.env.LOG_TIMESTAMPS === 'true',
      enableCategories: process.env.LOG_CATEGORIES !== 'false',
      chunkLogFrequency: parseInt(process.env.CHUNK_LOG_FREQUENCY || '0'), // 0 = adaptive
      enableProgressLogs: process.env.ENABLE_PROGRESS_LOGS !== 'false',
      enableEndpointLogs: process.env.ENABLE_ENDPOINT_LOGS !== 'false',
      enableModelLogs: process.env.ENABLE_MODEL_LOGS !== 'false',
      enableMemoryLogs: process.env.ENABLE_MEMORY_LOGS !== 'false',
      ...config
    }
  }

  private parseLogLevel(level: string): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      'debug': LogLevel.DEBUG,
      'info': LogLevel.INFO,
      'warn': LogLevel.WARN,
      'error': LogLevel.ERROR,
      'silent': LogLevel.SILENT
    }
    return levelMap[level.toLowerCase()] ?? LogLevel.INFO
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level
  }

  private formatMessage(level: LogLevel, category: string, message: string, ...args: any[]): string {
    const parts: string[] = []
    
    // Timestamp
    if (this.config.enableTimestamps) {
      parts.push(`[${new Date().toISOString()}]`)
    }
    
    // Level with emoji
    const levelEmojis = {
      [LogLevel.DEBUG]: '🔍',
      [LogLevel.INFO]: 'ℹ️',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.ERROR]: '❌'
    }
    parts.push(levelEmojis[level] || 'ℹ️')
    
    // Category
    if (this.config.enableCategories && category) {
      parts.push(`[${category}]`)
    }
    
    // Message
    parts.push(message)
    
    // Additional arguments
    if (args.length > 0) {
      parts.push(...args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    }
    
    return parts.join(' ')
  }

  private log(level: LogLevel, category: string, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) return
    
    const formattedMessage = this.formatMessage(level, category, message, ...args)
    
    // Use appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formattedMessage)
        break
      case LogLevel.WARN:
        console.warn(formattedMessage)
        break
      case LogLevel.ERROR:
        console.error(formattedMessage)
        break
    }
  }

  private batchLog(message: string): void {
    this.logBuffer.push(message)
    
    if (this.logBuffer.length >= this.BATCH_SIZE) {
      this.flushBatch()
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.flushBatch(), 100)
    }
  }

  private flushBatch(): void {
    if (this.logBuffer.length > 0) {
      console.log(this.logBuffer.join('\n'))
      this.logBuffer = []
    }
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }
  }

  // Public logging methods
  debug(category: string, message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, category, message, ...args)
  }

  info(category: string, message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, category, message, ...args)
  }

  warn(category: string, message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, category, message, ...args)
  }

  error(category: string, message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, category, message, ...args)
  }

  // Specialized logging methods for streaming
  streamStart(streamId: string, activeCount: number, maxStreams: number): void {
    if (!this.config.enableProgressLogs) return
    this.info('STREAM', `📈 Stream ${streamId} started. Active: ${activeCount}/${maxStreams}`)
  }

  streamEnd(streamId: string, activeCount: number, maxStreams: number): void {
    if (!this.config.enableProgressLogs) return
    this.info('STREAM', `📉 Stream ${streamId} ended. Active: ${activeCount}/${maxStreams}`)
  }

  streamProgress(config: StreamingLogConfig): void {
    if (!this.config.enableProgressLogs) return

    if (!this.shouldLogProgress(config.chunkCount, config.totalExpected)) return

    let message: string

    // Use percentage-based progress for large streams (>100 chunks)
    if (config.totalExpected && config.totalExpected > 100) {
      const percentage = Math.round((config.chunkCount / config.totalExpected) * 100)
      message = `📊 Stream ${config.streamId}: ${percentage}% complete (${config.chunkCount}/${config.totalExpected})`
    } else {
      message = `📊 Stream ${config.streamId}: ${config.chunkCount} chunks processed`
    }

    this.debug('PROGRESS', message)
  }

  streamComplete(config: StreamingLogConfig): void {
    if (!this.config.enableProgressLogs) return

    let message = `✅ Stream completed: ${config.chunkCount} chunks`

    if (config.duration) {
      const durationSec = Math.round(config.duration / 1000)
      const rate = Math.round(config.chunkCount / (config.duration / 1000))
      message += ` in ${durationSec}s (${rate}/sec)`
    }

    if (config.model) {
      message += ` - ${config.model}`
    }

    this.info('STREAM', message)
  }

  endpointAttempt(endpoint: string, status: number): void {
    if (!this.config.enableEndpointLogs) return

    if (status >= 400) {
      this.debug('ENDPOINT', `❌ ${status} for endpoint: ${endpoint}`)
    } else {
      this.debug('ENDPOINT', `Trying endpoint: ${endpoint}`)
    }
  }

  endpointDiscovery(attempts: EndpointAttempt[], successUrl: string): void {
    if (!this.config.enableEndpointLogs) return

    // Only log failed attempts at DEBUG level
    if (this.config.level === LogLevel.DEBUG) {
      const failedAttempts = attempts.filter(a => a.status >= 400)
      if (failedAttempts.length > 0) {
        this.debug('ENDPOINT', `Tried ${failedAttempts.length} endpoint(s), found: ${successUrl}`)
      }
    }

    // Always log successful endpoint at INFO level
    this.info('ENDPOINT', `✅ Using endpoint: ${successUrl}`)
  }

  endpointSuccess(endpoint: string): void {
    if (!this.config.enableEndpointLogs) return
    this.info('ENDPOINT', `✅ Using endpoint: ${endpoint}`)
  }

  modelInfo(streamId: string, model: string, endpoint?: string | null): void {
    if (!this.config.enableModelLogs) return
    
    let message = `🤖 Stream ${streamId} using model: ${model}`
    if (endpoint) {
      message += ` (endpoint: ${endpoint})`
    }
    
    this.info('MODEL', message)
  }

  memoryUsage(heapUsedMB: number, heapTotalMB: number): void {
    if (!this.config.enableMemoryLogs) return
    
    if (heapUsedMB > 1000) {
      this.warn('MEMORY', `⚠️ High memory usage: ${heapUsedMB}MB. Consider restarting the server.`)
    } else if (heapUsedMB > 500) {
      this.info('MEMORY', `🧠 Memory: ${heapUsedMB}MB used / ${heapTotalMB}MB total`)
    } else {
      this.debug('MEMORY', `🧠 Memory: ${heapUsedMB}MB used / ${heapTotalMB}MB total`)
    }
  }

  private shouldLogProgress(chunkCount: number, totalExpected?: number): boolean {
    // Use configured frequency if set
    if (this.config.chunkLogFrequency > 0) {
      return chunkCount % this.config.chunkLogFrequency === 0
    }

    // No progress logging for warn/error levels
    if (this.config.level >= LogLevel.WARN) {
      return false
    }

    // Milestone-based logging
    const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]

    if (this.config.level === LogLevel.DEBUG) {
      // DEBUG: Log key milestones + every 100 chunks for large streams
      if (milestones.includes(chunkCount)) return true
      if (chunkCount > 1000 && chunkCount % 100 === 0) return true

      // For percentage-based progress on large streams
      if (totalExpected && totalExpected > 100) {
        const percentage = Math.round((chunkCount / totalExpected) * 100)
        const percentageMilestones = [25, 50, 75, 90, 95]
        return percentageMilestones.includes(percentage)
      }

      return false
    } else if (this.config.level === LogLevel.INFO) {
      // INFO: Only log milestones ≥100 chunks
      return milestones.filter(m => m >= 100).includes(chunkCount)
    }

    return false
  }

  // Cleanup method
  destroy(): void {
    this.flushBatch()
  }
}

// Singleton instance
export const logger = new Logger()

// Category-specific loggers
export const streamLogger = {
  start: (streamId: string, activeCount: number, maxStreams: number) => 
    logger.streamStart(streamId, activeCount, maxStreams),
  
  end: (streamId: string, activeCount: number, maxStreams: number) => 
    logger.streamEnd(streamId, activeCount, maxStreams),
  
  progress: (config: StreamingLogConfig) => 
    logger.streamProgress(config),
  
  complete: (config: StreamingLogConfig) => 
    logger.streamComplete(config),
  
  error: (streamId: string, error: Error) => 
    logger.error('STREAM', `💥 Stream ${streamId} error: ${error.message}`)
}

export const endpointLogger = {
  attempt: (endpoint: string, status: number) =>
    logger.endpointAttempt(endpoint, status),

  discovery: (attempts: EndpointAttempt[], successUrl: string) =>
    logger.endpointDiscovery(attempts, successUrl),

  success: (endpoint: string) =>
    logger.endpointSuccess(endpoint),

  error: (endpoint: string, error: Error) =>
    logger.error('ENDPOINT', `Network error for ${endpoint}: ${error.message}`)
}

export const modelLogger = {
  info: (streamId: string, model: string, endpoint?: string) => 
    logger.modelInfo(streamId, model, endpoint)
}

export const memoryLogger = {
  usage: (heapUsedMB: number, heapTotalMB: number) => 
    logger.memoryUsage(heapUsedMB, heapTotalMB),
  
  gc: () => 
    logger.info('MEMORY', '🧹 High memory usage detected, triggering GC')
}
