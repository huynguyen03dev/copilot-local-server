/**
 * Comprehensive Error Type Definitions
 * Provides strongly typed error handling throughout the application
 */

import { z } from "zod"

// Base error interface
export interface BaseError {
  code: string
  message: string
  details?: Record<string, unknown>
  timestamp?: number
  correlationId?: string
}

// Authentication-related errors
export interface AuthenticationError extends BaseError {
  code: 'AUTH_FAILED' | 'TOKEN_EXPIRED' | 'INVALID_CREDENTIALS' | 'AUTH_TIMEOUT' | 'REFRESH_FAILED'
}

// Streaming-related errors
export interface StreamingError extends BaseError {
  code: 'STREAM_TIMEOUT' | 'STREAM_ABORTED' | 'STREAM_FAILED' | 'STREAM_OVERFLOW' | 'BACKPRESSURE_EXCEEDED'
  streamId?: string
  chunkCount?: number
}

// Validation errors
export interface ValidationError extends BaseError {
  code: 'INVALID_INPUT' | 'MISSING_FIELD' | 'TYPE_MISMATCH' | 'SCHEMA_VALIDATION_FAILED'
  field?: string
  expectedType?: string
  actualType?: string
}

// Network-related errors
export interface NetworkError extends BaseError {
  code: 'CONNECTION_FAILED' | 'TIMEOUT' | 'DNS_RESOLUTION_FAILED' | 'SSL_ERROR'
  url?: string
  statusCode?: number
}

// Configuration errors
export interface ConfigurationError extends BaseError {
  code: 'INVALID_CONFIG' | 'MISSING_ENV_VAR' | 'CONFIG_VALIDATION_FAILED'
  configKey?: string
  expectedValue?: string
}

// Server errors
export interface ServerError extends BaseError {
  code: 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE' | 'RATE_LIMITED' | 'RESOURCE_EXHAUSTED'
  endpoint?: string
  method?: string
}

// Union type for all possible errors
export type APIErrorType = 
  | AuthenticationError 
  | StreamingError 
  | ValidationError 
  | NetworkError 
  | ConfigurationError 
  | ServerError

// Error response format (OpenAI compatible)
export interface APIErrorResponse {
  error: {
    message: string
    type: string
    code?: string
    param?: string
  }
}

// Alias for backward compatibility
export interface APIError extends APIErrorResponse {}

// Zod schemas for runtime validation
export const BaseErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.number().optional(),
  correlationId: z.string().optional(),
})

export const AuthenticationErrorSchema = BaseErrorSchema.extend({
  code: z.enum(['AUTH_FAILED', 'TOKEN_EXPIRED', 'INVALID_CREDENTIALS', 'AUTH_TIMEOUT', 'REFRESH_FAILED']),
})

export const StreamingErrorSchema = BaseErrorSchema.extend({
  code: z.enum(['STREAM_TIMEOUT', 'STREAM_ABORTED', 'STREAM_FAILED', 'STREAM_OVERFLOW', 'BACKPRESSURE_EXCEEDED']),
  streamId: z.string().optional(),
  chunkCount: z.number().optional(),
})

export const ValidationErrorSchema = BaseErrorSchema.extend({
  code: z.enum(['INVALID_INPUT', 'MISSING_FIELD', 'TYPE_MISMATCH', 'SCHEMA_VALIDATION_FAILED']),
  field: z.string().optional(),
  expectedType: z.string().optional(),
  actualType: z.string().optional(),
})

export const NetworkErrorSchema = BaseErrorSchema.extend({
  code: z.enum(['CONNECTION_FAILED', 'TIMEOUT', 'DNS_RESOLUTION_FAILED', 'SSL_ERROR']),
  url: z.string().optional(),
  statusCode: z.number().optional(),
})

export const ConfigurationErrorSchema = BaseErrorSchema.extend({
  code: z.enum(['INVALID_CONFIG', 'MISSING_ENV_VAR', 'CONFIG_VALIDATION_FAILED']),
  configKey: z.string().optional(),
  expectedValue: z.string().optional(),
})

export const ServerErrorSchema = BaseErrorSchema.extend({
  code: z.enum(['INTERNAL_ERROR', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'RESOURCE_EXHAUSTED']),
  endpoint: z.string().optional(),
  method: z.string().optional(),
})

// Error factory functions for creating typed errors
export class ErrorFactory {
  static authentication(
    code: AuthenticationError['code'], 
    message: string, 
    details?: Record<string, unknown>
  ): AuthenticationError {
    return {
      code,
      message,
      details,
      timestamp: Date.now(),
    }
  }

  static streaming(
    code: StreamingError['code'], 
    message: string, 
    streamId?: string,
    details?: Record<string, unknown>
  ): StreamingError {
    return {
      code,
      message,
      streamId,
      details,
      timestamp: Date.now(),
    }
  }

  static validation(
    code: ValidationError['code'], 
    message: string, 
    field?: string,
    expectedType?: string,
    actualType?: string
  ): ValidationError {
    return {
      code,
      message,
      field,
      expectedType,
      actualType,
      timestamp: Date.now(),
    }
  }

  static network(
    code: NetworkError['code'], 
    message: string, 
    url?: string,
    statusCode?: number
  ): NetworkError {
    return {
      code,
      message,
      url,
      statusCode,
      timestamp: Date.now(),
    }
  }

  static configuration(
    code: ConfigurationError['code'], 
    message: string, 
    configKey?: string,
    expectedValue?: string
  ): ConfigurationError {
    return {
      code,
      message,
      configKey,
      expectedValue,
      timestamp: Date.now(),
    }
  }

  static server(
    code: ServerError['code'], 
    message: string, 
    endpoint?: string,
    method?: string
  ): ServerError {
    return {
      code,
      message,
      endpoint,
      method,
      timestamp: Date.now(),
    }
  }
}

// Utility functions for error handling
export function isAPIError(error: unknown): error is APIErrorType {
  return typeof error === 'object' && 
         error !== null && 
         'code' in error && 
         'message' in error
}

export function toAPIErrorResponse(error: APIErrorType): APIErrorResponse {
  return {
    error: {
      message: error.message,
      type: error.code.toLowerCase().replace(/_/g, '_'),
      code: error.code,
    }
  }
}

/**
 * Create a standardized API error response
 */
export function createAPIErrorResponse(
  message: string,
  type: string,
  code?: string,
  param?: string
): APIErrorResponse {
  return {
    error: {
      message,
      type,
      code,
      param
    }
  }
}

export function formatErrorForLogging(error: APIErrorType): string {
  const parts = [
    `[${error.code}]`,
    error.message
  ]
  
  if (error.details) {
    parts.push(`Details: ${JSON.stringify(error.details)}`)
  }
  
  return parts.join(' ')
}

// Type guards for specific error types
export function isAuthenticationError(error: APIErrorType): error is AuthenticationError {
  return ['AUTH_FAILED', 'TOKEN_EXPIRED', 'INVALID_CREDENTIALS', 'AUTH_TIMEOUT', 'REFRESH_FAILED'].includes(error.code)
}

export function isStreamingError(error: APIErrorType): error is StreamingError {
  return ['STREAM_TIMEOUT', 'STREAM_ABORTED', 'STREAM_FAILED', 'STREAM_OVERFLOW', 'BACKPRESSURE_EXCEEDED'].includes(error.code)
}

export function isValidationError(error: APIErrorType): error is ValidationError {
  return ['INVALID_INPUT', 'MISSING_FIELD', 'TYPE_MISMATCH', 'SCHEMA_VALIDATION_FAILED'].includes(error.code)
}

export function isNetworkError(error: APIErrorType): error is NetworkError {
  return ['CONNECTION_FAILED', 'TIMEOUT', 'DNS_RESOLUTION_FAILED', 'SSL_ERROR'].includes(error.code)
}

export function isConfigurationError(error: APIErrorType): error is ConfigurationError {
  return ['INVALID_CONFIG', 'MISSING_ENV_VAR', 'CONFIG_VALIDATION_FAILED'].includes(error.code)
}

export function isServerError(error: APIErrorType): error is ServerError {
  return ['INTERNAL_ERROR', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'RESOURCE_EXHAUSTED'].includes(error.code)
}
