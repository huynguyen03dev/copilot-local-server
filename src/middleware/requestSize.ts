/**
 * Request Size Validation Middleware
 * Validates request body size to prevent oversized requests and timeouts
 */

import { Context, Next } from "hono"
import { logger } from "../utils/logger"
import { createAPIErrorResponse } from "../types/errors"

/**
 * Request size limits configuration
 */
export interface RequestSizeLimits {
  maxBodySize: number // Maximum request body size in bytes
  maxJsonDepth: number // Maximum JSON nesting depth
  maxArrayLength: number // Maximum array length
  maxStringLength: number // Maximum string length
}

/**
 * Default request size limits
 */
const DEFAULT_LIMITS: RequestSizeLimits = {
  maxBodySize: 10 * 1024 * 1024, // 10MB
  maxJsonDepth: 10,
  maxArrayLength: 10000,
  maxStringLength: 1024 * 1024 // 1MB
}

/**
 * Request size validation middleware
 */
export function requestSizeMiddleware(limits: Partial<RequestSizeLimits> = {}) {
  const finalLimits = { ...DEFAULT_LIMITS, ...limits }
  
  return async (c: Context, next: Next) => {
    try {
      // Skip validation for non-POST requests to allow proper HTTP method validation
      if (c.req.method !== 'POST') {
        await next()
        return
      }

      // Check Content-Length header first for early rejection
      const contentLength = c.req.header('content-length')
      if (contentLength) {
        const size = parseInt(contentLength, 10)
        if (size > finalLimits.maxBodySize) {
          logger.warn('REQUEST_SIZE', `Request body too large: ${size} bytes (max: ${finalLimits.maxBodySize})`)

          const errorResponse = createAPIErrorResponse(
            `Request body too large. Maximum size is ${Math.round(finalLimits.maxBodySize / 1024 / 1024)}MB`,
            "invalid_request_error",
            "request_too_large"
          )
          return c.json(errorResponse, 413)
        }
      }

      // For JSON requests, validate the parsed content (optimized single-pass)
      if (c.req.header('content-type')?.includes('application/json')) {
        try {
          // Check if streaming validation already processed this request
          const streamingValidatedBody = c.get('streamingValidatedBody')

          if (streamingValidatedBody) {
            // Use already validated body from streaming validation
            logger.debug('REQUEST_SIZE', 'Using pre-validated body from streaming validation')
            c.set('parsedBody', streamingValidatedBody)
          } else {
            // Perform single-pass validation and parsing
            const validationResult = await validateAndParseJsonSinglePass(c, finalLimits)

            if (!validationResult.success) {
              return c.json(validationResult.errorResponse, validationResult.statusCode)
            }

            // Store the parsed body for later use
            c.set('parsedBody', validationResult.parsedBody)

            // Store validation metadata
            c.set('requestValidationMetadata', {
              bodySize: validationResult.bodySize,
              parseTime: validationResult.parseTime,
              validationTime: validationResult.validationTime
            })
          }
          
        } catch (error) {
          logger.error('REQUEST_SIZE', `Error validating request size: ${error}`)
          
          const errorResponse = createAPIErrorResponse(
            "Failed to validate request",
            "internal_error",
            "validation_failed"
          )
          return c.json(errorResponse, 500)
        }
      }

      await next()
    } catch (error) {
      logger.error('REQUEST_SIZE', `Request size middleware error: ${error}`)
      
      const errorResponse = createAPIErrorResponse(
        "Internal server error",
        "internal_error",
        "middleware_error"
      )
      return c.json(errorResponse, 500)
    }
  }

/**
 * Single-pass JSON validation and parsing for optimal performance
 */
async function validateAndParseJsonSinglePass(
    c: Context,
    limits: RequestSizeLimits
  ): Promise<{
    success: boolean
    parsedBody?: any
    bodySize?: number
    parseTime?: number
    validationTime?: number
    errorResponse?: any
    statusCode?: number
  }> {
    const startTime = Date.now()

    try {
      // Get the raw body to check size
      const body = await c.req.text()
      const parseTime = Date.now() - startTime

      // Check raw body size
      const bodySize = Buffer.byteLength(body, 'utf8')
      if (bodySize > limits.maxBodySize) {
        logger.warn('REQUEST_SIZE', `Request body too large: ${bodySize} bytes (max: ${limits.maxBodySize})`)

        return {
          success: false,
          errorResponse: createAPIErrorResponse(
            `Request body too large. Maximum size is ${Math.round(limits.maxBodySize / 1024 / 1024)}MB`,
            "invalid_request_error",
            "request_too_large"
          ),
          statusCode: 413
        }
      }

      // Parse JSON with error handling
      let parsedBody: any
      const jsonParseStart = Date.now()

      try {
        parsedBody = JSON.parse(body)
      } catch (parseError) {
        logger.warn('REQUEST_SIZE', `Invalid JSON in request body: ${parseError}`)

        return {
          success: false,
          errorResponse: createAPIErrorResponse(
            "Invalid JSON in request body",
            "invalid_request_error",
            "invalid_json"
          ),
          statusCode: 400
        }
      }

      const jsonParseTime = Date.now() - jsonParseStart

      // Validate JSON structure limits (optimized)
      const validationStart = Date.now()
      const validation = validateJsonStructureOptimized(parsedBody, limits)
      const validationTime = Date.now() - validationStart

      if (!validation.valid) {
        logger.warn('REQUEST_SIZE', `JSON structure validation failed: ${validation.error}`)

        return {
          success: false,
          errorResponse: createAPIErrorResponse(
            validation.error || "Invalid JSON structure",
            "invalid_request_error",
            "invalid_structure"
          ),
          statusCode: 400
        }
      }

      const totalTime = Date.now() - startTime

      // Log performance metrics for large requests
      if (bodySize > 10000 || totalTime > 10) {
        logger.debug('REQUEST_SIZE',
          `Single-pass validation completed: ${bodySize} bytes in ${totalTime}ms ` +
          `(parse: ${parseTime + jsonParseTime}ms, validate: ${validationTime}ms)`
        )
      }

      return {
        success: true,
        parsedBody,
        bodySize,
        parseTime: parseTime + jsonParseTime,
        validationTime
      }

    } catch (error) {
      logger.error('REQUEST_SIZE', `Single-pass validation error: ${error}`)

      return {
        success: false,
        errorResponse: createAPIErrorResponse(
          "Failed to validate request",
          "internal_error",
          "validation_failed"
        ),
        statusCode: 500
      }
    }
  }
}

/**
 * Validate JSON structure against limits
 */
function validateJsonStructure(obj: any, limits: RequestSizeLimits, depth = 0): { valid: boolean; error?: string } {
  // Check depth limit
  if (depth > limits.maxJsonDepth) {
    return { valid: false, error: `JSON nesting too deep (max: ${limits.maxJsonDepth})` }
  }

  if (Array.isArray(obj)) {
    // Check array length
    if (obj.length > limits.maxArrayLength) {
      return { valid: false, error: `Array too long (max: ${limits.maxArrayLength} items)` }
    }

    // Validate array elements
    for (let i = 0; i < obj.length; i++) {
      const result = validateJsonStructure(obj[i], limits, depth + 1)
      if (!result.valid) {
        return result
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    // Validate object properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const result = validateJsonStructure(obj[key], limits, depth + 1)
        if (!result.valid) {
          return result
        }
      }
    }
  } else if (typeof obj === 'string') {
    // Check string length
    if (obj.length > limits.maxStringLength) {
      return { valid: false, error: `String too long (max: ${Math.round(limits.maxStringLength / 1024)}KB)` }
    }
  }

  return { valid: true }
}

/**
 * Optimized JSON structure validation with early termination and performance tracking
 */
function validateJsonStructureOptimized(obj: any, limits: RequestSizeLimits): {
  valid: boolean
  error?: string
  stats?: {
    nodesVisited: number
    maxDepthReached: number
    largestArrayFound: number
    longestStringFound: number
  }
} {
  let nodesVisited = 0
  let maxDepthReached = 0
  let largestArrayFound = 0
  let longestStringFound = 0

  function validateRecursive(value: any, depth: number): { valid: boolean; error?: string } {
    nodesVisited++
    maxDepthReached = Math.max(maxDepthReached, depth)

    // Early termination for performance
    if (nodesVisited > 10000) { // Prevent excessive processing
      return {
        valid: false,
        error: "JSON structure too complex (too many nodes)"
      }
    }

    // Check depth limit
    if (depth > limits.maxJsonDepth) {
      return {
        valid: false,
        error: `JSON nesting too deep: ${depth} levels (max: ${limits.maxJsonDepth})`
      }
    }

    // Check arrays (optimized)
    if (Array.isArray(value)) {
      largestArrayFound = Math.max(largestArrayFound, value.length)

      if (value.length > limits.maxArrayLength) {
        return {
          valid: false,
          error: `Array too long: ${value.length} elements (max: ${limits.maxArrayLength})`
        }
      }

      // Validate array elements with early termination
      for (let i = 0; i < value.length; i++) {
        const result = validateRecursive(value[i], depth + 1)
        if (!result.valid) {
          return result
        }
      }
    }
    // Check objects (optimized)
    else if (value && typeof value === 'object') {
      // Use Object.values for better performance than for...in
      const values = Object.values(value)
      for (let i = 0; i < values.length; i++) {
        const result = validateRecursive(values[i], depth + 1)
        if (!result.valid) {
          return result
        }
      }
    }
    // Check strings (optimized)
    else if (typeof value === 'string') {
      longestStringFound = Math.max(longestStringFound, value.length)

      if (value.length > limits.maxStringLength) {
        return {
          valid: false,
          error: `String too long: ${value.length} characters (max: ${limits.maxStringLength})`
        }
      }
    }

    return { valid: true }
  }

  const result = validateRecursive(obj, 0)

  return {
    ...result,
    stats: {
      nodesVisited,
      maxDepthReached,
      largestArrayFound,
      longestStringFound
    }
  }
}

/**
 * Get parsed body from context (set by middleware)
 */
export function getParsedBody(c: Context): any {
  return c.get('parsedBody')
}

/**
 * Format size in human-readable format
 */
export function formatSize(bytes: number): string {
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
 * Test environment configuration with relaxed limits
 */
export const TEST_LIMITS: RequestSizeLimits = {
  maxBodySize: 50 * 1024 * 1024, // 50MB for testing
  maxJsonDepth: 20,
  maxArrayLength: 50000,
  maxStringLength: 5 * 1024 * 1024 // 5MB
}

/**
 * Production environment configuration with strict limits
 */
export const PRODUCTION_LIMITS: RequestSizeLimits = {
  maxBodySize: 5 * 1024 * 1024, // 5MB for production
  maxJsonDepth: 8,
  maxArrayLength: 5000,
  maxStringLength: 512 * 1024 // 512KB
}
