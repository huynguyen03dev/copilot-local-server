/**
 * Centralized Configuration Management System
 * Consolidates all configuration values with environment variable support and validation
 */

import { z } from "zod"

// Configuration Schema Definitions
const ServerConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(8069),
  hostname: z.string().default("127.0.0.1"),
  maxConcurrentStreams: z.number().min(1).default(100),
  requestTimeout: z.number().min(1000).default(300000), // 5 minutes
  keepAliveTimeout: z.number().min(1000).default(65000), // 65 seconds
})

const StreamingConfigSchema = z.object({
  maxBufferSize: z.number().min(1024).default(1048576), // 1MB
  chunkTimeout: z.number().min(1000).default(30000), // 30 seconds
  streamTimeout: z.number().min(1000).default(300000), // 5 minutes
  backpressureThreshold: z.number().min(1024).default(524288), // 512KB
  rateLimitInterval: z.number().min(100).default(1000), // 1 second
})

const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  enableColors: z.boolean().default(true),
  enableTimestamps: z.boolean().default(false),
  enableCategories: z.boolean().default(true),
  chunkLogFrequency: z.number().min(0).default(0), // 0 = adaptive
  enableProgressLogs: z.boolean().default(true),
  enableEndpointLogs: z.boolean().default(true),
  enableModelLogs: z.boolean().default(true),
  enableMemoryLogs: z.boolean().default(true),
})

const SecurityConfigSchema = z.object({
  corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
  corsCredentials: z.boolean().default(false),
  corsMethods: z.array(z.string()).default(['GET', 'POST', 'OPTIONS']),
  corsHeaders: z.array(z.string()).default(['Content-Type', 'Authorization', 'X-Request-ID']),
  enableRateLimit: z.boolean().default(false),
  maxRequestsPerMinute: z.number().min(1).default(100),
  encryptionKey: z.string().optional(),
})

const MonitoringConfigSchema = z.object({
  metricsEnabled: z.boolean().default(true),
  performanceMetrics: z.boolean().default(true),
  memoryCheckInterval: z.number().min(1000).default(30000), // 30 seconds
  connectionMonitorInterval: z.number().min(1000).default(60000), // 1 minute
  memoryThreshold: z.number().min(100).default(500), // 500MB
  enableGarbageCollection: z.boolean().default(false),
})

const PerformanceConfigSchema = z.object({
  enableCompression: z.boolean().default(false),
  cacheHeaders: z.boolean().default(false),
  maxMemoryUsage: z.number().min(100).default(1000), // 1GB
  gcThreshold: z.number().min(0.1).max(1.0).default(0.8), // 80%
  enableEndpointCache: z.boolean().default(true),
  enableTokenCache: z.boolean().default(true),
  enableConnectionPooling: z.boolean().default(true),
})

// Main Configuration Schema
const ConfigSchema = z.object({
  server: ServerConfigSchema,
  streaming: StreamingConfigSchema,
  logging: LoggingConfigSchema,
  security: SecurityConfigSchema,
  monitoring: MonitoringConfigSchema,
  performance: PerformanceConfigSchema,
  environment: z.enum(['development', 'production', 'test']).default('development'),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Parse and validate environment variables
 */
function parseEnvironmentConfig(): Config {
  const env = process.env

  // Helper function to parse comma-separated strings
  const parseArray = (value?: string, defaultValue: string[] = []): string[] => {
    if (!value) return defaultValue
    // Handle wildcard case
    if (value === '*') return ['*']
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }

  // Helper function to parse boolean values
  const parseBoolean = (value?: string, defaultValue: boolean = false): boolean => {
    if (value === undefined) return defaultValue
    return value.toLowerCase() === 'true'
  }

  // Helper function to parse integers with validation
  const parseInteger = (value?: string, defaultValue: number = 0): number => {
    if (!value) return defaultValue
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? defaultValue : parsed
  }

  const rawConfig = {
    server: {
      port: parseInteger(env.PORT, 8069),
      hostname: env.HOSTNAME || "127.0.0.1",
      maxConcurrentStreams: parseInteger(env.MAX_STREAMS, 100),
      requestTimeout: parseInteger(env.REQUEST_TIMEOUT, 300000),
      keepAliveTimeout: parseInteger(env.KEEP_ALIVE_TIMEOUT, 65000),
    },
    streaming: {
      maxBufferSize: parseInteger(env.MAX_BUFFER_SIZE, 1048576),
      chunkTimeout: parseInteger(env.CHUNK_TIMEOUT, 30000),
      streamTimeout: parseInteger(env.STREAM_TIMEOUT, 300000),
      backpressureThreshold: parseInteger(env.BACKPRESSURE_THRESHOLD, 524288),
      rateLimitInterval: parseInteger(env.RATE_LIMIT_INTERVAL, 1000),
    },
    logging: {
      level: (env.LOG_LEVEL as any) || 'info',
      enableColors: parseBoolean(env.LOG_COLORS, true),
      enableTimestamps: parseBoolean(env.LOG_TIMESTAMPS, false),
      enableCategories: parseBoolean(env.LOG_CATEGORIES, true),
      chunkLogFrequency: parseInteger(env.CHUNK_LOG_FREQUENCY, 0),
      enableProgressLogs: parseBoolean(env.ENABLE_PROGRESS_LOGS, true),
      enableEndpointLogs: parseBoolean(env.ENABLE_ENDPOINT_LOGS, true),
      enableModelLogs: parseBoolean(env.ENABLE_MODEL_LOGS, true),
      enableMemoryLogs: parseBoolean(env.ENABLE_MEMORY_LOGS, true),
    },
    security: {
      corsOrigins: parseArray(env.ALLOWED_ORIGINS, ['http://localhost:3000']),
      corsCredentials: parseBoolean(env.CORS_CREDENTIALS, false),
      corsMethods: parseArray(env.CORS_METHODS, ['GET', 'POST', 'OPTIONS']),
      corsHeaders: parseArray(env.CORS_HEADERS, ['Content-Type', 'Authorization', 'X-Request-ID']),
      enableRateLimit: parseBoolean(env.ENABLE_RATE_LIMIT, false),
      maxRequestsPerMinute: parseInteger(env.MAX_REQUESTS_PER_MINUTE, 100),
      encryptionKey: env.ENCRYPTION_KEY,
    },
    monitoring: {
      metricsEnabled: parseBoolean(env.METRICS_ENABLED, true),
      performanceMetrics: parseBoolean(env.PERFORMANCE_METRICS, true),
      memoryCheckInterval: parseInteger(env.MEMORY_CHECK_INTERVAL, 30000),
      connectionMonitorInterval: parseInteger(env.CONNECTION_MONITOR_INTERVAL, 60000),
      memoryThreshold: parseInteger(env.MEMORY_THRESHOLD_MB, 500),
      enableGarbageCollection: parseBoolean(env.ENABLE_GC, false),
    },
    performance: {
      enableCompression: parseBoolean(env.ENABLE_COMPRESSION, false),
      cacheHeaders: parseBoolean(env.CACHE_HEADERS, false),
      maxMemoryUsage: parseInteger(env.MAX_MEMORY_MB, 1000),
      gcThreshold: parseFloat(env.GC_THRESHOLD || '0.8'),
      enableEndpointCache: parseBoolean(env.ENABLE_ENDPOINT_CACHE, true),
      enableTokenCache: parseBoolean(env.ENABLE_TOKEN_CACHE, true),
      enableConnectionPooling: parseBoolean(env.ENABLE_CONNECTION_POOLING, true),
    },
    environment: (env.NODE_ENV as any) || 'development',
  }

  return rawConfig
}

/**
 * Validate and create configuration
 */
function createConfig(): Config {
  try {
    const rawConfig = parseEnvironmentConfig()
    const validatedConfig = ConfigSchema.parse(rawConfig)
    
    // Apply environment-specific overrides
    if (validatedConfig.environment === 'production') {
      // Production optimizations
      validatedConfig.server.hostname = validatedConfig.server.hostname === '127.0.0.1' ? '0.0.0.0' : validatedConfig.server.hostname
      validatedConfig.server.maxConcurrentStreams = Math.max(validatedConfig.server.maxConcurrentStreams, 200)
      validatedConfig.streaming.rateLimitInterval = Math.min(validatedConfig.streaming.rateLimitInterval, 500)
      validatedConfig.logging.level = validatedConfig.logging.level === 'debug' ? 'info' : validatedConfig.logging.level
      validatedConfig.monitoring.enableGarbageCollection = true
      validatedConfig.performance.enableCompression = true
      validatedConfig.performance.cacheHeaders = true
    } else if (validatedConfig.environment === 'development') {
      // Development optimizations
      validatedConfig.logging.level = 'debug'
      validatedConfig.monitoring.memoryCheckInterval = Math.min(validatedConfig.monitoring.memoryCheckInterval, 15000)
      validatedConfig.performance.enableCompression = true // Enable compression in development for testing
      validatedConfig.security.enableRateLimit = false
    }

    return validatedConfig
  } catch (error) {
    // Use console.error for configuration errors since logger may not be initialized yet
    console.error('❌ Configuration validation failed:', error)
    console.error('💡 Please check your environment variables and fix any invalid values')
    process.exit(1)
  }
}

/**
 * Global configuration instance
 */
export const config: Config = createConfig()

/**
 * Log configuration on startup (without sensitive data)
 */
export function logConfiguration(): void {
  // Use console.log for configuration logging since logger may not be initialized yet
  console.log('⚙️  Configuration loaded:')
  console.log(`   Environment: ${config.environment}`)
  console.log(`   Server: ${config.server.hostname}:${config.server.port}`)
  console.log(`   Max Streams: ${config.server.maxConcurrentStreams}`)
  console.log(`   Log Level: ${config.logging.level}`)
  console.log(`   CORS Origins: ${config.security.corsOrigins.join(', ')}`)
  console.log(`   Memory Threshold: ${config.monitoring.memoryThreshold}MB`)
  console.log(`   Metrics Enabled: ${config.monitoring.metricsEnabled}`)
  console.log(`   Rate Limiting: ${config.security.enableRateLimit ? 'enabled' : 'disabled'}`)
  console.log(`   Buffer Size: ${Math.round(config.streaming.maxBufferSize / 1024)}KB`)
}

/**
 * Validate configuration values
 */
export function validateConfiguration(): boolean {
  const errors: string[] = []

  // Validate port range
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Invalid port: ${config.server.port} (must be 1-65535)`)
  }

  // Validate memory thresholds
  if (config.monitoring.memoryThreshold > config.performance.maxMemoryUsage) {
    errors.push(`Memory threshold (${config.monitoring.memoryThreshold}MB) cannot exceed max memory usage (${config.performance.maxMemoryUsage}MB)`)
  }

  // Validate CORS origins
  if (config.security.corsOrigins.length === 0) {
    errors.push('At least one CORS origin must be specified')
  }

  // Validate timeouts
  if (config.streaming.chunkTimeout > config.streaming.streamTimeout) {
    errors.push('Chunk timeout cannot exceed stream timeout')
  }

  if (errors.length > 0) {
    // Use console.error for validation errors since logger may not be initialized yet
    console.error('❌ Configuration validation errors:')
    errors.forEach(error => console.error(`   • ${error}`))
    return false
  }

  return true
}

/**
 * Get configuration for specific environment
 */
export function getEnvironmentConfig(env: 'development' | 'production' | 'test'): Partial<Config> {
  const baseConfig = { ...config }
  
  switch (env) {
    case 'production':
      return {
        ...baseConfig,
        server: {
          ...baseConfig.server,
          hostname: '0.0.0.0',
          maxConcurrentStreams: 200,
        },
        logging: {
          ...baseConfig.logging,
          level: 'info',
          enableColors: false,
        },
        monitoring: {
          ...baseConfig.monitoring,
          enableGarbageCollection: true,
        },
        performance: {
          ...baseConfig.performance,
          enableCompression: true,
          cacheHeaders: true,
        }
      }
    case 'test':
      return {
        ...baseConfig,
        server: {
          ...baseConfig.server,
          port: 0, // Random port for testing
          maxConcurrentStreams: 10,
        },
        logging: {
          ...baseConfig.logging,
          level: 'silent',
        },
        monitoring: {
          ...baseConfig.monitoring,
          metricsEnabled: false,
        }
      }
    default:
      return baseConfig
  }
}
