/**
 * Request Correlation Middleware
 * Adds correlation IDs to requests for distributed tracing and logging
 */

import { Context, Next } from 'hono'
import { logger } from '../utils/logger'
import { randomUUID } from 'crypto'

/**
 * Correlation ID middleware that:
 * 1. Extracts or generates a correlation ID for each request
 * 2. Sets it in the logger for structured logging
 * 3. Adds it to response headers for client tracking
 * 4. Provides it in the request context for use in handlers
 */
export async function correlationMiddleware(c: Context, next: Next) {
  // Extract correlation ID from request headers or generate a new one
  const correlationId = c.req.header('X-Request-ID') || 
                       c.req.header('X-Correlation-ID') || 
                       randomUUID()

  // Set correlation ID in context for use in handlers
  c.set('correlationId', correlationId)
  
  // Set correlation ID in response headers
  c.res.headers.set('X-Request-ID', correlationId)
  c.res.headers.set('X-Correlation-ID', correlationId)
  
  // Set correlation ID in logger for structured logging
  logger.setCorrelationId(correlationId)
  
  // Log request start
  const requestInfo = {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('User-Agent'),
    contentType: c.req.header('Content-Type'),
    correlationId
  }
  logger.info('REQUEST', `${c.req.method} ${c.req.path}`, requestInfo)

  const startTime = Date.now()

  try {
    // Process the request
    await next()
    
    // Log successful request completion
    const duration = Date.now() - startTime
    const completionInfo = {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: `${duration}ms`,
      correlationId
    }
    logger.info('REQUEST', `${c.req.method} ${c.req.path} completed`, completionInfo)
    
  } catch (error) {
    // Log request error
    const duration = Date.now() - startTime
    const errorInfo = {
      method: c.req.method,
      path: c.req.path,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
      correlationId
    }
    logger.error('REQUEST', `${c.req.method} ${c.req.path} failed`, errorInfo)
    
    // Re-throw the error to be handled by other middleware
    throw error
    
  } finally {
    // Clear correlation ID from logger to prevent leakage to other requests
    logger.setCorrelationId(null)
  }
}

/**
 * Get correlation ID from request context
 */
export function getCorrelationId(c: Context): string | undefined {
  return c.get('correlationId')
}

/**
 * Create a child logger with correlation ID for specific operations
 */
export function createCorrelatedLogger(correlationId: string) {
  return {
    debug: (category: string, message: string, ...args: unknown[]) => {
      const originalId = logger.getCorrelationId()
      logger.setCorrelationId(correlationId)
      logger.debug(category, message, ...args)
      logger.setCorrelationId(originalId)
    },
    info: (category: string, message: string, ...args: unknown[]) => {
      const originalId = logger.getCorrelationId()
      logger.setCorrelationId(correlationId)
      logger.info(category, message, ...args)
      logger.setCorrelationId(originalId)
    },
    warn: (category: string, message: string, ...args: unknown[]) => {
      const originalId = logger.getCorrelationId()
      logger.setCorrelationId(correlationId)
      logger.warn(category, message, ...args)
      logger.setCorrelationId(originalId)
    },
    error: (category: string, message: string, ...args: unknown[]) => {
      const originalId = logger.getCorrelationId()
      logger.setCorrelationId(correlationId)
      logger.error(category, message, ...args)
      logger.setCorrelationId(originalId)
    }
  }
}

/**
 * Middleware for async operations that need to maintain correlation context
 */
export function withCorrelation<T>(correlationId: string, operation: () => Promise<T>): Promise<T> {
  return new Promise(async (resolve, reject) => {
    const originalId = logger.getCorrelationId()
    
    try {
      logger.setCorrelationId(correlationId)
      const result = await operation()
      resolve(result)
    } catch (error) {
      reject(error)
    } finally {
      logger.setCorrelationId(originalId)
    }
  })
}

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return randomUUID()
}
