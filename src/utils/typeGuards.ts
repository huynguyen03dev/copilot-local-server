/**
 * Type Guards and Runtime Validation Utilities
 * Provides comprehensive type checking and validation
 */

import { logger } from './logger'

/**
 * Basic type checking utilities
 */
export const TypeGuards = {
  /**
   * Check if value is a string
   */
  isString(value: unknown): value is string {
    return typeof value === 'string'
  },

  /**
   * Check if value is a non-empty string
   */
  isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
  },

  /**
   * Check if value is a number
   */
  isNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value)
  },

  /**
   * Check if value is a positive number
   */
  isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && value > 0
  },

  /**
   * Check if value is a boolean
   */
  isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean'
  },

  /**
   * Check if value is an object (not null, not array)
   */
  isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  },

  /**
   * Check if value is an array
   */
  isArray(value: unknown): value is unknown[] {
    return Array.isArray(value)
  },

  /**
   * Check if value is a non-empty array
   */
  isNonEmptyArray(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length > 0
  },

  /**
   * Check if value is null or undefined
   */
  isNullish(value: unknown): value is null | undefined {
    return value === null || value === undefined
  },

  /**
   * Check if value is defined (not null or undefined)
   */
  isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined
  },

  /**
   * Check if value is a function
   */
  isFunction(value: unknown): value is Function {
    return typeof value === 'function'
  },

  /**
   * Check if value is a Date object
   */
  isDate(value: unknown): value is Date {
    return value instanceof Date && !isNaN(value.getTime())
  },

  /**
   * Check if value is a valid URL string
   */
  isValidUrl(value: unknown): value is string {
    if (!this.isString(value)) return false
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  },

  /**
   * Check if value is a valid email string
   */
  isValidEmail(value: unknown): value is string {
    if (!this.isString(value)) return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(value)
  },

  /**
   * Check if value is a valid JSON string
   */
  isValidJson(value: unknown): value is string {
    if (!this.isString(value)) return false
    try {
      JSON.parse(value)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Content type guards for API validation
 */
export const ContentTypeGuards = {
  /**
   * Check if content is text content
   */
  isTextContent(content: unknown): content is { type: 'text'; text: string } {
    return (
      TypeGuards.isObject(content) &&
      content.type === 'text' &&
      TypeGuards.isString(content.text)
    )
  },

  /**
   * Check if content is image content
   */
  isImageContent(content: unknown): content is { type: 'image_url'; image_url: { url: string } } {
    return (
      TypeGuards.isObject(content) &&
      content.type === 'image_url' &&
      TypeGuards.isObject(content.image_url) &&
      TypeGuards.isString(content.image_url.url)
    )
  },

  /**
   * Check if content is valid content block
   */
  isValidContentBlock(content: unknown): boolean {
    return this.isTextContent(content) || this.isImageContent(content)
  },

  /**
   * Check if value is valid content array
   */
  isValidContentArray(content: unknown): content is Array<{ type: string; [key: string]: any }> {
    return (
      TypeGuards.isArray(content) &&
      content.every(item => this.isValidContentBlock(item))
    )
  }
}

/**
 * Request validation type guards
 */
export const RequestTypeGuards = {
  /**
   * Check if value is a valid chat completion request
   */
  isChatCompletionRequest(value: unknown): boolean {
    if (!TypeGuards.isObject(value)) return false

    const request = value as Record<string, unknown>

    // Required fields
    if (!TypeGuards.isNonEmptyArray(request.messages)) return false
    if (!TypeGuards.isString(request.model)) return false

    // Optional fields validation
    if (request.max_tokens !== undefined && !TypeGuards.isPositiveNumber(request.max_tokens)) return false
    if (request.temperature !== undefined && !TypeGuards.isNumber(request.temperature)) return false
    if (request.stream !== undefined && !TypeGuards.isBoolean(request.stream)) return false

    // Validate messages array
    return this.isValidMessagesArray(request.messages)
  },

  /**
   * Check if messages array is valid
   */
  isValidMessagesArray(messages: unknown): boolean {
    if (!TypeGuards.isNonEmptyArray(messages)) return false

    return messages.every(message => this.isValidMessage(message))
  },

  /**
   * Check if message is valid
   */
  isValidMessage(message: unknown): boolean {
    if (!TypeGuards.isObject(message)) return false

    const msg = message as Record<string, unknown>

    // Required fields
    if (!TypeGuards.isNonEmptyString(msg.role)) return false
    if (!['user', 'assistant', 'system'].includes(msg.role as string)) return false

    // Content validation
    if (msg.content !== undefined) {
      return (
        TypeGuards.isString(msg.content) ||
        ContentTypeGuards.isValidContentArray(msg.content)
      )
    }

    return true
  },

  /**
   * Check if value is a valid authentication token
   */
  isValidAuthToken(value: unknown): value is string {
    if (!TypeGuards.isString(value)) return false
    
    // Basic token format validation
    return value.length > 10 && (
      value.startsWith('Bearer ') ||
      value.startsWith('sk-') ||
      /^[A-Za-z0-9_-]+$/.test(value)
    )
  }
}

/**
 * Response validation type guards
 */
export const ResponseTypeGuards = {
  /**
   * Check if value is a valid API error response
   */
  isAPIErrorResponse(value: unknown): boolean {
    if (!TypeGuards.isObject(value)) return false

    const response = value as Record<string, unknown>
    
    return (
      TypeGuards.isObject(response.error) &&
      TypeGuards.isString((response.error as any).message) &&
      TypeGuards.isString((response.error as any).type)
    )
  },

  /**
   * Check if value is a valid streaming chunk
   */
  isValidStreamingChunk(value: unknown): boolean {
    if (!TypeGuards.isObject(value)) return false

    const chunk = value as Record<string, unknown>
    
    return (
      TypeGuards.isString(chunk.id) &&
      TypeGuards.isString(chunk.object) &&
      TypeGuards.isArray(chunk.choices)
    )
  }
}

/**
 * Configuration validation type guards
 */
export const ConfigTypeGuards = {
  /**
   * Check if value is valid server configuration
   */
  isValidServerConfig(value: unknown): boolean {
    if (!TypeGuards.isObject(value)) return false

    const config = value as Record<string, unknown>
    
    return (
      TypeGuards.isPositiveNumber(config.port) &&
      TypeGuards.isString(config.host) &&
      (config.timeout === undefined || TypeGuards.isPositiveNumber(config.timeout))
    )
  },

  /**
   * Check if value is valid rate limit configuration
   */
  isValidRateLimitConfig(value: unknown): boolean {
    if (!TypeGuards.isObject(value)) return false

    const config = value as Record<string, unknown>
    
    return (
      TypeGuards.isPositiveNumber(config.windowMs) &&
      TypeGuards.isPositiveNumber(config.max)
    )
  }
}

/**
 * Runtime validation with detailed error reporting
 */
export class RuntimeValidator {
  /**
   * Validate value with custom validator function
   */
  static validate<T>(
    value: unknown,
    validator: (value: unknown) => value is T,
    fieldName: string = 'value'
  ): { isValid: boolean; value?: T; error?: string } {
    try {
      if (validator(value)) {
        return { isValid: true, value: value as T }
      } else {
        return { 
          isValid: false, 
          error: `${fieldName} failed validation` 
        }
      }
    } catch (error) {
      logger.warn('RUNTIME_VALIDATOR', `Validation error for ${fieldName}: ${error}`)
      return { 
        isValid: false, 
        error: `${fieldName} validation threw error: ${error}` 
      }
    }
  }

  /**
   * Validate object properties
   */
  static validateObject<T extends Record<string, unknown>>(
    value: unknown,
    schema: Record<keyof T, (value: unknown) => boolean>
  ): { isValid: boolean; value?: T; errors?: string[] } {
    if (!TypeGuards.isObject(value)) {
      return { isValid: false, errors: ['Value is not an object'] }
    }

    const errors: string[] = []
    const obj = value as Record<string, unknown>

    for (const [key, validator] of Object.entries(schema)) {
      if (!validator(obj[key])) {
        errors.push(`Property '${key}' failed validation`)
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors }
    }

    return { isValid: true, value: value as T }
  }

  /**
   * Validate array elements
   */
  static validateArray<T>(
    value: unknown,
    elementValidator: (value: unknown) => value is T
  ): { isValid: boolean; value?: T[]; errors?: string[] } {
    if (!TypeGuards.isArray(value)) {
      return { isValid: false, errors: ['Value is not an array'] }
    }

    const errors: string[] = []
    const validatedItems: T[] = []

    value.forEach((item, index) => {
      if (elementValidator(item)) {
        validatedItems.push(item)
      } else {
        errors.push(`Array element at index ${index} failed validation`)
      }
    })

    if (errors.length > 0) {
      return { isValid: false, errors }
    }

    return { isValid: true, value: validatedItems }
  }
}

/**
 * Export all type guards and validators
 */
export const typeGuards = {
  ...TypeGuards,
  content: ContentTypeGuards,
  request: RequestTypeGuards,
  response: ResponseTypeGuards,
  config: ConfigTypeGuards,
  validator: RuntimeValidator
}
