/**
 * Error Response Builder Utility
 * Provides standardized error response creation across the application
 */

import { 
  HTTP_STATUS, 
  ERROR_CODES, 
  CONTENT_TYPES 
} from '../constants'
import { createAPIErrorResponse } from '../types/errors'
import { logger } from './logger'

export interface ErrorContext {
  correlationId?: string
  userId?: string
  requestId?: string
  endpoint?: string
  method?: string
  userAgent?: string
  timestamp?: string
  [key: string]: unknown
}

export interface ValidationErrorDetail {
  field: string
  message: string
  value?: unknown
  code?: string
}

export interface ErrorResponseOptions {
  context?: ErrorContext
  details?: ValidationErrorDetail[]
  retryAfter?: number
  helpUrl?: string
  requestId?: string
}

/**
 * Standardized error response builder
 */
export class ErrorResponseBuilder {
  /**
   * Create validation error response
   */
  static validation(
    message: string, 
    field?: string, 
    options: ErrorResponseOptions = {}
  ): any {
    const details = field ? [{ field, message }] : options.details || []
    
    const errorResponse = createAPIErrorResponse(
      message,
      "invalid_request_error",
      ERROR_CODES.VALIDATION_ERROR
    )

    if (details.length > 0) {
      errorResponse.error.details = details
    }

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Validation error: ${message}`, {
      field,
      details,
      ...options.context
    })

    return errorResponse
  }

  /**
   * Create authentication error response
   */
  static authentication(
    message: string = "Authentication required", 
    options: ErrorResponseOptions = {}
  ): any {
    const errorResponse = createAPIErrorResponse(
      message,
      "authentication_error",
      ERROR_CODES.UNAUTHENTICATED
    )

    if (options.context) {
      errorResponse.error.context = options.context
    }

    if (options.helpUrl) {
      errorResponse.error.help_url = options.helpUrl
    }

    logger.warn('ERROR_RESPONSE', `Authentication error: ${message}`, options.context)

    return errorResponse
  }

  /**
   * Create authorization error response
   */
  static authorization(
    message: string = "Insufficient permissions", 
    options: ErrorResponseOptions = {}
  ): any {
    const errorResponse = createAPIErrorResponse(
      message,
      "permission_error",
      ERROR_CODES.AUTH_FAILED
    )

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Authorization error: ${message}`, options.context)

    return errorResponse
  }

  /**
   * Create rate limit error response
   */
  static rateLimit(
    retryAfter: number = 60, 
    options: ErrorResponseOptions = {}
  ): any {
    const errorResponse = createAPIErrorResponse(
      `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      "rate_limit_error",
      ERROR_CODES.RATE_LIMIT_EXCEEDED
    )

    errorResponse.error.retry_after = retryAfter

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Rate limit exceeded`, {
      retryAfter,
      ...options.context
    })

    return errorResponse
  }

  /**
   * Create request too large error response
   */
  static requestTooLarge(
    actualSize: number, 
    maxSize: number, 
    options: ErrorResponseOptions = {}
  ): any {
    const message = `Request body too large: ${this.formatBytes(actualSize)} (max: ${this.formatBytes(maxSize)})`
    
    const errorResponse = createAPIErrorResponse(
      message,
      "invalid_request_error",
      ERROR_CODES.REQUEST_TOO_LARGE
    )

    errorResponse.error.actual_size = actualSize
    errorResponse.error.max_size = maxSize

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Request too large: ${actualSize} > ${maxSize}`, options.context)

    return errorResponse
  }

  /**
   * Create server error response
   */
  static serverError(
    message: string = "Internal server error", 
    context?: string, 
    options: ErrorResponseOptions = {}
  ): any {
    const errorResponse = createAPIErrorResponse(
      message,
      "internal_error",
      ERROR_CODES.INTERNAL_ERROR
    )

    if (context) {
      errorResponse.error.context_info = context
    }

    if (options.context) {
      errorResponse.error.context = options.context
    }

    if (options.requestId) {
      errorResponse.error.request_id = options.requestId
    }

    logger.error('ERROR_RESPONSE', `Server error: ${message}`, undefined, {
      context,
      ...options.context
    })

    return errorResponse
  }

  /**
   * Create method not allowed error response
   */
  static methodNotAllowed(
    method: string, 
    allowedMethods: string[], 
    options: ErrorResponseOptions = {}
  ): any {
    const message = `Method ${method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`
    
    const errorResponse = createAPIErrorResponse(
      message,
      "invalid_request_error",
      ERROR_CODES.METHOD_NOT_ALLOWED
    )

    errorResponse.error.method = method
    errorResponse.error.allowed_methods = allowedMethods

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Method not allowed: ${method}`, {
      allowedMethods,
      ...options.context
    })

    return errorResponse
  }

  /**
   * Create not found error response
   */
  static notFound(
    resource: string = "Resource", 
    options: ErrorResponseOptions = {}
  ): any {
    const message = `${resource} not found`
    
    const errorResponse = createAPIErrorResponse(
      message,
      "not_found_error",
      ERROR_CODES.ENDPOINT_NOT_FOUND
    )

    errorResponse.error.resource = resource

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Not found: ${resource}`, options.context)

    return errorResponse
  }

  /**
   * Create streaming error response
   */
  static streamingError(
    message: string, 
    streamId?: string, 
    options: ErrorResponseOptions = {}
  ): any {
    const errorResponse = createAPIErrorResponse(
      message,
      "streaming_error",
      ERROR_CODES.STREAM_FAILED
    )

    if (streamId) {
      errorResponse.error.stream_id = streamId
    }

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.error('ERROR_RESPONSE', `Streaming error: ${message}`, undefined, {
      streamId,
      ...options.context
    })

    return errorResponse
  }

  /**
   * Create circuit breaker error response
   */
  static circuitBreakerOpen(
    service: string, 
    options: ErrorResponseOptions = {}
  ): any {
    const message = `Service ${service} is temporarily unavailable`
    
    const errorResponse = createAPIErrorResponse(
      message,
      "service_unavailable_error",
      ERROR_CODES.CIRCUIT_BREAKER_OPEN
    )

    errorResponse.error.service = service
    errorResponse.error.retry_after = options.retryAfter || 30

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Circuit breaker open for ${service}`, options.context)

    return errorResponse
  }

  /**
   * Create timeout error response
   */
  static timeout(
    operation: string, 
    timeoutMs: number, 
    options: ErrorResponseOptions = {}
  ): any {
    const message = `Operation ${operation} timed out after ${timeoutMs}ms`
    
    const errorResponse = createAPIErrorResponse(
      message,
      "timeout_error",
      ERROR_CODES.STREAM_TIMEOUT
    )

    errorResponse.error.operation = operation
    errorResponse.error.timeout_ms = timeoutMs

    if (options.context) {
      errorResponse.error.context = options.context
    }

    logger.warn('ERROR_RESPONSE', `Timeout: ${operation} (${timeoutMs}ms)`, options.context)

    return errorResponse
  }

  /**
   * Format bytes in human-readable format
   */
  private static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${Math.round(size * 100) / 100}${units[unitIndex]}`
  }

  /**
   * Create error response with proper HTTP status code
   */
  static createWithStatus(
    message: string,
    statusCode: number,
    errorType: string = "error",
    errorCode: string = "UNKNOWN_ERROR",
    options: ErrorResponseOptions = {}
  ): { response: any; statusCode: number } {
    const errorResponse = createAPIErrorResponse(message, errorType, errorCode)

    if (options.context) {
      errorResponse.error.context = options.context
    }

    if (options.requestId) {
      errorResponse.error.request_id = options.requestId
    }

    return {
      response: errorResponse,
      statusCode
    }
  }

  /**
   * Extract error context from request
   */
  static extractContext(c: any): ErrorContext {
    return {
      correlationId: c.get?.('correlationId'),
      requestId: c.get?.('requestId'),
      method: c.req?.method,
      endpoint: c.req?.path,
      userAgent: c.req?.header?.('user-agent'),
      timestamp: new Date().toISOString()
    }
  }
}
