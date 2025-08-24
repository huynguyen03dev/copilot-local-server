/**
 * Streaming Service
 * Handles streaming request processing and endpoint discovery
 */

import { logger } from '../utils/logger'
import {
  TIMEOUT_CONSTANTS,
  ENDPOINT_PATHS,
  HTTP_HEADERS,
  ERROR_CODES,
  PERFORMANCE_CONSTANTS
} from '../constants'
import { 
  ChatCompletionRequest, 
  type EndpointAttempt 
} from '../types'
import { StreamingErrorBoundary } from '../utils/errorBoundary'
import { connectionPool } from '../utils/connectionPool'
import { endpointLogger } from '../utils/logger'
import {
  StringBuffer,
  FastJSON,
  PerformanceMonitor,
  LRUCache
} from '../utils/performanceOptimizer'

export interface StreamingEndpointConfig {
  path: string
  format: number
}

export interface StreamingServiceConfig {
  timeoutMs: number
  maxRetries: number
  enableOptimizations: boolean
}

const DEFAULT_STREAMING_CONFIG: StreamingServiceConfig = {
  timeoutMs: TIMEOUT_CONSTANTS.STREAM_TIMEOUT_MS,
  maxRetries: 3,
  enableOptimizations: true
}

/**
 * Service for handling streaming operations
 */
export class StreamingService {
  private config: StreamingServiceConfig
  private endpointCache: LRUCache<string, StreamingEndpointConfig>
  private performanceMonitor: PerformanceMonitor

  constructor(config: Partial<StreamingServiceConfig> = {}) {
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config }
    this.endpointCache = new LRUCache<string, StreamingEndpointConfig>(PERFORMANCE_CONSTANTS.DEFAULT_CACHE_SIZE)
    this.performanceMonitor = PerformanceMonitor
  }

  /**
   * Handle streaming request with endpoint discovery and error handling
   */
  async handleStreamingRequest(
    token: string,
    request: ChatCompletionRequest,
    endpoint: string,
    stream: any,
    streamId: string
  ): Promise<void> {
    logger.debug('STREAMING_SERVICE', `Starting streaming request ${streamId}`)

    // Set up timeout for the entire streaming request
    const streamTimeout = this.setupStreamTimeout(stream, streamId)

    try {
      // Discover optimal endpoint
      const streamingEndpoint = await this.discoverStreamingEndpoint(token, request, endpoint)
      
      // Process streaming response
      await this.processStreamingResponse(streamingEndpoint, token, request, stream, streamId)
      
      clearTimeout(streamTimeout)
      logger.info('STREAMING_SERVICE', `Streaming request ${streamId} completed successfully`)
      
    } catch (error) {
      clearTimeout(streamTimeout)
      const streamError = error instanceof Error ? error : new Error("Unknown streaming error")
      logger.error('STREAMING_SERVICE', `Streaming request ${streamId} failed: ${streamError.message}`)
      throw streamError
    }
  }

  /**
   * Discover optimal streaming endpoint
   */
  private async discoverStreamingEndpoint(
    token: string,
    request: ChatCompletionRequest,
    baseEndpoint: string
  ): Promise<string> {
    const endpointConfigs = this.getEndpointConfigs()
    const attempts: EndpointAttempt[] = []
    let lastError: Error | null = null

    for (const config of endpointConfigs) {
      const apiUrl = `${baseEndpoint}${config.path}`

      try {
        const requestBody = this.buildStreamingRequestBody(request, config.format)
        
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: this.buildRequestHeaders(token),
          body: JSON.stringify(requestBody),
        })

        attempts.push({ url: apiUrl, status: response.status })

        if (response.ok) {
          // Log successful discovery
          endpointLogger.discovery(attempts, apiUrl)
          
          // Warmup connections for performance
          await this.warmupConnections(apiUrl)
          
          return apiUrl
        } else if (response.status === 404) {
          continue
        } else {
          // Non-404 error, log and continue
          const errorText = await response.text()
          attempts[attempts.length - 1].error = errorText
          lastError = new Error(`HTTP ${response.status}: ${errorText}`)
          continue
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        attempts.push({ url: apiUrl, status: 0, error: errorMsg })
        lastError = error instanceof Error ? error : new Error("Unknown error")
        continue
      }
    }

    // All endpoints failed
    const finalError = lastError || new Error("All Copilot endpoints failed for streaming request")
    logger.error('STREAMING_SERVICE', `Endpoint discovery failed: ${finalError.message}`)
    throw finalError
  }

  /**
   * Process streaming response from discovered endpoint
   */
  private async processStreamingResponse(
    apiUrl: string,
    token: string,
    request: ChatCompletionRequest,
    stream: any,
    streamId: string
  ): Promise<void> {
    const requestBody = this.buildStreamingRequestBody(request, 0) // Use standard format

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: this.buildRequestHeaders(token),
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    // Delegate to stream processor
    const streamProcessor = new StreamProcessor()
    await streamProcessor.processStream(response, stream, request, streamId, this.config.enableOptimizations)
  }

  /**
   * Build streaming request body based on format
   */
  private buildStreamingRequestBody(request: ChatCompletionRequest, format: number): any {
    const safeStopParam = this.getSafeStopParam(request.stop)

    const baseRequest = {
      model: request.model,
      messages: request.messages, // Assume already transformed
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens,
      stream: true,
      top_p: request.top_p,
      ...safeStopParam,
    }

    switch (format) {
      case 0:
        return baseRequest
      case 1:
        return { ...baseRequest, intent: true, n: 1 }
      case 2:
        return {
          prompt: request.messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          max_tokens: request.max_tokens || 150,
          temperature: request.temperature || 0.7,
          top_p: request.top_p || 1,
          n: 1,
          stream: true,
          ...safeStopParam,
        }
      default:
        return baseRequest
    }
  }

  /**
   * Build request headers
   */
  private buildRequestHeaders(token: string): Record<string, string> {
    return {
      [HTTP_HEADERS.AUTHORIZATION]: `Bearer ${token}`,
      [HTTP_HEADERS.CONTENT_TYPE]: "application/json",
      [HTTP_HEADERS.USER_AGENT]: "GitHubCopilotChat/0.26.7",
      "Editor-Version": "vscode/1.99.3",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
    }
  }

  /**
   * Get endpoint configurations for discovery
   */
  private getEndpointConfigs(): StreamingEndpointConfig[] {
    return [
      { path: ENDPOINT_PATHS.CHAT_COMPLETIONS, format: 0 },
      { path: ENDPOINT_PATHS.CHAT_COMPLETIONS_NO_V1, format: 0 },
      { path: ENDPOINT_PATHS.CHAT_COMPLETIONS, format: 1 },
      { path: "/v1/engines/copilot-codex/completions", format: 2 },
      { path: "/engines/copilot-codex/completions", format: 2 },
      { path: "/completions", format: 2 },
    ]
  }

  /**
   * Helper method for safe stop parameter handling
   */
  private getSafeStopParam(stop?: string | string[]) {
    if (stop === null || stop === undefined) {
      return {}
    }
    if (typeof stop === 'string' && stop.length > 0) {
      return { stop }
    }
    if (Array.isArray(stop) && stop.length > 0) {
      return { stop }
    }
    return {}
  }

  /**
   * Setup stream timeout
   */
  private setupStreamTimeout(stream: any, streamId: string): NodeJS.Timeout {
    return setTimeout(() => {
      logger.warn('STREAMING_SERVICE', `Stream ${streamId} timeout after ${this.config.timeoutMs}ms`)
      // Handle timeout - could close stream or send error
    }, this.config.timeoutMs)
  }

  /**
   * Warmup connections for performance
   */
  private async warmupConnections(apiUrl: string): Promise<void> {
    try {
      const urlObj = new URL(apiUrl)
      const origin = `${urlObj.protocol}//${urlObj.host}`
      await connectionPool.warmupConnections(origin, 2)
    } catch (error) {
      // Warmup is best-effort, don't fail the main request
      logger.debug('STREAMING_SERVICE', `Connection warmup failed: ${error}`)
    }
  }
}

/**
 * Stream processor for handling response streams
 */
export class StreamProcessor {
  /**
   * Process streaming response
   */
  async processStream(
    response: Response,
    stream: any,
    request: ChatCompletionRequest,
    streamId: string,
    useOptimizations: boolean = true
  ): Promise<void> {
    if (!response.body) {
      throw new Error("No response body available")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = Buffer.alloc(0)
    let chunkCount = 0
    let isAborted = false

    // Handle client abort
    stream.onAbort(() => {
      logger.info('STREAM_PROCESSOR', `Client aborted stream ${streamId}`)
      isAborted = true
      reader.releaseLock()
    })

    try {
      while (true) {
        if (isAborted) {
          logger.debug('STREAM_PROCESSOR', `Stream ${streamId} was aborted, stopping processing`)
          break
        }

        const { done, value } = await reader.read()
        if (done) {
          logger.info('STREAM_PROCESSOR', `Stream ${streamId} completed with ${chunkCount} chunks`)
          break
        }

        // Process chunk data
        buffer = Buffer.concat([buffer, Buffer.from(value)])
        const { completeLines, remainingBuffer } = this.extractCompleteLines(buffer)
        buffer = remainingBuffer

        for (const line of completeLines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              await stream.writeSSE({ data: '[DONE]' })
              logger.info('STREAM_PROCESSOR', `Stream ${streamId} finished with [DONE] signal`)
              return
            }

            // Process and write chunk
            await this.processAndWriteChunk(data, stream, request, streamId)
            chunkCount++
          }
        }
      }
    } catch (error) {
      logger.error('STREAM_PROCESSOR', `Error processing stream ${streamId}: ${error}`)
      throw error
    } finally {
      if (!isAborted) {
        reader.releaseLock()
      }
    }
  }

  /**
   * Extract complete lines from buffer
   */
  private extractCompleteLines(buffer: Buffer): { completeLines: string[]; remainingBuffer: Buffer } {
    const decoder = new TextDecoder()
    const text = decoder.decode(buffer)
    const lines = text.split('\n')

    // Last element might be incomplete if buffer doesn't end with \n
    const remainingText = lines.pop() || ''
    const remainingBuffer = Buffer.from(remainingText)

    return {
      completeLines: lines,
      remainingBuffer
    }
  }

  /**
   * Process and write individual chunk
   */
  private async processAndWriteChunk(
    data: string,
    stream: any,
    request: ChatCompletionRequest,
    streamId: string
  ): Promise<void> {
    try {
      const chunk = FastJSON.parse(data)
      if (!chunk) {
        logger.warn('STREAM_PROCESSOR', `Skipping invalid JSON chunk in stream ${streamId}`)
        return
      }

      // Transform chunk if needed (implement transformation logic)
      const transformedChunk = this.transformChunk(chunk, request)
      const chunkData = FastJSON.safeStringify(transformedChunk, '{}')

      await stream.writeSSE({ data: chunkData })
    } catch (error) {
      logger.warn('STREAM_PROCESSOR', `Skipping malformed chunk in stream ${streamId}: ${error}`)
    }
  }

  /**
   * Transform chunk for compatibility
   */
  private transformChunk(chunk: any, request: ChatCompletionRequest): any {
    // Implement chunk transformation logic here
    // This would be similar to transformCopilotStreamChunk in the original code
    return {
      id: chunk.id || `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: chunk.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices: chunk.choices || [],
      usage: chunk.usage
    }
  }
}
