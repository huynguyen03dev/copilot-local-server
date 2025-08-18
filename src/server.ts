import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger as honoLogger } from "hono/logger"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { GitHubCopilotAuth } from "./auth"
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamChunk,
  ErrorFactory,
  toAPIErrorResponse
} from "./types"
import { createAPIErrorResponse } from "./types/errors"
import {
  validateContent,
  transformMessagesForCopilot,
  getContentStats
} from "./utils/content"
import {
  logger,
  streamLogger,
  endpointLogger,
  modelLogger,
  memoryLogger,
  type EndpointAttempt
} from "./utils/logger"
import { config, logConfiguration } from "./config"
import { securityConfig } from "./config/security"
import { correlationMiddleware } from "./middleware/correlation"
import { requestSizeMiddleware, TEST_LIMITS, PRODUCTION_LIMITS } from "./middleware/requestSize"
import {
  StreamingErrorBoundary,
  NetworkErrorBoundary
} from "./utils/errorBoundary"

export class CopilotAPIServer {
  private app: Hono
  private port: number
  private hostname: string

  // Connection management
  private activeStreams = new Set<string>()
  private streamingRateLimit = new Map<string, number>()
  private readonly MAX_CONCURRENT_STREAMS = config.server.maxConcurrentStreams
  private readonly RATE_LIMIT_INTERVAL = config.streaming.rateLimitInterval
  private readonly IS_TEST_ENVIRONMENT = process.env.NODE_ENV === 'test'

  // Performance monitoring
  private streamMetrics = {
    totalRequests: 0,
    successfulStreams: 0,
    failedStreams: 0,
    totalChunks: 0,
    totalBytes: 0,
    averageStreamDuration: 0,
    peakConcurrentStreams: 0,
    startTime: Date.now()
  }

  // Memory management
  private readonly MAX_BUFFER_SIZE = config.streaming.maxBufferSize
  private readonly MEMORY_CHECK_INTERVAL = config.monitoring.memoryCheckInterval
  private memoryMonitor: NodeJS.Timeout | null = null

  // Server instance for graceful shutdown
  private server: any = null

  constructor(
    port: number = config.server.port,
    hostname: string = config.server.hostname
  ) {
    this.port = port
    this.hostname = hostname
    this.app = new Hono()

    // Log configuration on startup
    logConfiguration()

    this.setupMiddleware()
    this.setupRoutes()
    this.setupConnectionMonitoring()
  }

  private setupMiddleware() {
    // Enable request correlation tracking (must be first)
    this.app.use("*", correlationMiddleware)

    // Enable CORS with configurable security settings
    this.app.use("*", cors({
      origin: securityConfig.cors.origins,
      credentials: securityConfig.cors.credentials,
      allowMethods: securityConfig.cors.methods,
      allowHeaders: securityConfig.cors.headers,
    }))

    // Request logging (after correlation middleware)
    this.app.use("*", honoLogger())

    // Request size validation middleware (after logging, before route handlers)
    this.app.use("*", requestSizeMiddleware(this.IS_TEST_ENVIRONMENT ? TEST_LIMITS : PRODUCTION_LIMITS))

    // Error handler
    this.app.onError((err, c) => {
      logger.error('SERVER', `Server error: ${err.message}`)

      // Create typed error
      const serverError = ErrorFactory.server(
        'INTERNAL_ERROR',
        err.message || "Internal server error",
        c.req.path,
        c.req.method
      )

      // Convert to API response format
      const errorResponse = toAPIErrorResponse(serverError)
      return c.json(errorResponse, 500)
    })

    // 404 handler for unmatched routes
    this.app.notFound((c) => {
      const errorResponse = createAPIErrorResponse(
        `Endpoint not found: ${c.req.method} ${c.req.path}`,
        "not_found_error",
        "ENDPOINT_NOT_FOUND"
      )
      return c.json(errorResponse, 404)
    })
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get("/", (c) => {
      return c.json({
        status: "healthy",
        service: "GitHub Copilot API Server",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.streamMetrics.startTime) / 1000),
        activeStreams: this.activeStreams.size,
        maxStreams: this.MAX_CONCURRENT_STREAMS
      })
    })

    // Metrics endpoint for monitoring
    this.app.get("/metrics", (c) => {
      const uptime = Date.now() - this.streamMetrics.startTime
      const uptimeHours = Math.round(uptime / (1000 * 60 * 60) * 100) / 100

      return c.json({
        uptime: {
          milliseconds: uptime,
          hours: uptimeHours,
          human: this.formatUptime(uptime)
        },
        streams: {
          active: this.activeStreams.size,
          maxConcurrent: this.MAX_CONCURRENT_STREAMS,
          peakConcurrent: this.streamMetrics.peakConcurrentStreams,
          total: this.streamMetrics.totalRequests,
          successful: this.streamMetrics.successfulStreams,
          failed: this.streamMetrics.failedStreams,
          successRate: this.getSuccessRate()
        },
        performance: {
          totalChunks: this.streamMetrics.totalChunks,
          totalBytes: this.streamMetrics.totalBytes,
          averageStreamDuration: Math.round(this.streamMetrics.averageStreamDuration),
          chunksPerSecond: Math.round(this.streamMetrics.totalChunks / (uptime / 1000)),
          bytesPerSecond: Math.round(this.streamMetrics.totalBytes / (uptime / 1000))
        },
        memory: process.memoryUsage(),
        rateLimiting: {
          activeClients: this.streamingRateLimit.size,
          intervalMs: this.RATE_LIMIT_INTERVAL
        },
        timestamp: new Date().toISOString()
      })
    })

    // Authentication status
    this.app.get("/auth/status", async (c) => {
      const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
      return c.json({ authenticated: isAuthenticated })
    })

    // Start authentication flow
    this.app.post("/auth/start", async (c) => {
      try {
        const authData = await GitHubCopilotAuth.authorize()
        return c.json({
          device_code: authData.device,
          user_code: authData.user,
          verification_uri: authData.verification,
          interval: authData.interval,
          expires_in: authData.expiry,
          message: `Please visit ${authData.verification} and enter code: ${authData.user}`
        })
      } catch (error) {
        const errorResponse = createAPIErrorResponse(
          error instanceof Error ? error.message : "Authentication failed",
          "auth_error",
          "AUTHENTICATION_FAILED"
        )
        return c.json(errorResponse, 400)
      }
    })

    // Poll for authentication completion
    this.app.post("/auth/poll", async (c) => {
      const body = await c.req.json()
      const deviceCode = body.device_code

      if (!deviceCode) {
        const errorResponse = createAPIErrorResponse(
          "device_code is required",
          "invalid_request_error",
          "MISSING_DEVICE_CODE",
          "device_code"
        )
        return c.json(errorResponse, 400)
      }

      try {
        const result = await GitHubCopilotAuth.poll(deviceCode)
        return c.json({
          status: result.status,
          error: result.error,
          error_description: result.errorDescription
        })
      } catch (error) {
        const errorResponse = createAPIErrorResponse(
          error instanceof Error ? error.message : "Polling failed",
          "auth_error",
          "POLLING_FAILED"
        )
        return c.json(errorResponse, 400)
      }
    })

    // Clear authentication
    this.app.post("/auth/clear", async (c) => {
      await GitHubCopilotAuth.clearAuth()
      return c.json({ message: "Authentication cleared" })
    })

    // Complete authentication flow (alternative to manual polling)
    this.app.post("/auth/complete", async (c) => {
      try {
        const result = await GitHubCopilotAuth.authenticateWithFlow()

        if (result.success) {
          return c.json({
            success: true,
            message: "Authentication completed successfully"
          })
        } else {
          return c.json({
            success: false,
            error: result.error,
            error_description: result.errorDescription,
            message: "Authentication failed"
          }, 400)
        }
      } catch (error) {
        const errorResponse = createAPIErrorResponse(
          error instanceof Error ? error.message : "Authentication flow failed",
          "auth_error",
          "AUTHENTICATION_FLOW_FAILED"
        )
        return c.json(errorResponse, 500)
      }
    })

    // Handle unsupported HTTP methods for chat completions endpoint
    this.app.all("/v1/chat/completions", async (c, next) => {
      if (c.req.method !== "POST") {
        const errorResponse = createAPIErrorResponse(
          `Method ${c.req.method} not allowed. Only POST is supported.`,
          "method_not_allowed_error",
          "METHOD_NOT_ALLOWED"
        )
        c.header("Allow", "POST")
        return c.json(errorResponse, 405)
      }
      await next()
    })

    // OpenAI-compatible chat completions endpoint
    this.app.post(
      "/v1/chat/completions",
      zValidator("json", ChatCompletionRequest, (result, c) => {
        if (!result.success) {
          const errorMessage = result.error.issues.map(issue =>
            `${issue.path.join('.')}: ${issue.message}`
          ).join(', ')

          const errorResponse = createAPIErrorResponse(
            errorMessage,
            "invalid_request_error",
            "VALIDATION_ERROR"
          )
          return c.json(errorResponse, 400)
        }
      }),
      async (c) => {
        const body = c.req.valid("json")

        // Validate content format for all messages
        for (let i = 0; i < body.messages.length; i++) {
          const message = body.messages[i]
          const validation = validateContent(message.content)
          if (!validation.isValid) {
            const errorResponse = createAPIErrorResponse(
              `Invalid content in message ${i}: ${validation.error}`,
              "invalid_request_error",
              "invalid_content_format"
            )
            return c.json(errorResponse, 400)
          }

          // Log content statistics for debugging
          const stats = getContentStats(message.content)
          if (stats.type === "array") {
            logger.debug('CONTENT', `📝 Message ${i}: ${stats.textBlocks} text block(s), ${stats.imageBlocks} image(s), ${stats.totalLength} chars`)
          }
        }

        // Check authentication
        const token = await GitHubCopilotAuth.getAccessToken()
        if (!token) {
          const errorResponse = createAPIErrorResponse(
            "Not authenticated with GitHub Copilot. Please authenticate first.",
            "authentication_error",
            "invalid_api_key"
          )
          return c.json(errorResponse, 401)
        }

        try {
          // Get the dynamic Copilot endpoint
          const endpoint = await GitHubCopilotAuth.getCopilotEndpoint()

          // Handle streaming vs non-streaming requests
          if (body.stream) {
            // Check rate limiting and connection limits
            const clientId = this.getClientId(c)

            if (!this.checkStreamingRateLimit(clientId)) {
              const errorResponse = createAPIErrorResponse(
                "Rate limit exceeded. Please wait before making another streaming request.",
                "rate_limit_error",
                "rate_limit_exceeded"
              )
              return c.json(errorResponse, 429)
            }

            if (this.activeStreams.size >= this.MAX_CONCURRENT_STREAMS) {
              const errorResponse = createAPIErrorResponse(
                "Server is at maximum capacity for streaming requests. Please try again later.",
                "capacity_error",
                "max_streams_exceeded"
              )
              return c.json(errorResponse, 503)
            }

            // Use Hono's streamSSE for streaming responses with error boundaries
            return streamSSE(c, async (stream) => {
              const streamId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
              const startTime = Date.now()
              this.trackStream(streamId)

              // Wrap streaming operation in error boundary
              const result = await StreamingErrorBoundary.handleStreamingOperation(
                async () => {
                  await this.forwardToCopilotStreaming(token, body, endpoint, stream, streamId)
                },
                streamId,
                {
                  retryAttempts: 1,
                  retryDelay: 1000,
                  timeoutMs: this.IS_TEST_ENVIRONMENT ? 30000 : 60000, // 30s for tests, 60s for production
                  category: 'STREAMING'
                }
              )

              const duration = Date.now() - startTime

              if (result.success) {
                this.updateStreamMetrics(streamId, true, duration)
                streamLogger.complete({
                  streamId,
                  chunkCount: 0, // Will be updated by the streaming method
                  duration,
                  startTime
                })
              } else {
                this.updateStreamMetrics(streamId, false, duration)

                // Handle streaming error with proper error boundary
                const streamingError = result.error || StreamingErrorBoundary.createStreamingError(
                  'STREAM_FAILED',
                  'Streaming operation failed after retries',
                  streamId
                )

                await this.handleStreamingError(
                  stream,
                  new Error(streamingError.message),
                  `streaming-boundary-${streamId}`
                )
              }

              this.untrackStream(streamId)
            })
          } else {
            // Forward request to GitHub Copilot API (non-streaming)
            const copilotResponse = await this.forwardToCopilot(token, body, endpoint)
            return c.json(copilotResponse)
          }
        } catch (error) {
          console.error("Copilot API error:", error)
          const errorResponse = createAPIErrorResponse(
            error instanceof Error ? error.message : "Failed to process request",
            "api_error",
            "REQUEST_FAILED"
          )
          return c.json(errorResponse, 500)
        }
      }
    )

    // List available models (mock response for compatibility)
    this.app.get("/v1/models", async (c) => {
      const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
      
      if (!isAuthenticated) {
        const errorResponse = createAPIErrorResponse(
          "Not authenticated",
          "authentication_error",
          "UNAUTHENTICATED"
        )
        return c.json(errorResponse, 401)
      }

      return c.json({
        object: "list",
        data: [
          {
            id: "gpt-4o",
            object: "model", 
            created: Date.now(),
            owned_by: "github-copilot"
          },
          {
            id: "gpt-4.1",
            object: "model",
            created: Date.now(),
            owned_by: "github-copilot"
          },
          {
            id: "claude-sonnet-4",
            object: "model",
            created: Date.now(),
            owned_by: "github-copilot"
          },
          {
            id: "gemini-2.0-flash-001",
            object: "model",
            created: Date.now(),
            owned_by: "github-copilot"
          },
          {
            id: "gpt-5-mini",
            object: "model",
            created: Date.now(),
            owned_by: "github-copilot"
          },
          {
            id: "o4-mini",
            object: "model",
            created: Date.now(),
            owned_by: "github-copilot"
          },
          {
            id: "o3-mini",
            object: "model",
            created: Date.now(),
            owned_by: "github-copilot"
          },
          {
            id: "gemini-2.5-pro",
            object: "model",
            created: Date.now(),
            owned_by: "github-copilot"
          }
        ]
      })
    })
  }

  private async forwardToCopilot(token: string, request: ChatCompletionRequest, endpoint: string): Promise<ChatCompletionResponse> {
    // Helper function to safely include stop parameter
    const safeStopParam = (stop?: string | string[]) => {
      if (stop === null || stop === undefined) {
        return {} // Omit the parameter entirely
      }
      if (typeof stop === 'string' && stop.length > 0) {
        return { stop }
      }
      if (Array.isArray(stop) && stop.length > 0) {
        return { stop }
      }
      return {} // Omit if empty string or empty array
    }

    // Transform messages to text-only format for GitHub Copilot compatibility
    const transformedMessages = transformMessagesForCopilot(request.messages)
    console.log(`🔄 Transformed ${request.messages.length} message(s) for Copilot compatibility`)

    // Transform request to Copilot format - try different formats
    const baseRequest = {
      model: request.model,
      messages: transformedMessages,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens,
      stream: false, // For now, we'll handle non-streaming only
      top_p: request.top_p,
      ...safeStopParam(request.stop), // Safely include stop parameter
    }

    // Different request formats for different endpoints
    const requestFormats = [
      baseRequest, // Standard OpenAI format
      {
        ...baseRequest,
        intent: true, // Some Copilot endpoints expect this
        n: 1,
      },
      {
        // Legacy Copilot format - use transformed messages with text-only content
        prompt: transformedMessages.map(m => `${m.role}: ${m.content}`).join('\n'),
        max_tokens: request.max_tokens || 150,
        temperature: request.temperature || 0.7,
        top_p: request.top_p || 1,
        n: 1,
        stream: false,
        ...safeStopParam(request.stop), // Safely include stop parameter (no null!)
      }
    ]

    // Try multiple endpoint paths with different request formats
    const endpointConfigs = [
      { path: "/v1/chat/completions", format: 0 },           // Standard OpenAI format
      { path: "/chat/completions", format: 0 },              // Without v1 prefix
      { path: "/v1/chat/completions", format: 1 },           // OpenAI with intent
      { path: "/v1/engines/copilot-codex/completions", format: 2 }, // Old Copilot format
      { path: "/engines/copilot-codex/completions", format: 2 },    // Old format without v1
      { path: "/completions", format: 2 },                   // Simple format
    ]

    let lastError: Error | null = null

    for (const config of endpointConfigs) {
      const apiUrl = `${endpoint}${config.path}`
      const requestBody = requestFormats[config.format]
      console.log(`Trying request to: ${apiUrl} with format ${config.format}`)
      console.log(`Request body:`, JSON.stringify(requestBody, null, 2))

      // Wrap network request in error boundary
      const networkResult = await NetworkErrorBoundary.handleRequest(
        async () => {
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "User-Agent": "GitHubCopilotChat/0.26.7",
              "Editor-Version": "vscode/1.99.3",
              "Editor-Plugin-Version": "copilot-chat/0.26.7",
            },
            body: JSON.stringify(requestBody),
          })

          if (response.ok) {
            const copilotResponse = await response.json()
            const actualModel = copilotResponse.model || request.model || 'unknown'
            logger.info('ENDPOINT', `✅ Non-streaming success: ${apiUrl}`)
            logger.info('MODEL', `🤖 Non-streaming response using model: ${actualModel}`)
            logger.debug('RESPONSE', `Copilot response received: ${JSON.stringify(copilotResponse, null, 2)}`)
            return this.transformCopilotResponse(copilotResponse, request)
          } else if (response.status === 404) {
            throw new Error(`Endpoint not found: ${apiUrl}`)
          } else {
            const errorText = await response.text()
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }
        },
        apiUrl,
        {
          retryAttempts: 1,
          retryDelay: 500,
          timeoutMs: 15000,
          category: 'NETWORK'
        }
      )

      if (networkResult.success && networkResult.data) {
        return networkResult.data
      } else {
        const error = networkResult.error
        if (error) {
          if (error.message.includes('404') || error.message.includes('not found')) {
            logger.debug('ENDPOINT', `❌ 404 for endpoint: ${apiUrl}, trying next...`)
          } else {
            logger.warn('ENDPOINT', `❌ Request failed for endpoint: ${apiUrl} - ${error.message}`)
          }
          lastError = new Error(error.message)
        }
        continue
      }
    }

    // If we get here, all endpoints failed
    throw new Error(`All Copilot API endpoints failed. Last error: ${lastError?.message || "Unknown error"}`)
  }

  private transformCopilotResponse(copilotResponse: unknown, request: ChatCompletionRequest): ChatCompletionResponse {
    // Type guard and safe property access
    const response = copilotResponse as Record<string, unknown>
    const responseId = typeof response?.id === 'string' ? response.id : `chatcmpl-${Date.now()}`
    const responseCreated = typeof response?.created === 'number' ? response.created : Math.floor(Date.now() / 1000)
    const responseChoices = Array.isArray(response?.choices) ? response.choices : []
    const responseUsage = response?.usage && typeof response.usage === 'object' ? response.usage as Record<string, unknown> : undefined

    // Extract content from various possible response formats
    let content = "No response from Copilot"
    if (typeof response?.content === 'string') {
      content = response.content
    } else if (response?.message && typeof response.message === 'object') {
      const message = response.message as Record<string, unknown>
      if (typeof message?.content === 'string') {
        content = message.content
      }
    } else if (responseChoices.length > 0) {
      const firstChoice = responseChoices[0] as Record<string, unknown>
      if (firstChoice?.message && typeof firstChoice.message === 'object') {
        const message = firstChoice.message as Record<string, unknown>
        if (typeof message?.content === 'string') {
          content = message.content
        }
      }
    }

    // Transform response to OpenAI format
    const openAIResponse: ChatCompletionResponse = {
      id: responseId,
      object: "chat.completion",
      created: responseCreated,
      model: request.model,
      choices: responseChoices.length > 0 ? responseChoices.map((choice, index) => {
        const choiceObj = choice as Record<string, unknown>
        return {
          index,
          message: {
            role: "assistant",
            content: typeof choiceObj?.message === 'object' && choiceObj.message !== null
              ? (choiceObj.message as Record<string, unknown>)?.content as string || content
              : content
          },
          finish_reason: typeof choiceObj?.finish_reason === 'string' ? choiceObj.finish_reason : "stop"
        }
      }) : [{
        index: 0,
        message: {
          role: "assistant",
          content
        },
        finish_reason: "stop"
      }],
      usage: responseUsage ? {
        prompt_tokens: typeof responseUsage.prompt_tokens === 'number' ? responseUsage.prompt_tokens : 0,
        completion_tokens: typeof responseUsage.completion_tokens === 'number' ? responseUsage.completion_tokens : 0,
        total_tokens: typeof responseUsage.total_tokens === 'number' ? responseUsage.total_tokens : 0
      } : undefined
    }

    return openAIResponse
  }

  private async forwardToCopilotStreaming(
    token: string,
    request: ChatCompletionRequest,
    endpoint: string,
    stream: any,
    streamId: string
  ): Promise<void> {
    logger.debug('STREAM', `🔄 Starting streaming request ${streamId}`)

    // Set up timeout for the entire streaming request
    const streamTimeout = this.setupStreamTimeout(stream, streamId, 300000) // 5 minutes

    try {
      // Helper function to safely include stop parameter
      const safeStopParam = (stop?: string | string[]) => {
        if (stop === null || stop === undefined) {
          return {} // Omit the parameter entirely
        }
        if (typeof stop === 'string' && stop.length > 0) {
          return { stop }
        }
        if (Array.isArray(stop) && stop.length > 0) {
          return { stop }
        }
        return {} // Omit if empty string or empty array
      }

    // Transform messages to text-only format for GitHub Copilot compatibility
    const transformedMessages = transformMessagesForCopilot(request.messages)
    logger.debug('STREAM', `🔄 Streaming: Transformed ${request.messages.length} message(s) for Copilot compatibility`)

    const requestBody = {
      model: request.model,
      messages: transformedMessages,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens,
      stream: true, // Enable streaming for Copilot
      top_p: request.top_p,
      ...safeStopParam(request.stop),
    }

    // Try multiple endpoint paths with different request formats
    const endpointConfigs = [
      { path: "/v1/chat/completions", format: 0 },           // Standard OpenAI format
      { path: "/chat/completions", format: 0 },              // Without v1 prefix
      { path: "/v1/chat/completions", format: 1 },           // OpenAI with intent
      { path: "/v1/engines/copilot-codex/completions", format: 2 }, // Old Copilot format
      { path: "/engines/copilot-codex/completions", format: 2 },    // Old format without v1
      { path: "/completions", format: 2 },                   // Simple format
    ]

    let lastError: Error | null = null
    const attempts: EndpointAttempt[] = []

    for (const config of endpointConfigs) {
      const apiUrl = `${endpoint}${config.path}`

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "GitHubCopilotChat/0.26.7",
            "Editor-Version": "vscode/1.99.3",
            "Editor-Plugin-Version": "copilot-chat/0.26.7",
          },
          body: JSON.stringify(requestBody),
        })

        attempts.push({ url: apiUrl, status: response.status })

        if (response.ok) {
          // Use consolidated endpoint discovery logging
          endpointLogger.discovery(attempts, apiUrl)
          await this.processStreamingResponse(response, stream, request, streamId, apiUrl)
          clearTimeout(streamTimeout)
          logger.info('STREAM', `🎉 Streaming request ${streamId} completed successfully`)
          return
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

    // If we get here, all endpoints failed
    clearTimeout(streamTimeout)
    const finalError = lastError || new Error("All Copilot endpoints failed for streaming request")
    await this.handleStreamingError(stream, finalError, `streaming-${streamId}`)
    throw finalError
    } catch (error) {
      clearTimeout(streamTimeout)
      const streamError = error instanceof Error ? error : new Error("Unknown streaming error")
      await this.handleStreamingError(stream, streamError, `streaming-${streamId}`)
      throw streamError
    }
  }

  private async processStreamingResponse(
    response: Response,
    stream: any,
    request: ChatCompletionRequest,
    streamId: string,
    apiUrl?: string
  ): Promise<void> {
    const startTime = Date.now()
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body reader available")
    }

    const decoder = new TextDecoder()
    let buffer = ""
    let chunkCount = 0
    let lastActivityTime = Date.now()
    let actualModel: string | null = null
    let modelLogged = false
    const CHUNK_TIMEOUT = 30000 // 30 seconds between chunks

    // Handle client abort
    let isAborted = false
    stream.onAbort(() => {
      console.log(`🚫 Client aborted streaming request ${streamId}`)
      isAborted = true
      reader.releaseLock()
    })

    // Set up chunk timeout monitoring
    const chunkTimeoutInterval = setInterval(() => {
      if (Date.now() - lastActivityTime > CHUNK_TIMEOUT) {
        logger.warn('STREAM', `⏰ Chunk timeout for stream ${streamId}, last activity: ${Date.now() - lastActivityTime}ms ago`)
        clearInterval(chunkTimeoutInterval)
        reader.releaseLock()
        throw new Error("Streaming chunk timeout - no data received for 30 seconds")
      }
    }, 5000) // Check every 5 seconds

    try {
      while (true) {
        if (isAborted) {
          logger.debug('STREAM', `🚫 Stream ${streamId} was aborted, stopping processing`)
          break
        }

        const { done, value } = await reader.read()
        if (done) {
          const duration = Date.now() - startTime
          streamLogger.complete({
            streamId,
            chunkCount,
            model: actualModel || undefined,
            duration
          })
          break
        }

        lastActivityTime = Date.now()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              await stream.writeSSE({ data: '[DONE]' })
              console.log(`✅ Stream ${streamId} finished with [DONE] signal${actualModel ? ` (model: ${actualModel})` : ''}`)
              return
            }

            // Process chunk with error boundary
            const chunkResult = StreamingErrorBoundary.handleChunkProcessing(
              () => {
                const chunk = JSON.parse(data)

                // Capture the actual model from the first chunk
                if (!modelLogged && chunk.model) {
                  actualModel = chunk.model
                  modelLogger.info(streamId, chunk.model, apiUrl ?? 'unknown')
                  modelLogged = true
                }

                const transformedChunk = this.transformCopilotStreamChunk(chunk, request)
                return {
                  chunk,
                  transformedChunk,
                  chunkData: JSON.stringify(transformedChunk)
                }
              },
              streamId,
              chunkCount
            )

            if (chunkResult.success && chunkResult.data) {
              try {
                // Implement backpressure handling with error boundary
                await this.writeWithBackpressure(stream, chunkResult.data.chunkData, streamId)

                chunkCount++
                this.streamMetrics.totalChunks++
                this.streamMetrics.totalBytes += chunkResult.data.chunkData.length
              } catch (writeError) {
                logger.error('STREAM', `💥 Failed to write chunk ${chunkCount} for stream ${streamId}: ${writeError}`)
                throw StreamingErrorBoundary.createStreamingError(
                  'STREAM_FAILED',
                  `Failed to write chunk: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`,
                  streamId,
                  chunkCount
                )
              }
            } else {
              logger.warn('STREAM', `⚠️ Skipping malformed chunk ${chunkCount} for stream ${streamId}`)
              continue
            }

            // Log progress with adaptive frequency
            streamLogger.progress({
              streamId,
              chunkCount,
              model: actualModel || undefined,
              startTime
            })
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing stream ${streamId}:`, error)
      throw error
    } finally {
      clearInterval(chunkTimeoutInterval)
      if (!isAborted) {
        reader.releaseLock()
      }
    }
  }

  private transformCopilotStreamChunk(
    copilotChunk: unknown,
    request: ChatCompletionRequest
  ): ChatCompletionStreamChunk {
    // Type guard and safe property access
    const chunk = copilotChunk as Record<string, unknown>
    const chunkId = typeof chunk?.id === 'string' ? chunk.id : `chatcmpl-${Date.now()}`
    const chunkCreated = typeof chunk?.created === 'number' ? chunk.created : Math.floor(Date.now() / 1000)
    const chunkChoices = Array.isArray(chunk?.choices) ? chunk.choices : []
    const chunkUsage = chunk?.usage && typeof chunk.usage === 'object' ? chunk.usage as Record<string, unknown> : undefined

    return {
      id: chunkId,
      object: "chat.completion.chunk",
      created: chunkCreated,
      model: request.model,
      choices: chunkChoices.length > 0 ? chunkChoices.map((choice, index) => {
        const choiceObj = choice as Record<string, unknown>
        const delta = choiceObj?.delta as Record<string, unknown> | undefined
        // Validate role is one of the allowed values
        const roleValue = typeof delta?.role === 'string' ? delta.role : undefined
        const validRole = roleValue === 'system' || roleValue === 'user' || roleValue === 'assistant' ? roleValue : undefined

        return {
          index: typeof choiceObj?.index === 'number' ? choiceObj.index : index,
          delta: {
            role: validRole,
            content: typeof delta?.content === 'string' ? delta.content : undefined,
          },
          finish_reason: typeof choiceObj?.finish_reason === 'string' ? choiceObj.finish_reason : null,
        }
      }) : [{
        index: 0,
        delta: {
          content: typeof chunk?.content === 'string' ? chunk.content : "",
        },
        finish_reason: null,
      }],
      usage: chunkUsage ? {
        prompt_tokens: typeof chunkUsage.prompt_tokens === 'number' ? chunkUsage.prompt_tokens : 0,
        completion_tokens: typeof chunkUsage.completion_tokens === 'number' ? chunkUsage.completion_tokens : 0,
        total_tokens: typeof chunkUsage.total_tokens === 'number' ? chunkUsage.total_tokens : 0
      } : undefined,
    }
  }

  /**
   * Handle streaming errors by sending error chunk to client
   */
  private async handleStreamingError(
    stream: any,
    error: Error,
    context: string
  ): Promise<void> {
    logger.error('STREAM', `💥 Streaming error in ${context}: ${error.message}`)

    try {
      await stream.writeSSE({
        data: JSON.stringify({
          error: {
            message: error.message,
            type: "stream_error",
            code: "streaming_failed"
          }
        })
      })

      // Send [DONE] to properly close the stream
      await stream.writeSSE({ data: '[DONE]' })
    } catch (writeError) {
      logger.error('STREAM', `💥 Failed to write error to stream in ${context}: ${writeError}`)
    }
  }

  /**
   * Set up timeout for streaming requests
   */
  private setupStreamTimeout(stream: any, streamId: string, timeoutMs: number = 300000): NodeJS.Timeout {
    return setTimeout(async () => {
      logger.warn('STREAM', `⏰ Stream timeout for ${streamId} after ${timeoutMs}ms`)
      await this.handleStreamingError(
        stream,
        new Error(`Stream timeout after ${timeoutMs / 1000} seconds`),
        `timeout-${streamId}`
      )
    }, timeoutMs)
  }

  /**
   * Set up connection monitoring
   */
  private setupConnectionMonitoring(): void {
    // Monitor active streams every minute
    setInterval(() => {
      const currentActive = this.activeStreams.size

      // Update peak concurrent streams
      if (currentActive > this.streamMetrics.peakConcurrentStreams) {
        this.streamMetrics.peakConcurrentStreams = currentActive
      }

      logger.info('MONITOR', `📊 Active streams: ${currentActive}/${this.MAX_CONCURRENT_STREAMS}`)
      logger.info('MONITOR', `📈 Peak concurrent: ${this.streamMetrics.peakConcurrentStreams}`)
      logger.info('MONITOR', `📊 Total requests: ${this.streamMetrics.totalRequests}`)
      logger.info('MONITOR', `✅ Success rate: ${this.getSuccessRate()}%`)

      // Clean up old rate limit entries (older than 5 minutes)
      const fiveMinutesAgo = Date.now() - 300000
      for (const [clientId, timestamp] of this.streamingRateLimit.entries()) {
        if (timestamp < fiveMinutesAgo) {
          this.streamingRateLimit.delete(clientId)
        }
      }
    }, 60000) // Every minute

    // Set up memory monitoring
    this.memoryMonitor = setInterval(() => {
      this.checkMemoryUsage()
    }, this.MEMORY_CHECK_INTERVAL)
  }

  /**
   * Get client identifier for rate limiting
   */
  private getClientId(c: any): string {
    // Use IP address as client identifier
    const forwarded = c.req.header('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : c.req.header('x-real-ip') || 'unknown'
    return ip
  }

  /**
   * Check streaming rate limit for a client
   */
  private checkStreamingRateLimit(clientId: string): boolean {
    // In test environment, be more lenient with rate limiting
    if (this.IS_TEST_ENVIRONMENT) {
      // Allow more frequent requests in test environment
      const testInterval = this.RATE_LIMIT_INTERVAL / 10 // 100ms instead of 1000ms
      const now = Date.now()
      const lastRequest = this.streamingRateLimit.get(clientId) || 0

      if (now - lastRequest < testInterval) {
        return false
      }

      this.streamingRateLimit.set(clientId, now)
      return true
    }

    // Production rate limiting
    const now = Date.now()
    const lastRequest = this.streamingRateLimit.get(clientId) || 0

    if (now - lastRequest < this.RATE_LIMIT_INTERVAL) {
      return false
    }

    this.streamingRateLimit.set(clientId, now)
    return true
  }

  /**
   * Track an active streaming connection
   */
  private trackStream(streamId: string): void {
    this.activeStreams.add(streamId)
    this.streamMetrics.totalRequests++
    streamLogger.start(streamId, this.activeStreams.size, this.MAX_CONCURRENT_STREAMS)
  }

  /**
   * Untrack a streaming connection
   */
  private untrackStream(streamId: string): void {
    this.activeStreams.delete(streamId)
    streamLogger.end(streamId, this.activeStreams.size, this.MAX_CONCURRENT_STREAMS)
  }

  /**
   * Write with backpressure handling
   */
  private async writeWithBackpressure(
    stream: any,
    data: string,
    streamId: string
  ): Promise<void> {
    // Check if data size exceeds buffer limit
    if (data.length > this.MAX_BUFFER_SIZE) {
      console.warn(`⚠️ Large chunk detected in ${streamId}: ${data.length} bytes`)
      // Split large chunks if needed
      const chunks = this.splitLargeChunk(data)
      for (const chunk of chunks) {
        await stream.writeSSE({ data: chunk })
        // Small delay to prevent overwhelming the client
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    } else {
      await stream.writeSSE({ data })
    }
  }

  /**
   * Split large chunks into smaller pieces
   */
  private splitLargeChunk(data: string): string[] {
    const chunks: string[] = []
    const maxChunkSize = Math.floor(this.MAX_BUFFER_SIZE / 2) // Use half of max buffer

    for (let i = 0; i < data.length; i += maxChunkSize) {
      chunks.push(data.slice(i, i + maxChunkSize))
    }

    return chunks
  }

  /**
   * Check memory usage and perform cleanup if needed
   */
  private checkMemoryUsage(): void {
    const memUsage = process.memoryUsage()
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)

    memoryLogger.usage(heapUsedMB, heapTotalMB)

    // If memory usage is high, trigger garbage collection if available
    if (heapUsedMB > 500 && global.gc) {
      memoryLogger.gc()
      global.gc()
    }
  }

  /**
   * Get success rate percentage
   */
  private getSuccessRate(): number {
    if (this.streamMetrics.totalRequests === 0) return 100
    return Math.round((this.streamMetrics.successfulStreams / this.streamMetrics.totalRequests) * 100)
  }

  /**
   * Update stream completion metrics
   */
  private updateStreamMetrics(_streamId: string, success: boolean, duration: number): void {
    if (success) {
      this.streamMetrics.successfulStreams++
    } else {
      this.streamMetrics.failedStreams++
    }

    // Update average duration (rolling average)
    const totalCompleted = this.streamMetrics.successfulStreams + this.streamMetrics.failedStreams
    this.streamMetrics.averageStreamDuration =
      (this.streamMetrics.averageStreamDuration * (totalCompleted - 1) + duration) / totalCompleted
  }

  /**
   * Format uptime in human-readable format
   */
  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * Start the server
   */
  start(): void {
    const server = Bun.serve({
      port: this.port,
      hostname: this.hostname,
      fetch: this.app.fetch,
    })

    logger.info('SERVER', `🚀 GitHub Copilot API Server running on http://${this.hostname}:${this.port}`)
    logger.info('SERVER', `📖 OpenAPI endpoint: http://${this.hostname}:${this.port}/v1/chat/completions`)
    logger.info('SERVER', `🔐 Auth status: http://${this.hostname}:${this.port}/auth/status`)
    logger.info('SERVER', `📋 Available models: http://${this.hostname}:${this.port}/v1/models`)
    logger.info('SERVER', `📊 Metrics endpoint: http://${this.hostname}:${this.port}/metrics`)
    logger.info('SERVER', `⚙️  Max concurrent streams: ${this.MAX_CONCURRENT_STREAMS}`)
    logger.info('SERVER', `🧠 Max buffer size: ${this.MAX_BUFFER_SIZE} bytes`)

    // Store server reference for graceful shutdown
    this.server = server
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log(`🛑 Initiating graceful shutdown...`)

    // Stop accepting new connections
    if (this.server) {
      this.server.stop()
    }

    // Wait for active streams to complete (with timeout)
    const shutdownTimeout = 30000 // 30 seconds
    const startTime = Date.now()

    while (this.activeStreams.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      console.log(`⏳ Waiting for ${this.activeStreams.size} active streams to complete...`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Force close remaining streams
    if (this.activeStreams.size > 0) {
      console.log(`⚠️ Force closing ${this.activeStreams.size} remaining streams`)
      this.activeStreams.clear()
    }

    // Clean up monitoring intervals
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor)
    }

    // Log final metrics
    logger.info('SERVER', `📊 Final metrics:`)
    logger.info('SERVER', `   Total requests: ${this.streamMetrics.totalRequests}`)
    logger.info('SERVER', `   Success rate: ${this.getSuccessRate()}%`)
    logger.info('SERVER', `   Total chunks: ${this.streamMetrics.totalChunks}`)
    logger.info('SERVER', `   Peak concurrent: ${this.streamMetrics.peakConcurrentStreams}`)

    logger.info('SERVER', `✅ Graceful shutdown completed`)
  }

  /**
   * Get the Hono app instance
   */
  getApp() {
    return this.app
  }
}
