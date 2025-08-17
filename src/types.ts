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

// OpenAI Compatible API Types
export const ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
})

export const ChatCompletionRequest = z.object({
  model: z.string(),
  messages: z.array(ChatMessage),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
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

// Error Types
export interface APIError {
  error: {
    message: string
    type: string
    code?: string
  }
}
