/**
 * Error Boundary Utility
 * Provides comprehensive error handling boundaries for critical operations
 */

import { logger } from './logger'
import { 
  APIErrorType, 
  ErrorFactory, 
  isAPIError, 
  formatErrorForLogging,
  type StreamingError,
  type NetworkError,
  type ValidationError 
} from '../types/errors'

/**
 * Error boundary configuration
 */
export interface ErrorBoundaryConfig {
  retryAttempts?: number
  retryDelay?: number
  timeoutMs?: number
  enableFallback?: boolean
  logErrors?: boolean
  category?: string
}

/**
 * Default error boundary configuration
 */
const DEFAULT_CONFIG: Required<ErrorBoundaryConfig> = {
  retryAttempts: 0,
  retryDelay: 1000,
  timeoutMs: 30000,
  enableFallback: true,
  logErrors: true,
  category: 'ERROR_BOUNDARY'
}

/**
 * Error boundary result
 */
export interface ErrorBoundaryResult<T> {
  success: boolean
  data?: T
  error?: APIErrorType
  attempts: number
  duration: number
}

/**
 * Main error boundary class
 */
export class ErrorBoundary {
  /**
   * Handle async operations with comprehensive error boundaries
   */
  static async handleAsync<T>(
    operation: () => Promise<T>,
    context: string,
    config: ErrorBoundaryConfig = {},
    fallback?: () => Promise<T>
  ): Promise<ErrorBoundaryResult<T>> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }
    const startTime = Date.now()
    let lastError: APIErrorType | undefined
    
    for (let attempt = 1; attempt <= finalConfig.retryAttempts + 1; attempt++) {
      try {
        // Set up timeout if specified
        const timeoutPromise = finalConfig.timeoutMs > 0 
          ? new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Operation timeout')), finalConfig.timeoutMs)
            )
          : null

        // Execute operation with optional timeout
        const result = timeoutPromise 
          ? await Promise.race([operation(), timeoutPromise])
          : await operation()

        // Success - log and return
        if (finalConfig.logErrors && attempt > 1) {
          logger.info(finalConfig.category, `${context} succeeded on attempt ${attempt}`)
        }

        return {
          success: true,
          data: result,
          attempts: attempt,
          duration: Date.now() - startTime
        }

      } catch (error) {
        // Convert error to typed error
        const typedError = this.convertToTypedError(error, context)
        lastError = typedError

        // Log error
        if (finalConfig.logErrors) {
          const errorMsg = formatErrorForLogging(typedError)
          if (attempt <= finalConfig.retryAttempts) {
            logger.warn(finalConfig.category, `${context} failed (attempt ${attempt}/${finalConfig.retryAttempts + 1}): ${errorMsg}`)
          } else {
            logger.error(finalConfig.category, `${context} failed after ${attempt} attempts: ${errorMsg}`)
          }
        }

        // If this is not the last attempt, wait and retry
        if (attempt <= finalConfig.retryAttempts) {
          await this.delay(finalConfig.retryDelay * attempt) // Exponential backoff
          continue
        }

        // Last attempt failed - try fallback
        if (finalConfig.enableFallback && fallback) {
          try {
            const fallbackResult = await fallback()
            logger.info(finalConfig.category, `${context} fallback succeeded`)
            
            return {
              success: true,
              data: fallbackResult,
              error: typedError,
              attempts: attempt,
              duration: Date.now() - startTime
            }
          } catch (fallbackError) {
            const fallbackTypedError = this.convertToTypedError(fallbackError, `${context}-fallback`)
            if (finalConfig.logErrors) {
              logger.error(finalConfig.category, `${context} fallback failed: ${formatErrorForLogging(fallbackTypedError)}`)
            }
          }
        }

        // All attempts and fallback failed
        return {
          success: false,
          error: typedError,
          attempts: attempt,
          duration: Date.now() - startTime
        }
      }
    }

    // Should never reach here, but TypeScript requires it
    return {
      success: false,
      error: lastError || ErrorFactory.server('INTERNAL_ERROR', 'Unexpected error boundary state', context),
      attempts: finalConfig.retryAttempts + 1,
      duration: Date.now() - startTime
    }
  }

  /**
   * Handle synchronous operations with error boundaries
   */
  static handleSync<T>(
    operation: () => T,
    context: string,
    config: ErrorBoundaryConfig = {},
    fallback?: () => T
  ): ErrorBoundaryResult<T> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }
    const startTime = Date.now()

    try {
      const result = operation()
      return {
        success: true,
        data: result,
        attempts: 1,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const typedError = this.convertToTypedError(error, context)

      // Log error
      if (finalConfig.logErrors) {
        logger.error(finalConfig.category, `${context} failed: ${formatErrorForLogging(typedError)}`)
      }

      // Try fallback
      if (finalConfig.enableFallback && fallback) {
        try {
          const fallbackResult = fallback()
          logger.info(finalConfig.category, `${context} fallback succeeded`)
          
          return {
            success: true,
            data: fallbackResult,
            error: typedError,
            attempts: 1,
            duration: Date.now() - startTime
          }
        } catch (fallbackError) {
          const fallbackTypedError = this.convertToTypedError(fallbackError, `${context}-fallback`)
          if (finalConfig.logErrors) {
            logger.error(finalConfig.category, `${context} fallback failed: ${formatErrorForLogging(fallbackTypedError)}`)
          }
        }
      }

      return {
        success: false,
        error: typedError,
        attempts: 1,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Convert unknown error to typed error
   */
  private static convertToTypedError(error: unknown, context: string): APIErrorType {
    // If already a typed error, return as-is
    if (isAPIError(error)) {
      return error
    }

    // Handle standard Error objects
    if (error instanceof Error) {
      // Timeout errors
      if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        return ErrorFactory.network('TIMEOUT', error.message, context)
      }

      // Connection errors
      if (error.message.includes('connection') || error.message.includes('ECONNREFUSED')) {
        return ErrorFactory.network('CONNECTION_FAILED', error.message, context)
      }

      // Validation errors (from Zod or similar)
      if (error.name === 'ZodError' || error.message.includes('validation')) {
        return ErrorFactory.validation('SCHEMA_VALIDATION_FAILED', error.message)
      }

      // Generic server error
      return ErrorFactory.server('INTERNAL_ERROR', error.message, context)
    }

    // Handle string errors
    if (typeof error === 'string') {
      return ErrorFactory.server('INTERNAL_ERROR', error, context)
    }

    // Handle unknown errors
    return ErrorFactory.server('INTERNAL_ERROR', 'Unknown error occurred', context)
  }

  /**
   * Delay utility for retries
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Specialized error boundary for streaming operations
 */
export class StreamingErrorBoundary {
  /**
   * Handle streaming operations with specialized error recovery
   */
  static async handleStreamingOperation<T>(
    operation: () => Promise<T>,
    streamId: string,
    config: ErrorBoundaryConfig = {}
  ): Promise<ErrorBoundaryResult<T>> {
    const streamingConfig: ErrorBoundaryConfig = {
      retryAttempts: 2,
      retryDelay: 500,
      timeoutMs: 30000,
      enableFallback: false,
      logErrors: true,
      category: 'STREAMING',
      ...config
    }

    return ErrorBoundary.handleAsync(
      operation,
      `streaming-${streamId}`,
      streamingConfig
    )
  }

  /**
   * Handle stream chunk processing with error recovery
   */
  static handleChunkProcessing<T>(
    operation: () => T,
    streamId: string,
    chunkIndex: number
  ): ErrorBoundaryResult<T> {
    return ErrorBoundary.handleSync(
      operation,
      `chunk-${streamId}-${chunkIndex}`,
      {
        enableFallback: false,
        logErrors: true,
        category: 'STREAMING'
      }
    )
  }

  /**
   * Create a streaming error with context
   */
  static createStreamingError(
    code: StreamingError['code'],
    message: string,
    streamId: string,
    chunkCount?: number
  ): StreamingError {
    return ErrorFactory.streaming(code, message, streamId, { chunkCount })
  }
}

/**
 * Specialized error boundary for network operations
 */
export class NetworkErrorBoundary {
  /**
   * Handle HTTP requests with network-specific error recovery
   */
  static async handleRequest<T>(
    operation: () => Promise<T>,
    url: string,
    config: ErrorBoundaryConfig = {}
  ): Promise<ErrorBoundaryResult<T>> {
    const networkConfig: ErrorBoundaryConfig = {
      retryAttempts: 3,
      retryDelay: 1000,
      timeoutMs: 10000,
      enableFallback: false,
      logErrors: true,
      category: 'NETWORK',
      ...config
    }

    return ErrorBoundary.handleAsync(
      operation,
      `request-${url}`,
      networkConfig
    )
  }
}

/**
 * Specialized error boundary for authentication operations
 */
export class AuthErrorBoundary {
  /**
   * Handle authentication operations with auth-specific error recovery
   */
  static async handleAuthOperation<T>(
    operation: () => Promise<T>,
    operationType: string,
    config: ErrorBoundaryConfig = {}
  ): Promise<ErrorBoundaryResult<T>> {
    const authConfig: ErrorBoundaryConfig = {
      retryAttempts: 1,
      retryDelay: 2000,
      timeoutMs: 15000,
      enableFallback: false,
      logErrors: true,
      category: 'AUTH',
      ...config
    }

    return ErrorBoundary.handleAsync(
      operation,
      `auth-${operationType}`,
      authConfig
    )
  }
}
