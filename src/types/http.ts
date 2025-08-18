/**
 * HTTP and Network Type Definitions
 * Provides strongly typed interfaces for HTTP operations and responses
 */

import { z } from "zod"

// HTTP Method types
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD'

// HTTP Status Code types
export type HTTPStatusCode = 
  | 200 | 201 | 202 | 204 // Success
  | 400 | 401 | 403 | 404 | 409 | 422 | 429 // Client errors
  | 500 | 502 | 503 | 504 // Server errors

// Request headers interface
export interface RequestHeaders {
  'Content-Type'?: string
  'Authorization'?: string
  'User-Agent'?: string
  'X-Request-ID'?: string
  'X-Correlation-ID'?: string
  'Accept'?: string
  'Origin'?: string
  'Referer'?: string
  [key: string]: string | undefined
}

// Response headers interface
export interface ResponseHeaders {
  'Content-Type'?: string
  'Content-Length'?: string
  'X-Request-ID'?: string
  'X-Correlation-ID'?: string
  'Access-Control-Allow-Origin'?: string
  'Access-Control-Allow-Methods'?: string
  'Access-Control-Allow-Headers'?: string
  'Cache-Control'?: string
  'ETag'?: string
  [key: string]: string | undefined
}

// HTTP Request interface
export interface HTTPRequest {
  method: HTTPMethod
  url: string
  headers?: RequestHeaders
  body?: string | ArrayBuffer | FormData
  timeout?: number
  signal?: AbortSignal
}

// HTTP Response interface
export interface HTTPResponse<T = unknown> {
  status: HTTPStatusCode
  statusText: string
  headers: ResponseHeaders
  data: T
  url: string
  redirected: boolean
}

// Fetch options with proper typing
export interface FetchOptions {
  method?: HTTPMethod
  headers?: RequestHeaders
  body?: string | ArrayBuffer | FormData | URLSearchParams
  mode?: 'cors' | 'no-cors' | 'same-origin'
  credentials?: 'omit' | 'same-origin' | 'include'
  cache?: 'default' | 'no-cache' | 'reload' | 'force-cache' | 'only-if-cached'
  redirect?: 'follow' | 'error' | 'manual'
  referrer?: string
  referrerPolicy?: 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url'
  integrity?: string
  keepalive?: boolean
  signal?: AbortSignal
}

// GitHub Copilot API specific types
export interface CopilotAPIEndpoint {
  url: string
  priority: number
  lastUsed?: number
  failureCount: number
  isHealthy: boolean
}

export interface CopilotAPIResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message?: {
      role: string
      content: string
    }
    delta?: {
      role?: string
      content?: string
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Streaming response types
export interface StreamChunk {
  id: string
  data: string
  event?: string
  retry?: number
}

export interface StreamingResponse {
  stream: ReadableStream<Uint8Array>
  headers: ResponseHeaders
  status: HTTPStatusCode
  url: string
}

// Request context for correlation and tracking
export interface RequestContext {
  correlationId: string
  startTime: number
  method: HTTPMethod
  path: string
  userAgent?: string
  clientIP?: string
  headers: RequestHeaders
}

// Response context for logging and metrics
export interface ResponseContext {
  correlationId: string
  duration: number
  status: HTTPStatusCode
  contentLength?: number
  headers: ResponseHeaders
}

// Zod schemas for runtime validation
export const HTTPMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'])

export const RequestHeadersSchema = z.record(z.string().optional())

export const ResponseHeadersSchema = z.record(z.string().optional())

export const HTTPRequestSchema = z.object({
  method: HTTPMethodSchema,
  url: z.string().url(),
  headers: RequestHeadersSchema.optional(),
  body: z.union([z.string(), z.instanceof(ArrayBuffer), z.instanceof(FormData)]).optional(),
  timeout: z.number().positive().optional(),
})

export const CopilotAPIEndpointSchema = z.object({
  url: z.string().url(),
  priority: z.number().int().min(0),
  lastUsed: z.number().optional(),
  failureCount: z.number().int().min(0),
  isHealthy: z.boolean(),
})

export const StreamChunkSchema = z.object({
  id: z.string(),
  data: z.string(),
  event: z.string().optional(),
  retry: z.number().optional(),
})

export const RequestContextSchema = z.object({
  correlationId: z.string(),
  startTime: z.number(),
  method: HTTPMethodSchema,
  path: z.string(),
  userAgent: z.string().optional(),
  clientIP: z.string().optional(),
  headers: RequestHeadersSchema,
})

export const ResponseContextSchema = z.object({
  correlationId: z.string(),
  duration: z.number(),
  status: z.number().int().min(100).max(599),
  contentLength: z.number().optional(),
  headers: ResponseHeadersSchema,
})

// Type guards
export function isHTTPMethod(value: string): value is HTTPMethod {
  return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(value)
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300
}

export function isClientError(status: number): boolean {
  return status >= 400 && status < 500
}

export function isServerError(status: number): boolean {
  return status >= 500 && status < 600
}

export function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

// Utility functions
export function parseContentType(contentType?: string): { type: string; charset?: string } {
  if (!contentType) {
    return { type: 'application/octet-stream' }
  }

  const [type, ...params] = contentType.split(';').map(s => s.trim())
  const charset = params
    .find(p => p.startsWith('charset='))
    ?.split('=')[1]

  return { type, charset }
}

export function buildQueryString(params: Record<string, string | number | boolean>): string {
  const searchParams = new URLSearchParams()
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  }
  
  return searchParams.toString()
}

export function parseUserAgent(userAgent?: string): { browser?: string; version?: string; os?: string } {
  if (!userAgent) {
    return {}
  }

  // Simple user agent parsing - can be enhanced as needed
  const result: { browser?: string; version?: string; os?: string } = {}

  if (userAgent.includes('Chrome')) {
    result.browser = 'Chrome'
  } else if (userAgent.includes('Firefox')) {
    result.browser = 'Firefox'
  } else if (userAgent.includes('Safari')) {
    result.browser = 'Safari'
  } else if (userAgent.includes('Bun')) {
    result.browser = 'Bun'
  }

  if (userAgent.includes('Windows')) {
    result.os = 'Windows'
  } else if (userAgent.includes('Mac')) {
    result.os = 'macOS'
  } else if (userAgent.includes('Linux')) {
    result.os = 'Linux'
  }

  return result
}

// Export type inference helpers
export type InferHTTPRequest = z.infer<typeof HTTPRequestSchema>
export type InferCopilotAPIEndpoint = z.infer<typeof CopilotAPIEndpointSchema>
export type InferStreamChunk = z.infer<typeof StreamChunkSchema>
export type InferRequestContext = z.infer<typeof RequestContextSchema>
export type InferResponseContext = z.infer<typeof ResponseContextSchema>
