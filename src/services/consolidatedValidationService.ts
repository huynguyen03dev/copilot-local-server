/**
 * Consolidated Validation Service
 * Eliminates code duplication by providing unified validation patterns
 */

import { logger } from '../utils/logger'
import { ErrorResponseBuilder } from '../utils/errorResponseBuilder'
import { typeGuards } from '../utils/typeGuards'
import { ValidationUtils } from '../utils/sharedUtilities'
import { 
  SIZE_CONSTANTS, 
  JSON_VALIDATION_CONSTANTS,
  HTTP_STATUS 
} from '../constants'
import { ChatCompletionRequest } from '../types'

export interface ValidationResult<T = any> {
  success: boolean
  data?: T
  errors?: string[]
  errorResponse?: any
  statusCode?: number
  metadata?: {
    validationTime?: number
    bodySize?: number
    parseTime?: number
  }
}

/**
 * Unified validation service that consolidates all validation logic
 */
export class ConsolidatedValidationService {
  /**
   * Validate chat completion request with comprehensive checks
   */
  static validateChatCompletionRequest(data: unknown): ValidationResult<ChatCompletionRequest> {
    const startTime = Date.now()

    // Basic object validation
    if (!typeGuards.isObject(data)) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.validation('Request must be a valid JSON object'),
        statusCode: HTTP_STATUS.BAD_REQUEST
      }
    }

    const request = data as Record<string, unknown>
    const errors: string[] = []

    // Validate required fields
    const requiredFieldsResult = ValidationUtils.validateRequiredFields(
      request,
      ['model', 'messages'],
      'chat completion request'
    )

    if (!requiredFieldsResult.isValid) {
      return {
        success: false,
        errors: requiredFieldsResult.errors,
        errorResponse: ErrorResponseBuilder.validation(
          requiredFieldsResult.errors.join(', ')
        ),
        statusCode: HTTP_STATUS.BAD_REQUEST
      }
    }

    // Validate model field
    const modelValidation = ValidationUtils.validateStringField(
      request.model,
      'model',
      { required: true, minLength: 1, maxLength: 100 }
    )

    if (!modelValidation.isValid) {
      errors.push(modelValidation.error!)
    }

    // Validate messages array
    const messagesValidation = this.validateMessagesArray(request.messages)
    if (!messagesValidation.success) {
      errors.push(...(messagesValidation.errors || []))
    }

    // Validate optional fields
    if (request.max_tokens !== undefined) {
      const maxTokensValidation = ValidationUtils.validateNumberField(
        request.max_tokens,
        'max_tokens',
        { min: 1, max: 100000, integer: true }
      )
      if (!maxTokensValidation.isValid) {
        errors.push(maxTokensValidation.error!)
      }
    }

    if (request.temperature !== undefined) {
      const temperatureValidation = ValidationUtils.validateNumberField(
        request.temperature,
        'temperature',
        { min: 0, max: 2 }
      )
      if (!temperatureValidation.isValid) {
        errors.push(temperatureValidation.error!)
      }
    }

    if (request.stream !== undefined) {
      if (!typeGuards.isBoolean(request.stream)) {
        errors.push('stream must be a boolean')
      }
    }

    // Return validation result
    if (errors.length > 0) {
      return {
        success: false,
        errors,
        errorResponse: ErrorResponseBuilder.validation(
          `Validation failed: ${errors.join(', ')}`
        ),
        statusCode: HTTP_STATUS.BAD_REQUEST,
        metadata: {
          validationTime: Date.now() - startTime
        }
      }
    }

    return {
      success: true,
      data: request as ChatCompletionRequest,
      metadata: {
        validationTime: Date.now() - startTime
      }
    }
  }

  /**
   * Validate messages array
   */
  private static validateMessagesArray(messages: unknown): ValidationResult {
    const messagesValidation = ValidationUtils.validateArrayField(
      messages,
      'messages',
      (item): item is any => this.isValidMessage(item),
      { required: true, minLength: 1, maxLength: 100 }
    )

    if (!messagesValidation.isValid) {
      return {
        success: false,
        errors: [messagesValidation.error!]
      }
    }

    return { success: true, data: messagesValidation.validatedArray }
  }

  /**
   * Check if message is valid
   */
  private static isValidMessage(message: unknown): boolean {
    if (!typeGuards.isObject(message)) return false

    const msg = message as Record<string, unknown>

    // Validate role
    const roleValidation = ValidationUtils.validateStringField(
      msg.role,
      'role',
      { required: true, allowEmpty: false }
    )

    if (!roleValidation.isValid) return false

    const validRoles = ['user', 'assistant', 'system']
    if (!validRoles.includes(msg.role as string)) return false

    // Validate content
    if (msg.content !== undefined) {
      if (typeGuards.isString(msg.content)) {
        return true
      }

      if (typeGuards.content.isValidContentArray(msg.content)) {
        return true
      }

      return false
    }

    return true
  }

  /**
   * Validate request body size and structure
   */
  static validateRequestBody(body: string): ValidationResult {
    const startTime = Date.now()
    const bodySize = Buffer.byteLength(body, 'utf8')

    // Check body size
    if (bodySize > SIZE_CONSTANTS.MAX_REQUEST_SIZE) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.requestTooLarge(
          bodySize,
          SIZE_CONSTANTS.MAX_REQUEST_SIZE
        ),
        statusCode: HTTP_STATUS.REQUEST_TOO_LARGE,
        metadata: { bodySize }
      }
    }

    // Validate JSON format
    const parseStart = Date.now()
    let parsedBody: unknown

    try {
      parsedBody = JSON.parse(body)
    } catch (parseError) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.validation(
          `Invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse error'}`,
          'body'
        ),
        statusCode: HTTP_STATUS.BAD_REQUEST,
        metadata: {
          bodySize,
          parseTime: Date.now() - parseStart,
          validationTime: Date.now() - startTime
        }
      }
    }

    const parseTime = Date.now() - parseStart

    // Validate JSON structure depth and complexity
    const structureValidation = this.validateJsonStructure(parsedBody)
    if (!structureValidation.success) {
      return {
        success: false,
        errors: structureValidation.errors,
        errorResponse: ErrorResponseBuilder.validation(
          structureValidation.errors?.join(', ') || 'Invalid JSON structure'
        ),
        statusCode: HTTP_STATUS.BAD_REQUEST,
        metadata: {
          bodySize,
          parseTime,
          validationTime: Date.now() - startTime
        }
      }
    }

    return {
      success: true,
      data: parsedBody,
      metadata: {
        bodySize,
        parseTime,
        validationTime: Date.now() - startTime
      }
    }
  }

  /**
   * Validate JSON structure depth and complexity
   */
  private static validateJsonStructure(obj: unknown, depth: number = 0): ValidationResult {
    const maxDepth = JSON_VALIDATION_CONSTANTS.MAX_JSON_DEPTH
    const maxArrayLength = JSON_VALIDATION_CONSTANTS.MAX_ARRAY_LENGTH

    if (depth > maxDepth) {
      return {
        success: false,
        errors: [`JSON depth exceeds maximum of ${maxDepth}`]
      }
    }

    if (typeGuards.isArray(obj)) {
      if (obj.length > maxArrayLength) {
        return {
          success: false,
          errors: [`Array length ${obj.length} exceeds maximum of ${maxArrayLength}`]
        }
      }

      for (const item of obj) {
        const itemValidation = this.validateJsonStructure(item, depth + 1)
        if (!itemValidation.success) {
          return itemValidation
        }
      }
    } else if (typeGuards.isObject(obj)) {
      for (const value of Object.values(obj)) {
        const valueValidation = this.validateJsonStructure(value, depth + 1)
        if (!valueValidation.success) {
          return valueValidation
        }
      }
    }

    return { success: true }
  }

  /**
   * Validate authentication token
   */
  static validateAuthToken(token: unknown): ValidationResult<string> {
    if (!typeGuards.request.isValidAuthToken(token)) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.authentication(
          'Invalid or missing authentication token'
        ),
        statusCode: HTTP_STATUS.UNAUTHORIZED
      }
    }

    return {
      success: true,
      data: token
    }
  }

  /**
   * Validate content type header
   */
  static validateContentType(contentType: unknown): ValidationResult<string> {
    if (!typeGuards.isString(contentType)) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.validation(
          'Content-Type header is required',
          'content-type'
        ),
        statusCode: HTTP_STATUS.BAD_REQUEST
      }
    }

    const validTypes = ['application/json', 'application/json; charset=utf-8']
    const normalizedType = contentType.toLowerCase().trim()

    if (!validTypes.some(type => normalizedType.startsWith(type.toLowerCase()))) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.validation(
          `Unsupported Content-Type: ${contentType}. Expected: application/json`,
          'content-type'
        ),
        statusCode: HTTP_STATUS.BAD_REQUEST
      }
    }

    return {
      success: true,
      data: contentType
    }
  }

  /**
   * Validate HTTP method
   */
  static validateHttpMethod(method: unknown, allowedMethods: string[]): ValidationResult<string> {
    if (!typeGuards.isString(method)) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.validation('Invalid HTTP method'),
        statusCode: HTTP_STATUS.BAD_REQUEST
      }
    }

    const upperMethod = method.toUpperCase()
    if (!allowedMethods.includes(upperMethod)) {
      return {
        success: false,
        errorResponse: ErrorResponseBuilder.methodNotAllowed(
          upperMethod,
          allowedMethods
        ),
        statusCode: HTTP_STATUS.METHOD_NOT_ALLOWED
      }
    }

    return {
      success: true,
      data: upperMethod
    }
  }

  /**
   * Comprehensive request validation pipeline
   */
  static async validateFullRequest(
    method: string,
    contentType: string | undefined,
    authToken: string | undefined,
    body: string
  ): Promise<ValidationResult<{ parsedBody: ChatCompletionRequest; token: string }>> {
    const startTime = Date.now()

    // Validate HTTP method
    const methodValidation = this.validateHttpMethod(method, ['POST'])
    if (!methodValidation.success) {
      return methodValidation
    }

    // Validate content type
    const contentTypeValidation = this.validateContentType(contentType)
    if (!contentTypeValidation.success) {
      return contentTypeValidation
    }

    // Validate auth token
    const tokenValidation = this.validateAuthToken(authToken)
    if (!tokenValidation.success) {
      return tokenValidation
    }

    // Validate request body
    const bodyValidation = this.validateRequestBody(body)
    if (!bodyValidation.success) {
      return bodyValidation
    }

    // Validate chat completion request structure
    const requestValidation = this.validateChatCompletionRequest(bodyValidation.data)
    if (!requestValidation.success) {
      return requestValidation
    }

    logger.debug('CONSOLIDATED_VALIDATION', 'Full request validation completed', {
      validationTime: Date.now() - startTime,
      bodySize: bodyValidation.metadata?.bodySize
    })

    return {
      success: true,
      data: {
        parsedBody: requestValidation.data!,
        token: tokenValidation.data!
      },
      metadata: {
        validationTime: Date.now() - startTime,
        bodySize: bodyValidation.metadata?.bodySize
      }
    }
  }
}
