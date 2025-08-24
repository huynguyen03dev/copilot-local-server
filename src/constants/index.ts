/**
 * Centralized Constants for VS Code Copilot API Server
 * Consolidates all magic numbers and configuration values
 */

// Content processing constants
export const CONTENT_CONSTANTS = {
  IMAGE_OVERHEAD_BYTES: 100,
  COMPLEXITY_THRESHOLDS: {
    SIMPLE_SIZE: 5000,
    SIMPLE_BLOCKS: 20,
    COMPLEX_SIZE: 50000,
    COMPLEX_BLOCKS: 100
  }
} as const

// Timeout constants (all in milliseconds)
export const TIMEOUT_CONSTANTS = {
  STREAM_TIMEOUT_MS: 5 * 60 * 1000,      // 5 minutes
  CHUNK_TIMEOUT_MS: 30 * 1000,           // 30 seconds
  REQUEST_TIMEOUT_MS: 300 * 1000,        // 5 minutes (300000ms)
  KEEP_ALIVE_TIMEOUT_MS: 65 * 1000,      // 65 seconds
  CIRCUIT_BREAKER_RECOVERY_MS: 30 * 1000, // 30 seconds
  ENDPOINT_DISCOVERY_TIMEOUT_MS: 15 * 1000, // 15 seconds
  NETWORK_REQUEST_TIMEOUT_MS: 15 * 1000,  // 15 seconds
  MEMORY_CHECK_INTERVAL_MS: 30 * 1000,    // 30 seconds
  CONNECTION_MONITOR_INTERVAL_MS: 60 * 1000, // 1 minute
  PERFORMANCE_DASHBOARD_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  BATCH_TIMEOUT_MS: 1000,                 // 1 second
  RETRY_DELAY_BASE_MS: 1000,              // 1 second base delay
  OPERATION_TIMEOUT_MS: 30 * 1000         // 30 seconds
} as const

// Size constants (all in bytes unless specified)
export const SIZE_CONSTANTS = {
  BYTES_PER_KB: 1024,
  BYTES_PER_MB: 1024 * 1024,
  BYTES_PER_GB: 1024 * 1024 * 1024,
  
  // Buffer sizes
  DEFAULT_BUFFER_SIZE: 1048576,          // 1MB
  CHUNK_BUFFER_SIZE: 64 * 1024,          // 64KB
  STREAMING_BUFFER_SIZE: 524288,         // 512KB
  
  // Request limits
  MAX_REQUEST_SIZE: 10 * 1024 * 1024,    // 10MB
  MAX_REQUEST_SIZE_TEST: 50 * 1024 * 1024, // 50MB for testing
  MAX_STRING_LENGTH: 1024 * 1024,        // 1MB
  MAX_STRING_LENGTH_TEST: 5 * 1024 * 1024, // 5MB for testing
  
  // Thresholds
  BACKPRESSURE_THRESHOLD: 524288,        // 512KB
  LARGE_REQUEST_THRESHOLD: 10000,        // 10KB
  COMPRESSION_THRESHOLD: 1024            // 1KB
} as const

// Performance thresholds
export const PERFORMANCE_CONSTANTS = {
  SLOW_OPERATION_MS: 1000,               // 1 second
  SLOW_VALIDATION_MS: 10,                // 10ms
  SLOW_RESPONSE_MS: 5000,                // 5 seconds
  
  // Memory thresholds (in MB)
  HIGH_MEMORY_MB: 500,
  CRITICAL_MEMORY_MB: 1000,
  MAX_MEMORY_USAGE_MB: 1000,
  GC_THRESHOLD: 0.8,                     // 80%
  
  // Processing limits
  MAX_VALIDATION_NODES: 10000,
  MAX_CONCURRENT_STREAMS_DEFAULT: 100,
  MAX_CONCURRENT_STREAMS_ENHANCED: 150,
  
  // Rate limiting
  RATE_LIMIT_INTERVAL_MS: 1000,          // 1 second
  MAX_REQUESTS_PER_MINUTE: 100,
  
  // Logging frequency
  CHUNK_LOG_FREQUENCY: 10,
  MILESTONE_LOG_FREQUENCY: 5,
  
  // Connection pool
  MAX_CONNECTIONS_PER_ORIGIN: 10,
  MAX_CONCURRENT_REQUESTS: 100,

  // Performance optimization constants
  DEFAULT_CACHE_SIZE: 100,               // Default LRU cache size
  DEFAULT_DEBOUNCE_MS: 300,              // Default debounce delay
  DEFAULT_THROTTLE_MS: 1000,             // Default throttle limit
  DEFAULT_BATCH_SIZE: 50,                // Default batch processing size
  DEFAULT_BATCH_FLUSH_MS: 5000,          // Default batch flush delay
  MEMORY_THRESHOLD_MB: 100,              // Memory usage threshold
  CPU_THRESHOLD_PERCENT: 80              // CPU usage threshold
} as const

// HTTP Status codes
export const HTTP_STATUS = {
  OK: 200,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REQUEST_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const

// Cache configuration constants
export const CACHE_CONSTANTS = {
  DEFAULT_MAX_AGE: 300,                  // 5 minutes
  STATIC_RESOURCE_MAX_AGE: 86400,        // 24 hours
  API_RESPONSE_MAX_AGE: 60,              // 1 minute
  PRODUCTION_DEFAULT_MAX_AGE: 600,       // 10 minutes
  PRODUCTION_STATIC_MAX_AGE: 604800,     // 7 days
  PRODUCTION_API_MAX_AGE: 300,           // 5 minutes
  
  CACHEABLE_CONTENT_TYPES: [
    'application/json',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'text/plain',
    'image/svg+xml'
  ],
  
  NON_CACHEABLE_ENDPOINTS: [
    '/auth/',
    '/metrics',
    '/health'
  ]
} as const

// Circuit breaker constants
export const CIRCUIT_BREAKER_CONSTANTS = {
  DEFAULT_FAILURE_THRESHOLD: 10,
  DEFAULT_SUCCESS_THRESHOLD: 5,
  DEFAULT_RECOVERY_TIMEOUT_MS: 30000,    // 30 seconds
  DEFAULT_REQUEST_TIMEOUT_MS: 30000,     // 30 seconds
  DEFAULT_MONITORING_WINDOW_MS: 60000,   // 1 minute
  
  PRODUCTION_FAILURE_THRESHOLD: 15,
  PRODUCTION_SUCCESS_THRESHOLD: 5,
  PRODUCTION_RECOVERY_TIMEOUT_MS: 60000, // 1 minute
  PRODUCTION_REQUEST_TIMEOUT_MS: 45000,  // 45 seconds
  
  TEST_FAILURE_THRESHOLD: 3,
  TEST_SUCCESS_THRESHOLD: 2,
  TEST_RECOVERY_TIMEOUT_MS: 1000,        // 1 second
  TEST_REQUEST_TIMEOUT_MS: 5000          // 5 seconds
} as const

// JSON validation constants
export const JSON_VALIDATION_CONSTANTS = {
  MAX_JSON_DEPTH: 10,
  MAX_JSON_DEPTH_TEST: 20,
  MAX_ARRAY_LENGTH: 10000,
  MAX_ARRAY_LENGTH_TEST: 50000
} as const

// Endpoint paths
export const ENDPOINT_PATHS = {
  CHAT_COMPLETIONS: '/v1/chat/completions',
  CHAT_COMPLETIONS_NO_V1: '/chat/completions',
  MODELS: '/v1/models',
  AUTH_STATUS: '/auth/status',
  AUTH_START: '/auth/start',
  AUTH_POLL: '/auth/poll',
  AUTH_CLEAR: '/auth/clear',
  AUTH_COMPLETE: '/auth/complete',
  METRICS: '/metrics',
  POOL_METRICS: '/pool/metrics',
  HEALTH: '/',
  CIRCUIT_BREAKER_METRICS: '/circuit-breaker/metrics',
  CIRCUIT_BREAKER_HEALTH: '/circuit-breaker/health',
  CIRCUIT_BREAKER_ADMIN: '/circuit-breaker/admin'
} as const

// Environment types
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test'
} as const

// Log levels
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SILENT: 'silent'
} as const

// Content types
export const CONTENT_TYPES = {
  JSON: 'application/json',
  TEXT: 'text/plain',
  HTML: 'text/html',
  CSS: 'text/css',
  JAVASCRIPT: 'text/javascript',
  APP_JAVASCRIPT: 'application/javascript',
  SVG: 'image/svg+xml'
} as const

// HTTP headers
export const HTTP_HEADERS = {
  AUTHORIZATION: 'Authorization',
  CONTENT_TYPE: 'Content-Type',
  CONTENT_LENGTH: 'Content-Length',
  USER_AGENT: 'User-Agent',
  ACCEPT: 'Accept',
  ACCEPT_ENCODING: 'Accept-Encoding',
  CACHE_CONTROL: 'Cache-Control',
  ETAG: 'ETag',
  IF_NONE_MATCH: 'If-None-Match',
  IF_MODIFIED_SINCE: 'If-Modified-Since',
  LAST_MODIFIED: 'Last-Modified',
  VARY: 'Vary',
  X_REQUEST_ID: 'X-Request-ID',
  X_CORRELATION_ID: 'X-Correlation-ID',
  ALLOW: 'Allow'
} as const

// Error codes
export const ERROR_CODES = {
  // Authentication errors
  AUTH_FAILED: 'AUTH_FAILED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  
  // Request errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  REQUEST_TOO_LARGE: 'REQUEST_TOO_LARGE',
  INVALID_STRUCTURE: 'INVALID_STRUCTURE',
  
  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  REQUEST_FAILED: 'REQUEST_FAILED',
  ENDPOINT_NOT_FOUND: 'ENDPOINT_NOT_FOUND',
  
  // Streaming errors
  STREAM_TIMEOUT: 'STREAM_TIMEOUT',
  STREAM_FAILED: 'STREAM_FAILED',
  MAX_STREAMS_EXCEEDED: 'MAX_STREAMS_EXCEEDED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Circuit breaker
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN'
} as const

// Default configurations for different environments
export const DEFAULT_CONFIGS = {
  DEVELOPMENT: {
    logLevel: LOG_LEVELS.DEBUG,
    enableCompression: true,
    enableRateLimit: false,
    memoryCheckInterval: 15000
  },
  PRODUCTION: {
    logLevel: LOG_LEVELS.INFO,
    enableCompression: true,
    enableRateLimit: true,
    memoryCheckInterval: 30000
  },
  TEST: {
    logLevel: LOG_LEVELS.WARN,
    enableCompression: false,
    enableRateLimit: false,
    memoryCheckInterval: 60000
  }
} as const


