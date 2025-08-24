import { z } from "zod"

// GitHub OAuth Device Flow Types
export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface AccessTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

export interface CopilotTokenResponse {
  token: string
  expires_at: number
  refresh_in: number
  endpoints: {
    api: string
  }
}

// Auth Storage Types
export const OAuthInfo = z.object({
  type: z.literal("oauth"),
  refresh: z.string(),
  access: z.string(),
  expires: z.number(),
  endpoint: z.string().optional(), // Store the API endpoint from token response
})

export type OAuthInfo = z.infer<typeof OAuthInfo>

// OpenAI Compatible API Types - Content Block Types
export const TextContent = z.object({
  type: z.literal("text"),
  text: z.string().min(1, "Text content cannot be empty"),
})

export const ImageContent = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(["low", "high", "auto"]).optional(),
  }),
})

export const ContentBlock = z.union([TextContent, ImageContent])

// Updated ChatMessage to support both string and array content formats
export const ChatMessage = z.object({
  // COMPATIBILITY FIX: Add role normalization for Cline and other clients
  // Handles case sensitivity and common alternative role names
  role: z.string().transform((role) => {
    // Normalize role to lowercase and trim whitespace
    const normalizedRole = role.toLowerCase().trim()

    // Map common alternative role names used by various AI clients
    const roleMap: Record<string, string> = {
      'human': 'user',        // Common in Anthropic/Claude clients
      'ai': 'assistant',      // Common in various AI clients
      'bot': 'assistant',     // Common in chatbot implementations
      'model': 'assistant',   // Sometimes used for model responses
      'chatbot': 'assistant', // Alternative assistant naming
      'gpt': 'assistant'      // GPT-specific naming
    }

    const mappedRole = roleMap[normalizedRole] || normalizedRole

    // Log role transformation for debugging (only in development)
    if (process.env.NODE_ENV === 'development' && mappedRole !== role) {
      // Note: Using console.debug here is intentional as this runs during Zod validation
      // before the logger context is available. This is development-only debugging.
      console.debug(`🔄 Role normalized: "${role}" → "${mappedRole}"`)
    }

    return mappedRole
  }).pipe(z.enum(["system", "user", "assistant"], {
    errorMap: (issue, ctx) => {
      const receivedValue = ctx.data
      return {
        message: `Role must be one of: system, user, assistant (received: "${receivedValue}")`
      }
    }
  })),
  content: z.union([
    z.string().min(1, "Content cannot be empty"),                    // Legacy string format (backward compatibility)
    z.array(ContentBlock).min(1, "Content array cannot be empty")   // New array format (multi-modal support)
  ], {
    errorMap: () => ({ message: "Content must be a non-empty string or array" })
  }),
}).refine((message) => {
  // PERFORMANCE OPTIMIZATION: Consolidate content validation into Zod schema
  // This eliminates redundant validation work in request handlers
  if (typeof message.content === "string") {
    return true // String content is always valid
  }

  if (Array.isArray(message.content)) {
    // Ensure array content has at least one text block for GitHub Copilot compatibility
    const hasTextContent = message.content.some(block => block.type === "text")
    return hasTextContent
  }

  return false
}, {
  message: "Content array must contain at least one text block for GitHub Copilot compatibility",
  path: ["content"]
})

export const ChatCompletionRequest = z.object({
  model: z.string().min(1, "Model is required and cannot be empty"),
  messages: z.array(ChatMessage).min(1, "Messages array cannot be empty"),
  temperature: z.number().min(0, "Temperature must be >= 0").max(2, "Temperature must be <= 2").optional(),
  max_tokens: z.number().min(1, "Max tokens must be >= 1").max(100000, "Max tokens must be <= 100000").optional(),
  stream: z.boolean().optional(),
  stream_options: z.object({
    include_usage: z.boolean().optional(),
  }).optional(),
  top_p: z.number().min(0, "Top-p must be >= 0").max(1, "Top-p must be <= 1").optional(),
  presence_penalty: z.number().min(-2, "Presence penalty must be >= -2").max(2, "Presence penalty must be <= 2").optional(),
  frequency_penalty: z.number().min(-2, "Frequency penalty must be >= -2").max(2, "Frequency penalty must be <= 2").optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
})

export const ChatCompletionResponse = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: ChatMessage,
    finish_reason: z.string(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }).optional(),
})

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequest>
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponse>
export type ChatMessage = z.infer<typeof ChatMessage>
export type TextContent = z.infer<typeof TextContent>
export type ImageContent = z.infer<typeof ImageContent>
export type ContentBlock = z.infer<typeof ContentBlock>

// Streaming-specific types
export const DeltaMessage = z.object({
  // COMPATIBILITY FIX: Apply same role normalization for streaming responses
  role: z.string().transform((role) => {
    const normalizedRole = role.toLowerCase().trim()
    const roleMap: Record<string, string> = {
      'human': 'user',
      'ai': 'assistant',
      'bot': 'assistant',
      'model': 'assistant',
      'chatbot': 'assistant',
      'gpt': 'assistant'
    }
    return roleMap[normalizedRole] || normalizedRole
  }).pipe(z.enum(["system", "user", "assistant"])).optional(),
  content: z.string().optional(),
})

export const ChatCompletionStreamChunk = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    delta: DeltaMessage,
    finish_reason: z.string().nullable(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }).optional(),
})

export type DeltaMessage = z.infer<typeof DeltaMessage>
export type ChatCompletionStreamChunk = z.infer<typeof ChatCompletionStreamChunk>

// Re-export error types from dedicated error module
export type {
  APIErrorType,
  APIErrorResponse,
  AuthenticationError,
  StreamingError,
  ValidationError,
  NetworkError,
  ConfigurationError,
  ServerError,
  BaseError
} from './types/errors'

export {
  ErrorFactory,
  isAPIError,
  toAPIErrorResponse,
  formatErrorForLogging,
  isAuthenticationError,
  isStreamingError,
  isValidationError,
  isNetworkError,
  isConfigurationError,
  isServerError
} from './types/errors'

// Re-export HTTP types
export type {
  HTTPMethod,
  HTTPStatusCode,
  RequestHeaders,
  ResponseHeaders,
  HTTPRequest,
  HTTPResponse,
  FetchOptions,
  CopilotAPIEndpoint,
  CopilotAPIResponse,
  StreamChunk,
  StreamingResponse,
  RequestContext,
  ResponseContext
} from './types/http'

export {
  isHTTPMethod,
  isSuccessStatus,
  isClientError,
  isServerError as isHTTPServerError,
  isRedirect,
  parseContentType,
  buildQueryString,
  parseUserAgent
} from './types/http'

// Legacy APIError interface for backward compatibility
export interface APIError {
  error: {
    message: string
    type: string
    code?: string
  }
}
