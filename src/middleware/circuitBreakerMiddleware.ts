/**
 * Circuit Breaker Middleware
 * Provides circuit breaker protection for HTTP endpoints
 */

import { Context, Next } from "hono"
import { 
  getCircuitBreakerManager,
  CircuitBreakerConfig 
} from "../utils/circuitBreakerManager"
import { logger } from "../utils/logger"
import { getAsyncLogger } from "../utils/asyncLogger"

export interface CircuitBreakerMiddlewareConfig {
  enableForAllEndpoints: boolean
  enableForSpecificEndpoints: string[]
  disableForEndpoints: string[]
  defaultConfig: Partial<CircuitBreakerConfig>
  endpointConfigs: Record<string, Partial<CircuitBreakerConfig>>
  enableMetricsEndpoint: boolean
  metricsEndpointPath: string
}

/**
 * Circuit breaker middleware for endpoint protection
 */
export function circuitBreakerMiddleware(config: Partial<CircuitBreakerMiddlewareConfig> = {}) {
  const finalConfig: CircuitBreakerMiddlewareConfig = {
    enableForAllEndpoints: false,
    enableForSpecificEndpoints: ['/v1/chat/completions'],
    disableForEndpoints: ['/auth/status', '/metrics', '/health'],
    defaultConfig: {
      failureThreshold: 10,
      recoveryTimeout: 30000,
      successThreshold: 5,
      timeout: 30000
    },
    endpointConfigs: {
      '/v1/chat/completions': {
        failureThreshold: 15,
        recoveryTimeout: 60000,
        timeout: 45000
      }
    },
    enableMetricsEndpoint: true,
    metricsEndpointPath: '/circuit-breaker/metrics',
    ...config
  }

  return async (c: Context, next: Next) => {
    const path = c.req.path
    const method = c.req.method

    // Check if circuit breaker should be applied
    if (!shouldApplyCircuitBreaker(path, method, finalConfig)) {
      return next()
    }

    // Handle metrics endpoint
    if (finalConfig.enableMetricsEndpoint && path === finalConfig.metricsEndpointPath) {
      return handleMetricsEndpoint(c)
    }

    // Apply circuit breaker protection
    const circuitBreakerName = `endpoint-${method}-${path}`
    const endpointConfig = finalConfig.endpointConfigs[path] || finalConfig.defaultConfig
    
    const manager = getCircuitBreakerManager()
    
    try {
      await manager.execute(
        circuitBreakerName,
        async () => {
          await next()
          
          // Check if response indicates failure
          if (c.res.status >= 500) {
            throw new Error(`Server error: ${c.res.status}`)
          }
        },
        endpointConfig,
        {
          path,
          method,
          userAgent: c.req.header('user-agent'),
          correlationId: c.get('correlationId')
        }
      )
    } catch (error) {
      // Handle circuit breaker errors
      await handleCircuitBreakerError(c, error as Error, circuitBreakerName)
    }
  }
}

/**
 * Check if circuit breaker should be applied to endpoint
 */
function shouldApplyCircuitBreaker(
  path: string, 
  method: string, 
  config: CircuitBreakerMiddlewareConfig
): boolean {
  // Check disabled endpoints
  if (config.disableForEndpoints.includes(path)) {
    return false
  }

  // Check if enabled for all endpoints
  if (config.enableForAllEndpoints) {
    return true
  }

  // Check specific enabled endpoints
  return config.enableForSpecificEndpoints.includes(path)
}

/**
 * Handle circuit breaker metrics endpoint
 */
async function handleMetricsEndpoint(c: Context) {
  try {
    const manager = getCircuitBreakerManager()
    const metrics = manager.getGlobalMetrics()
    const healthReport = manager.generateHealthReport()

    const response = {
      timestamp: new Date().toISOString(),
      globalMetrics: metrics,
      healthReport,
      circuitBreakers: Object.entries(metrics.circuitBreakers).map(([name, cbMetrics]) => ({
        name,
        state: cbMetrics.state,
        failureCount: cbMetrics.failureCount,
        successCount: cbMetrics.successCount,
        totalRequests: cbMetrics.totalRequests,
        failureRate: cbMetrics.failureRate,
        averageResponseTime: cbMetrics.averageResponseTime,
        timeInCurrentState: cbMetrics.timeInCurrentState
      }))
    }

    return c.json(response)
  } catch (error) {
    logger.error('CIRCUIT_BREAKER_MIDDLEWARE', `Metrics endpoint error: ${error}`)
    return c.json({ error: 'Failed to retrieve circuit breaker metrics' }, 500)
  }
}

/**
 * Handle circuit breaker errors
 */
async function handleCircuitBreakerError(
  c: Context, 
  error: Error, 
  circuitBreakerName: string
): Promise<Response> {
  const asyncLogger = getAsyncLogger()
  
  // Log the circuit breaker error
  await asyncLogger.errorAsync(
    error,
    'CIRCUIT_BREAKER_MIDDLEWARE',
    { correlationId: c.get('correlationId') },
    {
      circuitBreakerName,
      path: c.req.path,
      method: c.req.method,
      userAgent: c.req.header('user-agent')
    }
  )

  // Check if it's a circuit breaker open error
  if (error.message.includes('Circuit breaker is OPEN')) {
    return c.json({
      error: 'Service temporarily unavailable',
      message: 'The service is currently experiencing issues. Please try again later.',
      code: 'CIRCUIT_BREAKER_OPEN',
      retryAfter: 30 // seconds
    }, 503)
  }

  // Check if it's a timeout error
  if (error.message.includes('timeout')) {
    return c.json({
      error: 'Request timeout',
      message: 'The request took too long to complete. Please try again.',
      code: 'REQUEST_TIMEOUT'
    }, 408)
  }

  // Generic server error
  return c.json({
    error: 'Internal server error',
    message: 'An unexpected error occurred. Please try again later.',
    code: 'INTERNAL_ERROR'
  }, 500)
}

/**
 * Circuit breaker health check middleware
 */
export function circuitBreakerHealthMiddleware() {
  return async (c: Context, next: Next) => {
    if (c.req.path === '/health/circuit-breakers') {
      try {
        const manager = getCircuitBreakerManager()
        const healthReport = manager.generateHealthReport()

        const response = {
          timestamp: new Date().toISOString(),
          healthy: healthReport.healthy,
          summary: {
            totalCircuitBreakers: healthReport.summary.totalCircuitBreakers,
            openCircuitBreakers: healthReport.summary.openCircuitBreakers,
            halfOpenCircuitBreakers: healthReport.summary.halfOpenCircuitBreakers,
            closedCircuitBreakers: healthReport.summary.closedCircuitBreakers,
            globalFailureRate: healthReport.summary.globalFailureRate
          },
          issues: healthReport.issues,
          recommendations: healthReport.recommendations
        }

        const statusCode = healthReport.healthy ? 200 : 503
        return c.json(response, statusCode)
      } catch (error) {
        logger.error('CIRCUIT_BREAKER_HEALTH', `Health check error: ${error}`)
        return c.json({
          timestamp: new Date().toISOString(),
          healthy: false,
          error: 'Failed to check circuit breaker health'
        }, 500)
      }
    }

    return next()
  }
}

/**
 * Circuit breaker admin middleware for management operations
 */
export function circuitBreakerAdminMiddleware() {
  return async (c: Context, next: Next) => {
    const path = c.req.path
    const method = c.req.method

    // Handle circuit breaker admin operations
    if (path.startsWith('/admin/circuit-breakers')) {
      const manager = getCircuitBreakerManager()

      try {
        // List all circuit breakers
        if (method === 'GET' && path === '/admin/circuit-breakers') {
          const names = manager.getCircuitBreakerNames()
          const metrics = manager.getGlobalMetrics()
          
          return c.json({
            circuitBreakers: names,
            globalMetrics: metrics
          })
        }

        // Reset specific circuit breaker
        if (method === 'POST' && path.match(/^\/admin\/circuit-breakers\/(.+)\/reset$/)) {
          const name = path.split('/')[3]
          const success = manager.resetCircuitBreaker(name)
          
          if (success) {
            return c.json({ message: `Circuit breaker ${name} reset successfully` })
          } else {
            return c.json({ error: `Circuit breaker ${name} not found` }, 404)
          }
        }

        // Reset all circuit breakers
        if (method === 'POST' && path === '/admin/circuit-breakers/reset-all') {
          manager.resetAllCircuitBreakers()
          return c.json({ message: 'All circuit breakers reset successfully' })
        }

        // Get specific circuit breaker details
        if (method === 'GET' && path.match(/^\/admin\/circuit-breakers\/(.+)$/)) {
          const name = path.split('/')[3]
          const circuitBreaker = manager.getCircuitBreakerByName(name)
          
          if (circuitBreaker) {
            const metrics = circuitBreaker.getMetrics()
            return c.json({
              name,
              metrics,
              state: circuitBreaker.getState()
            })
          } else {
            return c.json({ error: `Circuit breaker ${name} not found` }, 404)
          }
        }

        return c.json({ error: 'Invalid admin operation' }, 400)
      } catch (error) {
        logger.error('CIRCUIT_BREAKER_ADMIN', `Admin operation error: ${error}`)
        return c.json({ error: 'Admin operation failed' }, 500)
      }
    }

    return next()
  }
}

/**
 * Default circuit breaker middleware configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_MIDDLEWARE_CONFIG: CircuitBreakerMiddlewareConfig = {
  enableForAllEndpoints: false,
  enableForSpecificEndpoints: ['/v1/chat/completions'],
  disableForEndpoints: ['/auth/status', '/metrics', '/health'],
  defaultConfig: {
    failureThreshold: 10,
    recoveryTimeout: 30000,
    successThreshold: 5,
    timeout: 30000
  },
  endpointConfigs: {},
  enableMetricsEndpoint: true,
  metricsEndpointPath: '/circuit-breaker/metrics'
}

/**
 * Production circuit breaker middleware configuration
 */
export const PRODUCTION_CIRCUIT_BREAKER_MIDDLEWARE_CONFIG: CircuitBreakerMiddlewareConfig = {
  enableForAllEndpoints: false,
  enableForSpecificEndpoints: ['/v1/chat/completions', '/v1/models'],
  disableForEndpoints: ['/auth/status', '/metrics', '/health'],
  defaultConfig: {
    failureThreshold: 15,
    recoveryTimeout: 60000,
    successThreshold: 5,
    timeout: 45000
  },
  endpointConfigs: {
    '/v1/chat/completions': {
      failureThreshold: 20,
      recoveryTimeout: 120000,
      timeout: 60000
    }
  },
  enableMetricsEndpoint: true,
  metricsEndpointPath: '/circuit-breaker/metrics'
}
