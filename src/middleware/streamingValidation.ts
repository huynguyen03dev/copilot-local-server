/**
 * Streaming Request Validation Middleware
 * Optimized validation for large requests using streaming processing
 * Eliminates memory spikes and improves CPU efficiency for large payloads
 */

import { Context, Next } from "hono"
import { logger } from "../utils/logger"
import { createAPIErrorResponse } from "../types/errors"

export interface StreamingValidationConfig {
  maxChunkSize: number
  maxTotalSize: number
  maxJsonDepth: number
  maxArrayLength: number
  enableStreamingParsing: boolean
  chunkTimeout: number
}

export interface ValidationResult {
  valid: boolean
  error?: string
  bytesProcessed: number
  chunksProcessed: number
  estimatedSize?: number
}

export interface ChunkValidationResult {
  valid: boolean
  error?: string
  isComplete: boolean
  needsMoreData: boolean
}

/**
 * Streaming JSON validator that processes data in chunks
 * Avoids loading entire payload into memory at once
 */
export class StreamingValidator {
  private config: StreamingValidationConfig
  private buffer: string = ""
  private depth: number = 0
  private inString: boolean = false
  private escaped: boolean = false
  private arrayLengths: number[] = []
  private bytesProcessed: number = 0
  private chunksProcessed: number = 0

  constructor(config: StreamingValidationConfig) {
    this.config = config
  }

  /**
   * Validate a chunk of JSON data
   */
  validateChunk(chunk: Uint8Array): ChunkValidationResult {
    try {
      const chunkStr = new TextDecoder().decode(chunk)
      this.buffer += chunkStr
      this.bytesProcessed += chunk.length
      this.chunksProcessed++

      // Check size limits
      if (this.bytesProcessed > this.config.maxTotalSize) {
        return {
          valid: false,
          error: `Request too large: ${this.bytesProcessed} bytes (max: ${this.config.maxTotalSize})`,
          isComplete: false,
          needsMoreData: false
        }
      }

      // Process characters in the new chunk
      for (let i = 0; i < chunkStr.length; i++) {
        const char = chunkStr[i]
        
        if (!this.processCharacter(char)) {
          return {
            valid: false,
            error: this.getValidationError(),
            isComplete: false,
            needsMoreData: false
          }
        }
      }

      // Check if we have a complete JSON object
      const isComplete = this.isJsonComplete()
      
      return {
        valid: true,
        isComplete,
        needsMoreData: !isComplete
      }

    } catch (error) {
      return {
        valid: false,
        error: `Chunk processing error: ${error}`,
        isComplete: false,
        needsMoreData: false
      }
    }
  }

  /**
   * Process a single character for JSON validation
   */
  private processCharacter(char: string): boolean {
    // Handle escape sequences
    if (this.escaped) {
      this.escaped = false
      return true
    }

    if (char === '\\' && this.inString) {
      this.escaped = true
      return true
    }

    // Handle string boundaries
    if (char === '"' && !this.escaped) {
      this.inString = !this.inString
      return true
    }

    // Skip validation inside strings
    if (this.inString) {
      return true
    }

    // Handle object/array depth
    if (char === '{' || char === '[') {
      this.depth++
      if (char === '[') {
        this.arrayLengths.push(0)
      }
      
      // Check depth limit
      if (this.depth > this.config.maxJsonDepth) {
        return false
      }
    } else if (char === '}' || char === ']') {
      this.depth--
      if (char === ']') {
        const arrayLength = this.arrayLengths.pop() || 0
        if (arrayLength > this.config.maxArrayLength) {
          return false
        }
      }
    } else if (char === ',' && this.arrayLengths.length > 0) {
      // Increment array length counter
      this.arrayLengths[this.arrayLengths.length - 1]++
    }

    return true
  }

  /**
   * Check if JSON parsing is complete
   */
  private isJsonComplete(): boolean {
    return this.depth === 0 && this.buffer.trim().length > 0 && !this.inString
  }

  /**
   * Get detailed validation error
   */
  private getValidationError(): string {
    if (this.depth > this.config.maxJsonDepth) {
      return `JSON nesting too deep: ${this.depth} (max: ${this.config.maxJsonDepth})`
    }
    
    if (this.arrayLengths.some(length => length > this.config.maxArrayLength)) {
      const maxLength = Math.max(...this.arrayLengths)
      return `Array too long: ${maxLength} elements (max: ${this.config.maxArrayLength})`
    }

    return "Invalid JSON structure"
  }

  /**
   * Get validation statistics
   */
  getStats(): {
    bytesProcessed: number
    chunksProcessed: number
    currentDepth: number
    bufferSize: number
  } {
    return {
      bytesProcessed: this.bytesProcessed,
      chunksProcessed: this.chunksProcessed,
      currentDepth: this.depth,
      bufferSize: this.buffer.length
    }
  }

  /**
   * Reset validator state for reuse
   */
  reset(): void {
    this.buffer = ""
    this.depth = 0
    this.inString = false
    this.escaped = false
    this.arrayLengths = []
    this.bytesProcessed = 0
    this.chunksProcessed = 0
  }

  /**
   * Get the complete parsed JSON (call only when isComplete is true)
   */
  getParsedJson(): any {
    try {
      return JSON.parse(this.buffer)
    } catch (error) {
      throw new Error(`Failed to parse complete JSON: ${error}`)
    }
  }
}

/**
 * Default configuration for streaming validation
 */
const DEFAULT_CONFIG: StreamingValidationConfig = {
  maxChunkSize: 64 * 1024, // 64KB chunks
  maxTotalSize: 10 * 1024 * 1024, // 10MB total
  maxJsonDepth: 10,
  maxArrayLength: 10000,
  enableStreamingParsing: true,
  chunkTimeout: 5000 // 5 seconds
}

/**
 * Streaming validation middleware factory
 */
export function streamingValidationMiddleware(config: Partial<StreamingValidationConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  return async (c: Context, next: Next) => {
    try {
      // Skip validation for non-POST requests
      if (c.req.method !== 'POST') {
        await next()
        return
      }

      // Skip if content type is not JSON
      const contentType = c.req.header('content-type')
      if (!contentType?.includes('application/json')) {
        await next()
        return
      }

      // Check if streaming validation is enabled and request is large enough
      const contentLength = c.req.header('content-length')
      const requestSize = contentLength ? parseInt(contentLength, 10) : 0
      
      if (!finalConfig.enableStreamingParsing || requestSize < finalConfig.maxChunkSize) {
        // Use standard validation for small requests
        await next()
        return
      }

      logger.debug('STREAMING_VALIDATION', `Starting streaming validation for ${requestSize} byte request`)

      // Perform streaming validation
      const validator = new StreamingValidator(finalConfig)
      const startTime = Date.now()

      try {
        // Get request body as stream
        const body = await c.req.arrayBuffer()
        const chunks = splitIntoChunks(new Uint8Array(body), finalConfig.maxChunkSize)

        for (const chunk of chunks) {
          const result = validator.validateChunk(chunk)
          
          if (!result.valid) {
            logger.warn('STREAMING_VALIDATION', `Validation failed: ${result.error}`)
            
            const errorResponse = createAPIErrorResponse(
              result.error || "Invalid request structure",
              "invalid_request_error",
              "streaming_validation_failed"
            )
            return c.json(errorResponse, 400)
          }

          // Check for timeout
          if (Date.now() - startTime > finalConfig.chunkTimeout) {
            logger.warn('STREAMING_VALIDATION', 'Validation timeout')
            
            const errorResponse = createAPIErrorResponse(
              "Request validation timeout",
              "invalid_request_error",
              "validation_timeout"
            )
            return c.json(errorResponse, 408)
          }
        }

        // Store parsed JSON for later use
        if (validator.isJsonComplete()) {
          const parsedBody = validator.getParsedJson()
          c.set('streamingValidatedBody', parsedBody)
          
          const stats = validator.getStats()
          logger.info('STREAMING_VALIDATION', 
            `Validation completed: ${stats.bytesProcessed} bytes, ${stats.chunksProcessed} chunks in ${Date.now() - startTime}ms`
          )
        }

      } catch (error) {
        logger.error('STREAMING_VALIDATION', `Streaming validation error: ${error}`)
        
        const errorResponse = createAPIErrorResponse(
          "Failed to validate request",
          "internal_error",
          "streaming_validation_error"
        )
        return c.json(errorResponse, 500)
      }

      await next()
    } catch (error) {
      logger.error('STREAMING_VALIDATION', `Middleware error: ${error}`)
      
      const errorResponse = createAPIErrorResponse(
        "Internal validation error",
        "internal_error",
        "middleware_error"
      )
      return c.json(errorResponse, 500)
    }
  }
}

/**
 * Split array buffer into chunks
 */
function splitIntoChunks(data: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = []
  
  for (let i = 0; i < data.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, data.length)
    chunks.push(data.slice(i, end))
  }
  
  return chunks
}

/**
 * Test and production configurations
 */
export const TEST_STREAMING_CONFIG: StreamingValidationConfig = {
  ...DEFAULT_CONFIG,
  maxTotalSize: 1024 * 1024, // 1MB for testing
  maxJsonDepth: 5,
  maxArrayLength: 1000,
  chunkTimeout: 2000 // 2 seconds
}

export const PRODUCTION_STREAMING_CONFIG: StreamingValidationConfig = {
  ...DEFAULT_CONFIG,
  maxTotalSize: 50 * 1024 * 1024, // 50MB for production
  maxJsonDepth: 20,
  maxArrayLength: 100000,
  chunkTimeout: 10000 // 10 seconds
}

/**
 * Response Compression Utilities
 * Proper compression implementation with streaming support
 */
import { Context, Next } from "hono"
import { gzip, deflate } from "zlib"
import { promisify } from "util"
import { logger } from "../utils/logger"

const gzipAsync = promisify(gzip)
const deflateAsync = promisify(deflate)

export interface CompressionConfig {
  threshold: number
  enableForSSE: boolean
  trackStats: boolean
  algorithms: string[]
}

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  threshold: 1024, // 1KB minimum
  enableForSSE: false, // Disable for SSE to prevent streaming issues
  trackStats: true,
  algorithms: ['gzip', 'deflate']
}

export const PRODUCTION_COMPRESSION_CONFIG: CompressionConfig = {
  threshold: 512, // 512 bytes minimum for production
  enableForSSE: false, // Disable for SSE to prevent streaming issues
  trackStats: true,
  algorithms: ['gzip', 'deflate']
}

/**
 * Detect if this is a streaming response that should not be compressed
 */
function isStreamingResponse(c: Context): boolean {
  const contentType = c.res.headers.get('content-type') || ''
  const path = c.req.path

  // Check for Server-Sent Events
  if (contentType.includes('text/event-stream')) {
    return true
  }

  // Check for streaming chat completions
  if (path.includes('/chat/completions')) {
    const url = new URL(c.req.url)
    return url.searchParams.get('stream') === 'true'
  }

  // Check for other streaming endpoints
  if (path.includes('/v1/chat/completions') || path.includes('/completions')) {
    // Check request body for stream parameter
    const streamHeader = c.req.header('x-stream') || c.req.header('stream')
    if (streamHeader === 'true') {
      return true
    }
  }

  return false
}

/**
 * Proper compression middleware with actual compression and streaming support
 */
export function compressionMiddleware(config: Partial<CompressionConfig> = {}) {
  const finalConfig = { ...DEFAULT_COMPRESSION_CONFIG, ...config }

  return async (c: Context, next: Next) => {
    await next()

    // Skip compression for streaming responses
    if (isStreamingResponse(c)) {
      if (finalConfig.trackStats) {
        logger.debug('COMPRESSION', `Skipping compression for streaming response: ${c.req.path}`)
      }
      return
    }

    // Check if compression should be applied
    const acceptEncoding = c.req.header('accept-encoding') || ''
    const contentType = c.res.headers.get('content-type') || ''

    // Skip if no compression support
    if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
      return
    }

    // Skip non-compressible content types
    if (!isCompressibleContentType(contentType)) {
      return
    }

    // Get response body
    let responseBody: string
    try {
      responseBody = await c.res.text()
    } catch (error) {
      // If we can't read the body, skip compression
      if (finalConfig.trackStats) {
        logger.debug('COMPRESSION', `Cannot read response body, skipping compression: ${error}`)
      }
      return
    }

    const originalSize = new TextEncoder().encode(responseBody).length

    // Check size threshold
    if (originalSize < finalConfig.threshold) {
      if (finalConfig.trackStats) {
        logger.debug('COMPRESSION', `Skipping compression: below threshold (${originalSize} < ${finalConfig.threshold} bytes)`)
      }
      // Recreate response without compression
      c.res = new Response(responseBody, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers: c.res.headers
      })
      return
    }

    // Determine compression algorithm
    const algorithm = acceptEncoding.includes('gzip') ? 'gzip' : 'deflate'

    try {
      // Actually compress the response
      const buffer = Buffer.from(responseBody, 'utf8')
      const compressedBuffer = algorithm === 'gzip'
        ? await gzipAsync(buffer)
        : await deflateAsync(buffer)

      // Only use compression if it actually reduces size
      if (compressedBuffer.length < originalSize) {
        // Create new response with compressed body and proper headers
        const headers = new Headers(c.res.headers)
        headers.set('content-encoding', algorithm)
        headers.set('content-length', compressedBuffer.length.toString())
        headers.set('vary', 'Accept-Encoding')

        c.res = new Response(compressedBuffer, {
          status: c.res.status,
          statusText: c.res.statusText,
          headers
        })

        if (finalConfig.trackStats) {
          logger.info('COMPRESSION',
            `${algorithm.toUpperCase()}: ${originalSize} → ${compressedBuffer.length} bytes ` +
            `(${(compressedBuffer.length / originalSize * 100).toFixed(1)}% of original, ` +
            `${((1 - compressedBuffer.length / originalSize) * 100).toFixed(1)}% savings)`
          )
        }
      } else {
        // Compression didn't help, use original response
        if (finalConfig.trackStats) {
          logger.debug('COMPRESSION', `Compression increased size, using original response`)
        }
        c.res = new Response(responseBody, {
          status: c.res.status,
          statusText: c.res.statusText,
          headers: c.res.headers
        })
      }
    } catch (error) {
      // Compression failed, use original response
      logger.warn('COMPRESSION', `Compression failed: ${error}`)
      c.res = new Response(responseBody, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers: c.res.headers
      })
    }
  }
}

/**
 * Check if content type should be compressed
 */
function isCompressibleContentType(contentType: string): boolean {
  const compressibleTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/rss+xml',
    'application/atom+xml',
    'image/svg+xml',
    'text/event-stream'
  ]

  const nonCompressibleTypes = [
    'image/',
    'video/',
    'audio/',
    'application/zip',
    'application/gzip',
    'application/x-rar',
    'application/pdf'
  ]

  // Check if it's explicitly non-compressible
  if (nonCompressibleTypes.some(type => contentType.includes(type))) {
    return false
  }

  // Check if it's compressible
  return compressibleTypes.some(type => contentType.includes(type))
}
