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
  text: z.string(),
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
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([
    z.string(),                    // Legacy string format (backward compatibility)
    z.array(ContentBlock)          // New array format (multi-modal support)
  ]),
})

export const ChatCompletionRequest = z.object({
  model: z.string(),
  messages: z.array(ChatMessage),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
  stream_options: z.object({
    include_usage: z.boolean().optional(),
  }).optional(),
  top_p: z.number().optional(),
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
  role: z.enum(["system", "user", "assistant"]).optional(),
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

// Error Types
export interface APIError {
  error: {
    message: string
    type: string
    code?: string
  }
}
