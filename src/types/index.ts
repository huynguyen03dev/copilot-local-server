/**
 * Type definitions and exports
 */

// Export all error types and utilities
export * from "./errors"

// Export all HTTP types and utilities  
export * from "./http"

// Re-export commonly used types for convenience
export type {
  AuthenticationError,
  StreamingError,
  ValidationError,
  NetworkError,
  ConfigurationError,
  ServerError,
  APIErrorType,
  APIErrorResponse
} from "./errors"

export type {
  HTTPMethod,
  HTTPStatusCode,
  ContentType,
  UserAgent
} from "./http"
