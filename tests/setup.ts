/**
 * Test Setup and Configuration
 * Global test setup, mocks, and utilities
 */

import { beforeAll, afterAll } from "bun:test"

// Global test configuration
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = "test"
  process.env.LOG_LEVEL = "silent"
  
  // Disable metrics and monitoring in tests
  process.env.METRICS_ENABLED = "false"
  process.env.ENABLE_MEMORY_LOGS = "false"
  process.env.ENABLE_PROGRESS_LOGS = "false"
  
  // Use test-specific configuration
  process.env.PORT = "0" // Random port
  process.env.CORS_ORIGINS = "http://localhost:3000"
  process.env.ENABLE_RATE_LIMIT = "false"
})

afterAll(() => {
  // Cleanup after all tests
  // Reset environment variables if needed
})

// Global test utilities
export const testUtils = {
  /**
   * Create a mock fetch function for testing
   */
  createMockFetch: (responses: Record<string, any>) => {
    return async (url: string, options?: any) => {
      const response = responses[url] || responses["default"]
      if (!response) {
        throw new Error(`No mock response configured for ${url}`)
      }
      
      if (response.error) {
        throw new Error(response.error)
      }
      
      return {
        ok: response.ok ?? true,
        status: response.status ?? 200,
        statusText: response.statusText ?? "OK",
        headers: new Map(Object.entries(response.headers || {})),
        json: async () => response.json || {},
        text: async () => response.text || "",
        ...response
      }
    }
  },

  /**
   * Wait for a specified amount of time
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Create a temporary file for testing
   */
  createTempFile: async (content: string) => {
    const fs = await import("fs/promises")
    const path = await import("path")
    const os = await import("os")
    
    const tempFile = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random().toString(36).substring(7)}.json`)
    await fs.writeFile(tempFile, content)
    return tempFile
  },

  /**
   * Clean up temporary file
   */
  cleanupTempFile: async (filePath: string) => {
    const fs = await import("fs/promises")
    try {
      await fs.unlink(filePath)
    } catch {
      // File doesn't exist, that's fine
    }
  },

  /**
   * Capture console output for testing
   */
  captureConsole: () => {
    const logs: string[] = []
    const warns: string[] = []
    const errors: string[] = []
    
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    }
    
    console.log = (...args) => logs.push(args.join(' '))
    console.warn = (...args) => warns.push(args.join(' '))
    console.error = (...args) => errors.push(args.join(' '))
    
    return {
      logs,
      warns,
      errors,
      restore: () => {
        console.log = originalConsole.log
        console.warn = originalConsole.warn
        console.error = originalConsole.error
      }
    }
  },

  /**
   * Create mock correlation middleware context
   */
  createMockContext: (overrides: any = {}) => {
    const correlationId = `test-${Date.now()}`
    return {
      req: {
        method: "GET",
        path: "/test",
        header: (name: string) => {
          const headers: Record<string, string> = {
            "X-Request-ID": correlationId,
            "User-Agent": "Test Agent",
            "Content-Type": "application/json",
            ...overrides.headers
          }
          return headers[name]
        },
        ...overrides.req
      },
      res: {
        status: 200,
        headers: new Map(),
        ...overrides.res
      },
      set: (key: string, value: any) => {
        // Mock context set method
      },
      get: (key: string) => {
        if (key === "correlationId") return correlationId
        return undefined
      },
      ...overrides
    }
  },

  /**
   * Create mock streaming response
   */
  createMockStreamResponse: (chunks: string[]) => {
    let chunkIndex = 0
    
    return {
      body: {
        getReader: () => ({
          read: async () => {
            if (chunkIndex >= chunks.length) {
              return { done: true, value: undefined }
            }
            
            const chunk = chunks[chunkIndex++]
            const encoder = new TextEncoder()
            return { done: false, value: encoder.encode(chunk) }
          },
          releaseLock: () => {}
        })
      },
      headers: new Map([
        ["content-type", "text/event-stream"],
        ["cache-control", "no-cache"]
      ]),
      ok: true,
      status: 200
    }
  },

  /**
   * Validate SSE (Server-Sent Events) format
   */
  validateSSEChunk: (chunk: string) => {
    const lines = chunk.split('\n')
    let hasData = false
    let hasEvent = false
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        hasData = true
      } else if (line.startsWith('event: ')) {
        hasEvent = true
      }
    }
    
    return { hasData, hasEvent, isValid: hasData }
  },

  /**
   * Parse SSE chunk data
   */
  parseSSEChunk: (chunk: string) => {
    const lines = chunk.split('\n')
    const result: { event?: string; data?: string; id?: string } = {}
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        result.data = line.substring(6)
      } else if (line.startsWith('event: ')) {
        result.event = line.substring(7)
      } else if (line.startsWith('id: ')) {
        result.id = line.substring(4)
      }
    }
    
    return result
  },

  /**
   * Create mock OpenAI-compatible request
   */
  createMockChatRequest: (overrides: any = {}) => {
    return {
      model: "gpt-4",
      messages: [
        { role: "user", content: "Hello, world!" }
      ],
      temperature: 0.7,
      max_tokens: 100,
      stream: false,
      ...overrides
    }
  },

  /**
   * Create mock OpenAI-compatible response
   */
  createMockChatResponse: (overrides: any = {}) => {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?"
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25
      },
      ...overrides
    }
  },

  /**
   * Create mock streaming chunk
   */
  createMockStreamChunk: (content: string, overrides: any = {}) => {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4",
      choices: [
        {
          index: 0,
          delta: {
            content
          },
          finish_reason: null
        }
      ],
      ...overrides
    }
  }
}

// Export test environment helpers
export const testEnv = {
  isTest: () => process.env.NODE_ENV === "test",
  isSilent: () => process.env.LOG_LEVEL === "silent",
  getTestPort: () => parseInt(process.env.PORT || "0"),
  
  // Test-specific configuration
  config: {
    timeout: 5000, // Default test timeout
    retries: 0, // No retries in tests by default
    parallel: true // Run tests in parallel
  }
}
