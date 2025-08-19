/**
 * Production configuration for GitHub Copilot API Server
 * Optimized for performance, monitoring, and reliability
 */

export interface ProductionConfig {
  server: {
    port: number
    hostname: string
    maxConcurrentStreams: number
    requestTimeout: number
    keepAliveTimeout: number
  }
  
  streaming: {
    maxBufferSize: number
    chunkTimeout: number
    streamTimeout: number
    backpressureThreshold: number
    rateLimitInterval: number
  }
  
  monitoring: {
    metricsEnabled: boolean
    memoryCheckInterval: number
    connectionMonitorInterval: number
    logLevel: 'debug' | 'info' | 'warn' | 'error'
    enablePerformanceMetrics: boolean
  }
  
  security: {
    enableCors: boolean
    allowedOrigins: string[]
    enableRateLimit: boolean
    maxRequestsPerMinute: number
  }
  
  performance: {
    enableGarbageCollection: boolean
    memoryThresholdMB: number
    enableCompression: boolean
    cacheHeaders: boolean
  }
}

/**
 * Default production configuration
 */
export const defaultProductionConfig: ProductionConfig = {
  server: {
    port: parseInt(process.env.PORT || "8069"),
    hostname: process.env.HOSTNAME || "0.0.0.0", // Bind to all interfaces in production
    maxConcurrentStreams: parseInt(process.env.MAX_STREAMS || "200"), // Increased for production
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || "300000"), // 5 minutes
    keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT || "65000"), // 65 seconds
  },
  
  streaming: {
    maxBufferSize: parseInt(process.env.MAX_BUFFER_SIZE || "2097152"), // 2MB for production
    chunkTimeout: parseInt(process.env.CHUNK_TIMEOUT || "30000"), // 30 seconds
    streamTimeout: parseInt(process.env.STREAM_TIMEOUT || "600000"), // 10 minutes
    backpressureThreshold: parseInt(process.env.BACKPRESSURE_THRESHOLD || "1048576"), // 1MB
    rateLimitInterval: parseInt(process.env.RATE_LIMIT_INTERVAL || "500"), // 500ms for production
  },
  
  monitoring: {
    metricsEnabled: process.env.METRICS_ENABLED !== "false",
    memoryCheckInterval: parseInt(process.env.MEMORY_CHECK_INTERVAL || "30000"), // 30 seconds
    connectionMonitorInterval: parseInt(process.env.CONNECTION_MONITOR_INTERVAL || "60000"), // 1 minute
    logLevel: (process.env.LOG_LEVEL as any) || "info",
    enablePerformanceMetrics: process.env.PERFORMANCE_METRICS !== "false",
  },
  
  security: {
    enableCors: process.env.ENABLE_CORS !== "false",
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || ["*"],
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== "false",
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || "100"),
  },
  
  performance: {
    enableGarbageCollection: process.env.ENABLE_GC !== "false",
    memoryThresholdMB: parseInt(process.env.MEMORY_THRESHOLD_MB || "1000"), // 1GB
    enableCompression: process.env.ENABLE_COMPRESSION !== "false", // Default to true for better performance
    cacheHeaders: process.env.CACHE_HEADERS !== "false", // Default to true for better client-side caching
  }
}

/**
 * Development configuration (optimized for debugging)
 */
export const developmentConfig: ProductionConfig = {
  ...defaultProductionConfig,
  server: {
    ...defaultProductionConfig.server,
    hostname: "127.0.0.1", // Localhost only for development
    maxConcurrentStreams: 50, // Lower limit for development
  },
  streaming: {
    ...defaultProductionConfig.streaming,
    rateLimitInterval: 1000, // More restrictive for development
  },
  monitoring: {
    ...defaultProductionConfig.monitoring,
    logLevel: "debug",
    connectionMonitorInterval: 30000, // More frequent monitoring
  },
  performance: {
    ...defaultProductionConfig.performance,
    memoryThresholdMB: 500, // Lower threshold for development
  }
}

/**
 * Get configuration based on environment
 */
export function getConfig(): ProductionConfig {
  const env = process.env.NODE_ENV || "development"
  
  switch (env) {
    case "production":
      return defaultProductionConfig
    case "development":
    case "dev":
      return developmentConfig
    default:
      console.warn(`Unknown environment: ${env}, using development config`)
      return developmentConfig
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: ProductionConfig): string[] {
  const errors: string[] = []
  
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push("Server port must be between 1 and 65535")
  }
  
  if (config.server.maxConcurrentStreams < 1) {
    errors.push("Max concurrent streams must be at least 1")
  }
  
  if (config.streaming.maxBufferSize < 1024) {
    errors.push("Max buffer size must be at least 1KB")
  }
  
  if (config.streaming.chunkTimeout < 1000) {
    errors.push("Chunk timeout must be at least 1 second")
  }
  
  if (config.performance.memoryThresholdMB < 100) {
    errors.push("Memory threshold must be at least 100MB")
  }
  
  return errors
}

/**
 * Log configuration on startup
 */
export function logConfig(config: ProductionConfig): void {
  console.log("🔧 Production Configuration:")
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`   Server: ${config.server.hostname}:${config.server.port}`)
  console.log(`   Max Streams: ${config.server.maxConcurrentStreams}`)
  console.log(`   Buffer Size: ${config.streaming.maxBufferSize} bytes`)
  console.log(`   Rate Limit: ${config.streaming.rateLimitInterval}ms`)
  console.log(`   Log Level: ${config.monitoring.logLevel}`)
  console.log(`   Memory Threshold: ${config.performance.memoryThresholdMB}MB`)
  console.log(`   CORS: ${config.security.enableCors ? "enabled" : "disabled"}`)
  console.log(`   Metrics: ${config.monitoring.metricsEnabled ? "enabled" : "disabled"}`)
}
