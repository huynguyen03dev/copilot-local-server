/**
 * Request Validation Service
 * Handles request size validation, JSON structure validation, and content validation
 */

import { logger } from '../utils/logger'
import { createAPIErrorResponse } from '../types/errors'
import {
  SIZE_CONSTANTS,
  JSON_VALIDATION_CONSTANTS,
  PERFORMANCE_CONSTANTS,
  HTTP_STATUS
} from '../constants'
import { Environment } from '../utils/configBuilder'
import {
  typeGuards,
  RuntimeValidator,
  TypeGuards
} from '../utils/typeGuards'
import { ErrorResponseBuilder } from '../utils/errorResponseBuilder'

export interface RequestSizeLimits {
  maxBodySize: number
  maxJsonDepth: number
  maxArrayLength: number
  maxStringLength: number
}

export interface ValidationResult {
  success: boolean
  errorResponse?: any
  statusCode?: number
  parsedBody?: any
  bodySize?: number
  parseTime?: number
  validationTime?: number
}

export interface ValidationStats {
  nodesVisited: number
  maxDepthReached: number
  largestArrayFound: number
  longestStringFound: number
}

/**
 * Service for validating request content and structure
 */
export class RequestValidationService {
  private limits: RequestSizeLimits

  constructor(customLimits?: Partial<RequestSizeLimits>) {
    this.limits = this.buildLimits(customLimits)
  }

  /**
   * Build environment-appropriate limits
   */
  private buildLimits(customLimits?: Partial<RequestSizeLimits>): RequestSizeLimits {
    const baseLimits: RequestSizeLimits = Environment.isTest() ? {
      maxBodySize: SIZE_CONSTANTS.MAX_REQUEST_SIZE_TEST,
      maxJsonDepth: JSON_VALIDATION_CONSTANTS.MAX_JSON_DEPTH_TEST,
      maxArrayLength: JSON_VALIDATION_CONSTANTS.MAX_ARRAY_LENGTH_TEST,
      maxStringLength: SIZE_CONSTANTS.MAX_STRING_LENGTH_TEST
    } : {
      maxBodySize: SIZE_CONSTANTS.MAX_REQUEST_SIZE,
      maxJsonDepth: JSON_VALIDATION_CONSTANTS.MAX_JSON_DEPTH,
      maxArrayLength: JSON_VALIDATION_CONSTANTS.MAX_ARRAY_LENGTH,
      maxStringLength: SIZE_CONSTANTS.MAX_STRING_LENGTH
    }

    return { ...baseLimits, ...customLimits }
  }

  /**
   * Validate content length header
   */
  validateContentLength(contentLength: string): ValidationResult {
    const size = parseInt(contentLength, 10)
    
    if (isNaN(size)) {
      return {
        success: false,
        errorResponse: createAPIErrorResponse(
          "Invalid Content-Length header",
          "invalid_request_error",
          "INVALID_CONTENT_LENGTH"
        ),
        statusCode: HTTP_STATUS.BAD_REQUEST
      }
    }

    if (size > this.limits.maxBodySize) {
      logger.warn('REQUEST_VALIDATION', `Request body too large: ${size} bytes (max: ${this.limits.maxBodySize})`)

      return {
        success: false,
        errorResponse: createAPIErrorResponse(
          `Request body too large. Maximum size is ${Math.round(this.limits.maxBodySize / SIZE_CONSTANTS.BYTES_PER_MB)}MB`,
          "invalid_request_error",
          "REQUEST_TOO_LARGE"
        ),
        statusCode: HTTP_STATUS.REQUEST_TOO_LARGE
      }
    }

    return { success: true }
  }

  /**
   * Validate and parse request body with comprehensive validation
   */
  async validateRequestBody(body: string): Promise<ValidationResult> {
    const startTime = Date.now()
    const bodySize = Buffer.byteLength(body, 'utf8')

    try {
      // Check body size
      if (bodySize > this.limits.maxBodySize) {
        return {
          success: false,
          errorResponse: createAPIErrorResponse(
            `Request body too large: ${this.formatSize(bodySize)} (max: ${this.formatSize(this.limits.maxBodySize)})`,
            "invalid_request_error",
            "REQUEST_TOO_LARGE"
          ),
          statusCode: HTTP_STATUS.REQUEST_TOO_LARGE
        }
      }

      // Parse JSON with type safety
      const jsonParseStart = Date.now()
      let parsedBody: unknown

      // Use type-safe JSON parsing
      const parseResult = RuntimeValidator.validate(
        body,
        (value): value is string => TypeGuards.isString(value) && TypeGuards.isValidJson(value),
        'request body'
      )

      if (!parseResult.isValid) {
        return {
          success: false,
          errorResponse: ErrorResponseBuilder.validation(
            parseResult.error || 'Invalid JSON format',
            'body'
          ),
          statusCode: HTTP_STATUS.BAD_REQUEST
        }
      }

      // Parse the validated JSON string
      try {
        parsedBody = JSON.parse(parseResult.value!)
      } catch (parseError) {
        return {
          success: false,
          errorResponse: ErrorResponseBuilder.validation(
            `JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
            'body'
          ),
          statusCode: HTTP_STATUS.BAD_REQUEST
        }
      }

      const jsonParseTime = Date.now() - jsonParseStart

      // Validate JSON structure with type safety
      const validationStart = Date.now()
      const validation = this.validateJsonStructure(parsedBody)
      const validationTime = Date.now() - validationStart

      if (!validation.valid) {
        logger.warn('REQUEST_VALIDATION', `JSON structure validation failed: ${validation.error}`)

        return {
          success: false,
          errorResponse: createAPIErrorResponse(
            validation.error || "Invalid JSON structure",
            "invalid_request_error",
            "INVALID_STRUCTURE"
          ),
          statusCode: HTTP_STATUS.BAD_REQUEST
        }
      }

      const totalTime = Date.now() - startTime

      // Log performance metrics for large requests
      if (bodySize > PERFORMANCE_CONSTANTS.LARGE_REQUEST_THRESHOLD || totalTime > PERFORMANCE_CONSTANTS.SLOW_VALIDATION_MS) {
        logger.debug('REQUEST_VALIDATION',
          `Validation completed: ${bodySize} bytes in ${totalTime}ms ` +
          `(parse: ${jsonParseTime}ms, validate: ${validationTime}ms)`
        )
      }

      return {
        success: true,
        parsedBody,
        bodySize,
        parseTime: jsonParseTime,
        validationTime
      }

    } catch (error) {
      logger.error('REQUEST_VALIDATION', `Validation error: ${error}`)

      return {
        success: false,
        errorResponse: createAPIErrorResponse(
          "Failed to validate request",
          "internal_error",
          "VALIDATION_FAILED"
        ),
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR
      }
    }
  }

  /**
   * Validate JSON structure with comprehensive checks
   */
  validateJsonStructure(obj: any): { valid: boolean; error?: string; stats?: ValidationStats } {
    let nodesVisited = 0
    let maxDepthReached = 0
    let largestArrayFound = 0
    let longestStringFound = 0

    const validateRecursive = (value: any, depth: number): { valid: boolean; error?: string } => {
      nodesVisited++
      maxDepthReached = Math.max(maxDepthReached, depth)

      // Early termination for performance
      if (nodesVisited > PERFORMANCE_CONSTANTS.MAX_VALIDATION_NODES) {
        return {
          valid: false,
          error: "JSON structure too complex (too many nodes)"
        }
      }

      // Check depth limit
      if (depth > this.limits.maxJsonDepth) {
        return {
          valid: false,
          error: `JSON nesting too deep: ${depth} levels (max: ${this.limits.maxJsonDepth})`
        }
      }

      // Check arrays
      if (Array.isArray(value)) {
        largestArrayFound = Math.max(largestArrayFound, value.length)

        if (value.length > this.limits.maxArrayLength) {
          return {
            valid: false,
            error: `Array too long: ${value.length} elements (max: ${this.limits.maxArrayLength})`
          }
        }

        // Validate array elements
        for (const item of value) {
          const result = validateRecursive(item, depth + 1)
          if (!result.valid) {
            return result
          }
        }
      }
      // Check objects
      else if (value !== null && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
          // Validate key length
          if (key.length > this.limits.maxStringLength) {
            return {
              valid: false,
              error: `Object key too long: ${key.length} characters (max: ${this.limits.maxStringLength})`
            }
          }

          const result = validateRecursive(val, depth + 1)
          if (!result.valid) {
            return result
          }
        }
      }
      // Check strings
      else if (typeof value === 'string') {
        longestStringFound = Math.max(longestStringFound, value.length)

        if (value.length > this.limits.maxStringLength) {
          return {
            valid: false,
            error: `String too long: ${value.length} characters (max: ${this.limits.maxStringLength})`
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
   * Format size in human-readable format
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= SIZE_CONSTANTS.BYTES_PER_KB && unitIndex < units.length - 1) {
      size /= SIZE_CONSTANTS.BYTES_PER_KB
      unitIndex++
    }
    
    return `${Math.round(size * 100) / 100}${units[unitIndex]}`
  }

  /**
   * Get current limits
   */
  getLimits(): RequestSizeLimits {
    return { ...this.limits }
  }

  /**
   * Update limits
   */
  updateLimits(newLimits: Partial<RequestSizeLimits>): void {
    this.limits = { ...this.limits, ...newLimits }
  }

  /**
   * Create validation service with environment-specific defaults
   */
  static createForEnvironment(environment?: string): RequestValidationService {
    const isTest = environment === 'test' || Environment.isTest()
    
    if (isTest) {
      return new RequestValidationService({
        maxBodySize: SIZE_CONSTANTS.MAX_REQUEST_SIZE_TEST,
        maxJsonDepth: JSON_VALIDATION_CONSTANTS.MAX_JSON_DEPTH_TEST,
        maxArrayLength: JSON_VALIDATION_CONSTANTS.MAX_ARRAY_LENGTH_TEST,
        maxStringLength: SIZE_CONSTANTS.MAX_STRING_LENGTH_TEST
      })
    }

    return new RequestValidationService()
  }
}
