import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { streamSSE } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { GitHubCopilotAuth } from "./auth"
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamChunk,
  APIError,
  type ChatMessage
} from "./types"

export class CopilotAPIServer {
  private app: Hono
  private port: number
  private hostname: string

  // Connection management
  private activeStreams = new Set<string>()
  private streamingRateLimit = new Map<string, number>()
  private readonly MAX_CONCURRENT_STREAMS = parseInt(process.env.MAX_STREAMS || "100")
  private readonly RATE_LIMIT_INTERVAL = 1000 // 1 second between streaming requests per client

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
  private readonly MAX_BUFFER_SIZE = parseInt(process.env.MAX_BUFFER_SIZE || "1048576") // 1MB
  private readonly MEMORY_CHECK_INTERVAL = 30000 // 30 seconds
  private memoryMonitor: NodeJS.Timeout | null = null

  // Server instance for graceful shutdown
  private server: any = null

  constructor(port: number = 8069, hostname: string = "127.0.0.1") {
    this.port = port
    this.hostname = hostname
    this.app = new Hono()
    this.setupMiddleware()
    this.setupRoutes()
    this.setupConnectionMonitoring()
  }

  private setupMiddleware() {
    // Enable CORS for all origins (adjust as needed)
    this.app.use("*", cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }))

    // Request logging
    this.app.use("*", logger())

    // Error handler
    this.app.onError((err, c) => {
      console.error("Server error:", err)
      const errorResponse: APIError = {
        error: {
          message: err.message || "Internal server error",
          type: "server_error",
          code: "internal_error"
        }
      }
      return c.json(errorResponse, 500)
    })
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get("/", (c) => {
      return c.json({
        status: "ok",
        message: "GitHub Copilot API Server",
        version: "1.0.0"
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
        const errorResponse: APIError = {
          error: {
            message: error instanceof Error ? error.message : "Authentication failed",
            type: "auth_error"
          }
        }
        return c.json(errorResponse, 400)
      }
    })

    // Poll for authentication completion
    this.app.post("/auth/poll", async (c) => {
      const body = await c.req.json()
      const deviceCode = body.device_code

      if (!deviceCode) {
        const errorResponse: APIError = {
          error: {
            message: "device_code is required",
            type: "invalid_request"
          }
        }
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
        const errorResponse: APIError = {
          error: {
            message: error instanceof Error ? error.message : "Polling failed",
            type: "auth_error"
          }
        }
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
        const errorResponse: APIError = {
          error: {
            message: error instanceof Error ? error.message : "Authentication flow failed",
            type: "auth_error"
          }
        }
        return c.json(errorResponse, 500)
      }
    })

    // OpenAI-compatible chat completions endpoint
    this.app.post(
      "/v1/chat/completions",
      zValidator("json", ChatCompletionRequest),
      async (c) => {
        const body = c.req.valid("json")

        // Check authentication
        const token = await GitHubCopilotAuth.getAccessToken()
        if (!token) {
          const errorResponse: APIError = {
            error: {
              message: "Not authenticated with GitHub Copilot. Please authenticate first.",
              type: "authentication_error",
              code: "invalid_api_key"
            }
          }
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
              const errorResponse: APIError = {
                error: {
                  message: "Rate limit exceeded. Please wait before making another streaming request.",
                  type: "rate_limit_error",
                  code: "rate_limit_exceeded"
                }
              }
              return c.json(errorResponse, 429)
            }

            if (this.activeStreams.size >= this.MAX_CONCURRENT_STREAMS) {
              const errorResponse: APIError = {
                error: {
                  message: "Server is at maximum capacity for streaming requests. Please try again later.",
                  type: "capacity_error",
                  code: "max_streams_exceeded"
                }
              }
              return c.json(errorResponse, 503)
            }

            // Use Hono's streamSSE for streaming responses
            return streamSSE(c, async (stream) => {
              const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
              const startTime = Date.now()
              this.trackStream(streamId)

              try {
                await this.forwardToCopilotStreaming(token, body, endpoint, stream, streamId)
                const duration = Date.now() - startTime
                this.updateStreamMetrics(streamId, true, duration)
              } catch (error) {
                console.error("Streaming error:", error)
                const duration = Date.now() - startTime
                this.updateStreamMetrics(streamId, false, duration)
                await this.handleStreamingError(stream, error instanceof Error ? error : new Error("Streaming failed"), `endpoint-${streamId}`)
              } finally {
                this.untrackStream(streamId)
              }
            })
          } else {
            // Forward request to GitHub Copilot API (non-streaming)
            const copilotResponse = await this.forwardToCopilot(token, body, endpoint)
            return c.json(copilotResponse)
          }
        } catch (error) {
          console.error("Copilot API error:", error)
          const errorResponse: APIError = {
            error: {
              message: error instanceof Error ? error.message : "Failed to process request",
              type: "api_error"
            }
          }
          return c.json(errorResponse, 500)
        }
      }
    )

    // List available models (mock response for compatibility)
    this.app.get("/v1/models", async (c) => {
      const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
      
      if (!isAuthenticated) {
        const errorResponse: APIError = {
          error: {
            message: "Not authenticated",
            type: "authentication_error"
          }
        }
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

    // Transform request to Copilot format - try different formats
    const baseRequest = {
      model: request.model,
      messages: request.messages,
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
        // Legacy Copilot format
        prompt: request.messages.map(m => `${m.role}: ${m.content}`).join('\n'),
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

        if (response.ok) {
          const copilotResponse = await response.json()
          const actualModel = copilotResponse.model || request.model || 'unknown'
          console.log(`✅ Success with endpoint: ${apiUrl}`)
          console.log(`🤖 Non-streaming response using model: ${actualModel}`)
          console.log("Copilot response received:", JSON.stringify(copilotResponse, null, 2))
          return this.transformCopilotResponse(copilotResponse, request)
        } else if (response.status === 404) {
          console.log(`❌ 404 for endpoint: ${apiUrl}, trying next...`)
          continue
        } else {
          // Non-404 error, log and continue
          const errorText = await response.text()
          console.log(`❌ ${response.status} for endpoint: ${apiUrl} - ${errorText}`)
          lastError = new Error(`HTTP ${response.status}: ${errorText}`)
          continue
        }
      } catch (error) {
        console.log(`❌ Network error for endpoint: ${apiUrl} - ${error}`)
        lastError = error instanceof Error ? error : new Error(String(error))
        continue
      }
    }

    // If we get here, all endpoints failed
    throw new Error(`All Copilot API endpoints failed. Last error: ${lastError?.message || "Unknown error"}`)
  }

  private transformCopilotResponse(copilotResponse: any, request: ChatCompletionRequest): ChatCompletionResponse {
    // Transform response to OpenAI format
    const openAIResponse: ChatCompletionResponse = {
      id: copilotResponse.id || `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: copilotResponse.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices: copilotResponse.choices || [{
        index: 0,
        message: {
          role: "assistant",
          content: copilotResponse.content || copilotResponse.message?.content || "No response from Copilot"
        },
        finish_reason: "stop"
      }],
      usage: copilotResponse.usage
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
    console.log(`🔄 Starting streaming request ${streamId}`)

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

    const requestBody = {
      model: request.model,
      messages: request.messages,
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

    for (const config of endpointConfigs) {
      const apiUrl = `${endpoint}${config.path}`
      console.log(`Trying streaming request to: ${apiUrl}`)

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

        if (response.ok) {
          console.log(`✅ Success with streaming endpoint: ${apiUrl}`)
          await this.processStreamingResponse(response, stream, request, streamId, apiUrl)
          clearTimeout(streamTimeout)
          console.log(`🎉 Streaming request ${streamId} completed successfully`)
          return
        } else if (response.status === 404) {
          console.log(`❌ 404 for streaming endpoint: ${apiUrl}, trying next...`)
          continue
        } else {
          // Non-404 error, log and continue
          const errorText = await response.text()
          console.log(`❌ ${response.status} for streaming endpoint: ${apiUrl} - ${errorText}`)
          lastError = new Error(`HTTP ${response.status}: ${errorText}`)
          continue
        }
      } catch (error) {
        console.log(`❌ Network error for streaming endpoint: ${apiUrl}`)
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
        console.warn(`⏰ Chunk timeout for stream ${streamId}, last activity: ${Date.now() - lastActivityTime}ms ago`)
        clearInterval(chunkTimeoutInterval)
        reader.releaseLock()
        throw new Error("Streaming chunk timeout - no data received for 30 seconds")
      }
    }, 5000) // Check every 5 seconds

    try {
      while (true) {
        if (isAborted) {
          console.log(`🚫 Stream ${streamId} was aborted, stopping processing`)
          break
        }

        const { done, value } = await reader.read()
        if (done) {
          console.log(`📡 Stream ${streamId} completed, processed ${chunkCount} chunks${actualModel ? ` using ${actualModel}` : ''}`)
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

            try {
              const chunk = JSON.parse(data)

              // Capture the actual model from the first chunk
              if (!modelLogged && chunk.model) {
                actualModel = chunk.model
                console.log(`🤖 Stream ${streamId} using model: ${actualModel} (endpoint: ${apiUrl || 'unknown'})`)
                modelLogged = true
              }

              const transformedChunk = this.transformCopilotStreamChunk(chunk, request)
              const chunkData = JSON.stringify(transformedChunk)

              // Implement backpressure handling
              await this.writeWithBackpressure(stream, chunkData, streamId)

              chunkCount++
              this.streamMetrics.totalChunks++
              this.streamMetrics.totalBytes += chunkData.length

              // Log progress every 10 chunks
              if (chunkCount % 10 === 0) {
                console.log(`📊 Stream ${streamId}: ${chunkCount} chunks processed`)
              }
            } catch (parseError) {
              console.warn(`⚠️ Failed to parse streaming chunk in ${streamId}:`, parseError)
              // Continue processing other chunks instead of failing completely
            }
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
    copilotChunk: any,
    request: ChatCompletionRequest
  ): ChatCompletionStreamChunk {
    return {
      id: copilotChunk.id || `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: copilotChunk.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices: copilotChunk.choices?.map((choice: any) => ({
        index: choice.index || 0,
        delta: {
          role: choice.delta?.role,
          content: choice.delta?.content,
        },
        finish_reason: choice.finish_reason,
      })) || [{
        index: 0,
        delta: {
          content: copilotChunk.content || "",
        },
        finish_reason: null,
      }],
      usage: copilotChunk.usage,
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
    console.error(`💥 Streaming error in ${context}:`, error.message)

    const errorChunk: ChatCompletionStreamChunk = {
      id: `chatcmpl-error-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "error",
      choices: [{
        index: 0,
        delta: {},
        finish_reason: "error",
      }],
    }

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
      console.error(`💥 Failed to write error to stream in ${context}:`, writeError)
    }
  }

  /**
   * Set up timeout for streaming requests
   */
  private setupStreamTimeout(stream: any, streamId: string, timeoutMs: number = 300000): NodeJS.Timeout {
    return setTimeout(async () => {
      console.warn(`⏰ Stream timeout for ${streamId} after ${timeoutMs}ms`)
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

      console.log(`📊 Active streams: ${currentActive}/${this.MAX_CONCURRENT_STREAMS}`)
      console.log(`📈 Peak concurrent: ${this.streamMetrics.peakConcurrentStreams}`)
      console.log(`📊 Total requests: ${this.streamMetrics.totalRequests}`)
      console.log(`✅ Success rate: ${this.getSuccessRate()}%`)

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
    console.log(`📈 Stream ${streamId} started. Active: ${this.activeStreams.size}/${this.MAX_CONCURRENT_STREAMS}`)
  }

  /**
   * Untrack a streaming connection
   */
  private untrackStream(streamId: string): void {
    this.activeStreams.delete(streamId)
    console.log(`📉 Stream ${streamId} ended. Active: ${this.activeStreams.size}/${this.MAX_CONCURRENT_STREAMS}`)
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

    console.log(`🧠 Memory: ${heapUsedMB}MB used / ${heapTotalMB}MB total`)

    // If memory usage is high, trigger garbage collection if available
    if (heapUsedMB > 500 && global.gc) {
      console.log(`🧹 High memory usage detected, triggering GC`)
      global.gc()
    }

    // Log memory warning if usage is very high
    if (heapUsedMB > 1000) {
      console.warn(`⚠️ High memory usage: ${heapUsedMB}MB. Consider restarting the server.`)
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
  private updateStreamMetrics(streamId: string, success: boolean, duration: number): void {
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

    console.log(`🚀 GitHub Copilot API Server running on http://${this.hostname}:${this.port}`)
    console.log(`📖 OpenAPI endpoint: http://${this.hostname}:${this.port}/v1/chat/completions`)
    console.log(`🔐 Auth status: http://${this.hostname}:${this.port}/auth/status`)
    console.log(`📋 Available models: http://${this.hostname}:${this.port}/v1/models`)
    console.log(`📊 Metrics endpoint: http://${this.hostname}:${this.port}/metrics`)
    console.log(`⚙️  Max concurrent streams: ${this.MAX_CONCURRENT_STREAMS}`)
    console.log(`🧠 Max buffer size: ${this.MAX_BUFFER_SIZE} bytes`)

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
    console.log(`📊 Final metrics:`)
    console.log(`   Total requests: ${this.streamMetrics.totalRequests}`)
    console.log(`   Success rate: ${this.getSuccessRate()}%`)
    console.log(`   Total chunks: ${this.streamMetrics.totalChunks}`)
    console.log(`   Peak concurrent: ${this.streamMetrics.peakConcurrentStreams}`)

    console.log(`✅ Graceful shutdown completed`)
  }

  /**
   * Get the Hono app instance
   */
  getApp() {
    return this.app
  }
}
