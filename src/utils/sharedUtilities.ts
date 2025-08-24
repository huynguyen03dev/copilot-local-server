/**
 * Shared Utilities
 * Consolidates common patterns and eliminates code duplication
 */

import { logger } from './logger'
import { ErrorResponseBuilder, ErrorContext } from './errorResponseBuilder'
import { typeGuards } from './typeGuards'
import { HTTP_STATUS, TIMEOUT_CONSTANTS } from '../constants'

/**
 * Common HTTP response patterns
 */
export class ResponseBuilder {
  /**
   * Create success response with consistent structure
   */
  static success<T>(data: T, metadata?: Record<string, unknown>): {
    data: T
    success: boolean
    timestamp: string
    metadata?: Record<string, unknown>
  } {
    return {
      data,
      success: true,
      timestamp: new Date().toISOString(),
      ...(metadata && { metadata })
    }
  }

  /**
   * Create paginated response
   */
  static paginated<T>(
    items: T[],
    page: number,
    limit: number,
    total: number
  ): {
    data: T[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
    success: boolean
    timestamp: string
  } {
    const totalPages = Math.ceil(total / limit)
    
    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      success: true,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Create streaming response headers
   */
  static streamingHeaders(): Record<string, string> {
    return {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Accel-Buffering': 'no'
    }
  }

  /**
   * Create JSON response headers
   */
  static jsonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  }
}

/**
 * Common validation patterns
 */
export class ValidationUtils {
  /**
   * Validate required fields in object
   */
  static validateRequiredFields<T extends Record<string, unknown>>(
    obj: unknown,
    requiredFields: (keyof T)[],
    objectName: string = 'object'
  ): { isValid: boolean; errors: string[]; validatedObject?: T } {
    if (!typeGuards.isObject(obj)) {
      return {
        isValid: false,
        errors: [`${objectName} must be an object`]
      }
    }

    const errors: string[] = []
    const typedObj = obj as T

    for (const field of requiredFields) {
      if (!(field in typedObj) || typedObj[field] === undefined || typedObj[field] === null) {
        errors.push(`Missing required field: ${String(field)}`)
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors }
    }

    return { isValid: true, errors: [], validatedObject: typedObj }
  }

  /**
   * Validate string field with constraints
   */
  static validateStringField(
    value: unknown,
    fieldName: string,
    options: {
      required?: boolean
      minLength?: number
      maxLength?: number
      pattern?: RegExp
      allowEmpty?: boolean
    } = {}
  ): { isValid: boolean; error?: string } {
    const { required = false, minLength, maxLength, pattern, allowEmpty = true } = options

    if (value === undefined || value === null) {
      if (required) {
        return { isValid: false, error: `${fieldName} is required` }
      }
      return { isValid: true }
    }

    if (!typeGuards.isString(value)) {
      return { isValid: false, error: `${fieldName} must be a string` }
    }

    if (!allowEmpty && value.length === 0) {
      return { isValid: false, error: `${fieldName} cannot be empty` }
    }

    if (minLength !== undefined && value.length < minLength) {
      return { isValid: false, error: `${fieldName} must be at least ${minLength} characters` }
    }

    if (maxLength !== undefined && value.length > maxLength) {
      return { isValid: false, error: `${fieldName} must be at most ${maxLength} characters` }
    }

    if (pattern && !pattern.test(value)) {
      return { isValid: false, error: `${fieldName} format is invalid` }
    }

    return { isValid: true }
  }

  /**
   * Validate number field with constraints
   */
  static validateNumberField(
    value: unknown,
    fieldName: string,
    options: {
      required?: boolean
      min?: number
      max?: number
      integer?: boolean
    } = {}
  ): { isValid: boolean; error?: string } {
    const { required = false, min, max, integer = false } = options

    if (value === undefined || value === null) {
      if (required) {
        return { isValid: false, error: `${fieldName} is required` }
      }
      return { isValid: true }
    }

    if (!typeGuards.isNumber(value)) {
      return { isValid: false, error: `${fieldName} must be a number` }
    }

    if (integer && !Number.isInteger(value)) {
      return { isValid: false, error: `${fieldName} must be an integer` }
    }

    if (min !== undefined && value < min) {
      return { isValid: false, error: `${fieldName} must be at least ${min}` }
    }

    if (max !== undefined && value > max) {
      return { isValid: false, error: `${fieldName} must be at most ${max}` }
    }

    return { isValid: true }
  }

  /**
   * Validate array field with constraints
   */
  static validateArrayField<T>(
    value: unknown,
    fieldName: string,
    elementValidator: (item: unknown) => item is T,
    options: {
      required?: boolean
      minLength?: number
      maxLength?: number
      allowEmpty?: boolean
    } = {}
  ): { isValid: boolean; error?: string; validatedArray?: T[] } {
    const { required = false, minLength, maxLength, allowEmpty = true } = options

    if (value === undefined || value === null) {
      if (required) {
        return { isValid: false, error: `${fieldName} is required` }
      }
      return { isValid: true }
    }

    if (!typeGuards.isArray(value)) {
      return { isValid: false, error: `${fieldName} must be an array` }
    }

    if (!allowEmpty && value.length === 0) {
      return { isValid: false, error: `${fieldName} cannot be empty` }
    }

    if (minLength !== undefined && value.length < minLength) {
      return { isValid: false, error: `${fieldName} must have at least ${minLength} items` }
    }

    if (maxLength !== undefined && value.length > maxLength) {
      return { isValid: false, error: `${fieldName} must have at most ${maxLength} items` }
    }

    // Validate each element
    const validatedItems: T[] = []
    for (let i = 0; i < value.length; i++) {
      if (!elementValidator(value[i])) {
        return { isValid: false, error: `${fieldName}[${i}] is invalid` }
      }
      validatedItems.push(value[i])
    }

    return { isValid: true, validatedArray: validatedItems }
  }
}

/**
 * Common async operation patterns
 */
export class AsyncUtils {
  /**
   * Retry async operation with exponential backoff
   */
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number
      initialDelay?: number
      maxDelay?: number
      backoffFactor?: number
      shouldRetry?: (error: Error) => boolean
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      shouldRetry = () => true
    } = options

    let lastError: Error

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt === maxRetries || !shouldRetry(lastError)) {
          throw lastError
        }

        const delay = Math.min(initialDelay * Math.pow(backoffFactor, attempt), maxDelay)
        logger.warn('ASYNC_RETRY', `Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`)
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError!
  }

  /**
   * Execute operations in parallel with concurrency limit
   */
  static async parallelLimit<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    concurrency: number = 5
  ): Promise<R[]> {
    const results: R[] = []
    const executing: Promise<void>[] = []

    for (const item of items) {
      const promise = operation(item).then(result => {
        results.push(result)
      })

      executing.push(promise)

      if (executing.length >= concurrency) {
        await Promise.race(executing)
        executing.splice(executing.findIndex(p => p === promise), 1)
      }
    }

    await Promise.all(executing)
    return results
  }

  /**
   * Timeout wrapper for promises
   */
  static withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = TIMEOUT_CONSTANTS.DEFAULT_TIMEOUT_MS,
    errorMessage: string = 'Operation timed out'
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    })

    return Promise.race([promise, timeoutPromise])
  }
}

/**
 * Common string manipulation utilities
 */
export class StringUtils {
  /**
   * Truncate string with ellipsis
   */
  static truncate(str: string, maxLength: number, suffix: string = '...'): string {
    if (str.length <= maxLength) return str
    return str.substring(0, maxLength - suffix.length) + suffix
  }

  /**
   * Sanitize string for logging (remove sensitive data)
   */
  static sanitizeForLogging(str: string): string {
    return str
      .replace(/Bearer\s+[A-Za-z0-9_-]+/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9_-]+/gi, 'sk-[REDACTED]')
      .replace(/"password"\s*:\s*"[^"]*"/gi, '"password": "[REDACTED]"')
      .replace(/"token"\s*:\s*"[^"]*"/gi, '"token": "[REDACTED]"')
  }

  /**
   * Generate random string
   */
  static randomString(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * Convert camelCase to snake_case
   */
  static camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
  }

  /**
   * Convert snake_case to camelCase
   */
  static snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  }
}

/**
 * Common date/time utilities
 */
export class DateUtils {
  /**
   * Format date for API responses
   */
  static formatForAPI(date: Date = new Date()): string {
    return date.toISOString()
  }

  /**
   * Parse date from various formats
   */
  static parseDate(dateString: string): Date | null {
    const date = new Date(dateString)
    return isNaN(date.getTime()) ? null : date
  }

  /**
   * Get relative time string
   */
  static getRelativeTime(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return `${diffSecs}s ago`
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  /**
   * Check if date is within range
   */
  static isWithinRange(date: Date, startDate: Date, endDate: Date): boolean {
    return date >= startDate && date <= endDate
  }
}

/**
 * Export all utilities
 */
export const sharedUtils = {
  response: ResponseBuilder,
  validation: ValidationUtils,
  async: AsyncUtils,
  string: StringUtils,
  date: DateUtils
}
