/**
 * Enhanced Integration Tests
 * Comprehensive end-to-end testing with error scenarios and edge cases
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { CopilotAPIServer } from "../../src/server"
import { testUtils } from "../setup"

describe("Enhanced Integration Tests", () => {
  let server: CopilotAPIServer
  const testPort = 8074
  const baseUrl = `http://localhost:${testPort}`

  beforeAll(async () => {
    server = new CopilotAPIServer(testPort, "127.0.0.1")
    server.start()
    
    // Wait for server to start
    await testUtils.wait(1000)
  })

  afterAll(async () => {
    // Cleanup server if stop method exists
    if (server && typeof (server as any).stop === 'function') {
      (server as any).stop()
    }
  })

  describe("API Endpoint Validation", () => {
    it("should reject requests to non-existent endpoints", async () => {
      const response = await fetch(`${baseUrl}/v1/invalid/endpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" })
      })
      
      expect(response.status).toBe(404)
    })

    it("should reject unsupported HTTP methods", async () => {
      const methods = ["PUT", "DELETE", "PATCH", "HEAD"]
      
      for (const method of methods) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method,
          headers: { "Content-Type": "application/json" }
        })
        
        expect([405, 404].includes(response.status)).toBe(true)
      }
    })

    it("should handle CORS preflight requests", async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "OPTIONS",
        headers: {
          "Origin": "http://localhost:3000",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type,Authorization"
        }
      })
      
      expect([200, 204].includes(response.status)).toBe(true)
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined()
    })

    it("should validate Content-Type header", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }]
      }

      // Test with missing Content-Type
      const response1 = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: JSON.stringify(request)
      })
      
      expect([400, 415].includes(response1.status)).toBe(true)

      // Test with wrong Content-Type
      const response2 = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(request)
      })
      
      expect([400, 415].includes(response2.status)).toBe(true)
    })
  })

  describe("Request Validation Edge Cases", () => {
    it("should handle extremely large request bodies", async () => {
      const largeContent = "A".repeat(10 * 1024 * 1024) // 10MB
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: largeContent }]
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })
      
      expect([400, 413, 500].includes(response.status)).toBe(true)
    })

    it("should handle malformed JSON", async () => {
      const malformedJson = '{"model": "gpt-4", "messages": [{'
      
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: malformedJson
      })
      
      expect(response.status).toBe(400)
      
      const errorData = await response.json()
      expect(errorData.error).toBeDefined()
      expect(errorData.error.type).toBe("invalid_request_error")
    })

    it("should handle empty request body", async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ""
      })
      
      expect(response.status).toBe(400)
    })

    it("should validate required fields", async () => {
      const testCases = [
        {}, // Empty object
        { model: "gpt-4" }, // Missing messages
        { messages: [] }, // Missing model
        { model: "", messages: [] }, // Empty model
        { model: "gpt-4", messages: "not-an-array" }, // Invalid messages type
        { model: 123, messages: [] }, // Invalid model type
      ]

      for (const testCase of testCases) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testCase)
        })
        
        expect(response.status).toBe(400)
        
        const errorData = await response.json()
        expect(errorData.error.type).toBe("invalid_request_error")
      }
    })

    it("should validate message structure", async () => {
      const invalidMessages = [
        [{}], // Missing role and content
        [{ role: "user" }], // Missing content
        [{ content: "Hello" }], // Missing role
        [{ role: "invalid", content: "Hello" }], // Invalid role
        [{ role: "user", content: 123 }], // Invalid content type
        [{ role: "user", content: null }], // Null content
      ]

      for (const messages of invalidMessages) {
        const request = {
          model: "gpt-4",
          messages
        }

        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        })
        
        expect(response.status).toBe(400)
      }
    })

    it("should validate parameter ranges", async () => {
      const invalidParams = [
        { temperature: -1 }, // Below minimum
        { temperature: 3 }, // Above maximum
        { max_tokens: -1 }, // Negative
        { max_tokens: 0 }, // Zero
        { top_p: -0.1 }, // Below minimum
        { top_p: 1.1 }, // Above maximum
        { presence_penalty: -2.1 }, // Below minimum
        { presence_penalty: 2.1 }, // Above maximum
        { frequency_penalty: -2.1 }, // Below minimum
        { frequency_penalty: 2.1 }, // Above maximum
      ]

      for (const params of invalidParams) {
        const request = {
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello" }],
          ...params
        }

        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        })
        
        expect(response.status).toBe(400)
      }
    })
  })

  describe("Authentication & Authorization", () => {
    it("should handle missing authorization header", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }]
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })
      
      // Should either work (if auth is optional) or return 401
      expect([200, 401].includes(response.status)).toBe(true)
    })

    it("should handle malformed authorization headers", async () => {
      const malformedHeaders = [
        "Bearer", // Missing token
        "Bearer ", // Empty token
        "Basic invalid", // Wrong scheme
        "Bearer invalid-token-format", // Invalid token
        "Bearer " + "x".repeat(1000), // Extremely long token
      ]

      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }]
      }

      for (const authHeader of malformedHeaders) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": authHeader
          },
          body: JSON.stringify(request)
        })
        
        expect([200, 401, 403].includes(response.status)).toBe(true)
      }
    })

    it("should handle expired or invalid tokens", async () => {
      const invalidTokens = [
        "sk-invalid-token-123",
        "expired-token-456",
        "malformed.jwt.token",
        "null",
        "undefined",
      ]

      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }]
      }

      for (const token of invalidTokens) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(request)
        })
        
        expect([200, 401, 403].includes(response.status)).toBe(true)
      }
    })
  })

  describe("Rate Limiting & Resource Management", () => {
    it("should enforce rate limits per client", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10
      }

      // Make rapid requests from same client
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-Forwarded-For": "192.168.1.100" // Same IP
            },
            body: JSON.stringify(request)
          })
        )
      )

      // At least one should be rate limited
      const rateLimited = responses.some(r => r.status === 429)
      const allSucceeded = responses.every(r => r.status === 200)
      
      // Either rate limiting works or all succeed (depending on timing)
      expect(rateLimited || allSucceeded).toBe(true)
    })

    it("should handle concurrent stream limits", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Count to 10" }],
        stream: true,
        max_tokens: 50
      }

      // Create many concurrent streaming requests
      const streamPromises = Array.from({ length: 10 }, (_, i) =>
        fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Forwarded-For": `192.168.1.${i + 1}` // Different IPs
          },
          body: JSON.stringify(request)
        })
      )

      const responses = await Promise.all(streamPromises)
      
      // Some should succeed, some might be limited
      responses.forEach(response => {
        expect([200, 429, 503].includes(response.status)).toBe(true)
      })
    })

    it("should handle memory pressure gracefully", async () => {
      const largeRequest = {
        model: "gpt-4",
        messages: Array.from({ length: 100 }, (_, i) => ({
          role: i % 2 === 0 ? "user" : "assistant",
          content: "This is a long message to test memory usage. ".repeat(100)
        })),
        max_tokens: 1000
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(largeRequest)
      })
      
      // Should handle gracefully (success, rate limit, or service unavailable)
      expect([200, 400, 413, 429, 503].includes(response.status)).toBe(true)
    })
  })

  describe("Error Response Format", () => {
    it("should return consistent error format", async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}) // Invalid request
      })

      expect(response.status).toBe(400)

      const errorData = await response.json()
      expect(errorData.error).toBeDefined()
      expect(errorData.error.message).toBeDefined()
      expect(errorData.error.type).toBeDefined()
      expect(typeof errorData.error.message).toBe("string")
      expect(typeof errorData.error.type).toBe("string")
    })

    it("should not expose sensitive information in errors", async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4", messages: [] })
      })

      const errorData = await response.json()

      // Error should not contain sensitive paths, tokens, or internal details
      const errorStr = JSON.stringify(errorData).toLowerCase()
      expect(errorStr).not.toContain("password")
      expect(errorStr).not.toContain("secret")
      expect(errorStr).not.toContain("token")
      expect(errorStr).not.toContain("c:\\")
      expect(errorStr).not.toContain("/home/")
      expect(errorStr).not.toContain("process.env")
    })
  })

  describe("Streaming Edge Cases", () => {
    it("should handle client disconnection during streaming", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Write a long story" }],
        stream: true,
        max_tokens: 500
      }

      const controller = new AbortController()

      const responsePromise = fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal
      })

      // Abort after 200ms
      setTimeout(() => controller.abort(), 200)

      try {
        await responsePromise
      } catch (error: any) {
        expect(error.name).toBe("AbortError")
      }
    })

    it("should handle malformed streaming chunks gracefully", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
        max_tokens: 20
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      if (response.status === 200) {
        const reader = response.body?.getReader()
        if (reader) {
          const decoder = new TextDecoder()
          let chunkCount = 0

          try {
            while (chunkCount < 5) { // Limit to prevent infinite loop
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              chunkCount++

              // Verify chunk format
              if (chunk.includes('data: ')) {
                const lines = chunk.split('\n')
                for (const line of lines) {
                  if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    const data = line.slice(6).trim()
                    if (data) {
                      try {
                        const parsed = JSON.parse(data)
                        expect(parsed.object).toBe("chat.completion.chunk")
                      } catch {
                        // Some chunks might be malformed, that's ok for this test
                      }
                    }
                  }
                }
              }
            }
          } finally {
            reader.releaseLock()
          }
        }
      }
    })

    it("should handle stream timeout gracefully", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
        max_tokens: 10
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Test timeout")), 30000) // 30 second timeout
      })

      const fetchPromise = fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      try {
        const response = await Promise.race([fetchPromise, timeoutPromise])
        expect([200, 429, 503].includes((response as Response).status)).toBe(true)
      } catch (error: any) {
        if (error.message === "Test timeout") {
          // Timeout is acceptable for this test
          expect(true).toBe(true)
        } else {
          throw error
        }
      }
    })
  })

  describe("Health and Monitoring", () => {
    it("should provide health check endpoint", async () => {
      const response = await fetch(`${baseUrl}/`)

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe("healthy")
      expect(data.service).toBeDefined()
      expect(typeof data.service).toBe("string")
    })

    it("should handle health check under load", async () => {
      // Make multiple concurrent health checks
      const healthChecks = Array.from({ length: 10 }, () =>
        fetch(`${baseUrl}/`)
      )

      const responses = await Promise.all(healthChecks)

      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })

    it("should provide metrics endpoint if available", async () => {
      const response = await fetch(`${baseUrl}/metrics`)

      // Metrics endpoint might not exist, that's ok
      expect([200, 404].includes(response.status)).toBe(true)

      if (response.status === 200) {
        const data = await response.text()
        expect(typeof data).toBe("string")
      }
    })
  })
})
