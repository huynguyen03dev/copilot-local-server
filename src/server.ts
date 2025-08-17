import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { zValidator } from "@hono/zod-validator"
import { GitHubCopilotAuth } from "./auth"
import { 
  ChatCompletionRequest, 
  ChatCompletionResponse, 
  APIError,
  type ChatMessage 
} from "./types"

export class CopilotAPIServer {
  private app: Hono
  private port: number
  private hostname: string

  constructor(port: number = 8069, hostname: string = "127.0.0.1") {
    this.port = port
    this.hostname = hostname
    this.app = new Hono()
    this.setupMiddleware()
    this.setupRoutes()
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

          // Forward request to GitHub Copilot API
          const copilotResponse = await this.forwardToCopilot(token, body, endpoint)
          return c.json(copilotResponse)
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
          console.log(`✅ Success with endpoint: ${apiUrl}`)
          const copilotResponse = await response.json()
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
  }

  /**
   * Get the Hono app instance
   */
  getApp() {
    return this.app
  }
}
