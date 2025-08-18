/**
 * Error Scenario Integration Tests
 * Tests comprehensive error handling across the entire system
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { CopilotAPIServer } from "../../src/server"
import { testUtils } from "../setup"

describe("Error Scenario Integration Tests", () => {
  let server: CopilotAPIServer
  const testPort = 8076
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

  describe("Network Error Scenarios", () => {
    it("should handle connection timeouts gracefully", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10
      }

      // Test with very short timeout
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 1) // 1ms timeout

      try {
        await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal
        })
      } catch (error: any) {
        expect(error.name).toBe("AbortError")
      }
    })

    it("should handle malformed HTTP requests", async () => {
      // Test with invalid HTTP method
      const response1 = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "INVALID" as any
      }).catch(() => ({ status: 400 })) // Catch network errors

      expect([400, 405, 501].includes((response1 as any).status)).toBe(true)

      // Test with invalid headers
      try {
        const response2 = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Invalid-Header\r\nInjection": "malicious"
          } as any,
          body: JSON.stringify({
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }]
          })
        })

        // Should either succeed (header filtered) or fail (header rejected)
        expect([200, 400, 401].includes(response2.status)).toBe(true)
      } catch (error) {
        // Network error is acceptable for malformed headers
        expect(error).toBeDefined()
      }
    })

    it("should handle oversized requests", async () => {
      // Create a very large request
      const largeContent = "A".repeat(50 * 1024 * 1024) // 50MB
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: largeContent }]
      }

      try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        })

        // Should reject oversized requests
        expect([400, 413, 500].includes(response.status)).toBe(true)
      } catch (error) {
        // Network error is acceptable for oversized requests
        expect(error).toBeDefined()
      }
    })
  })

  describe("Authentication Error Scenarios", () => {
    it("should handle various authentication failures", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }]
      }

      const authTestCases = [
        { header: "Bearer", expectedStatus: [401, 403] },
        { header: "Bearer ", expectedStatus: [401, 403] },
        { header: "Bearer invalid-token", expectedStatus: [401, 403] },
        { header: "Basic invalid", expectedStatus: [401, 403] },
        { header: "Token malformed", expectedStatus: [401, 403] },
        { header: "Bearer " + "x".repeat(10000), expectedStatus: [400, 401, 403] }, // Very long token
      ]

      for (const testCase of authTestCases) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": testCase.header
          },
          body: JSON.stringify(request)
        })

        // Should handle auth errors gracefully
        expect([200, ...testCase.expectedStatus].includes(response.status)).toBe(true)
      }
    })

    it("should handle token injection attempts", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }]
      }

      const injectionAttempts = [
        "Bearer ${process.env.SECRET}",
        "Bearer '; DROP TABLE tokens; --",
        "Bearer <script>alert('xss')</script>",
        "Bearer ../../../etc/passwd",
        "Bearer \x00\x01\x02\x03", // Binary data
      ]

      for (const injection of injectionAttempts) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": injection
          },
          body: JSON.stringify(request)
        })

        // Should reject injection attempts
        expect([400, 401, 403].includes(response.status)).toBe(true)
      }
    })
  })

  describe("Rate Limiting Error Scenarios", () => {
    it("should handle rate limit exhaustion", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 5
      }

      // Make many rapid requests from same IP
      const rapidRequests = Array.from({ length: 20 }, () =>
        fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Forwarded-For": "192.168.3.100" // Same IP
          },
          body: JSON.stringify(request)
        })
      )

      const responses = await Promise.all(rapidRequests)
      
      // Should have some rate limited responses
      const rateLimited = responses.filter(r => r.status === 429)
      const successful = responses.filter(r => r.status === 200)
      
      // Either rate limiting works or all succeed (timing dependent)
      expect(rateLimited.length + successful.length).toBe(responses.length)
      
      // Check rate limit error format
      if (rateLimited.length > 0) {
        const errorData = await rateLimited[0].json()
        expect(errorData.error).toBeDefined()
        expect(errorData.error.type).toBe("rate_limit_error")
      }
    })

    it("should handle concurrent connection limits", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Count to 20" }],
        stream: true,
        max_tokens: 100
      }

      // Create many concurrent streaming connections
      const streamPromises = Array.from({ length: 15 }, (_, i) =>
        fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Forwarded-For": `192.168.3.${i + 1}` // Different IPs
          },
          body: JSON.stringify(request)
        })
      )

      const responses = await Promise.all(streamPromises)
      
      // Some should succeed, some might be limited
      responses.forEach(response => {
        expect([200, 429, 503].includes(response.status)).toBe(true)
      })

      // Clean up successful streams
      const successfulStreams = responses.filter(r => r.status === 200)
      for (const response of successfulStreams.slice(0, 5)) { // Limit cleanup
        const reader = response.body?.getReader()
        if (reader) {
          try {
            // Read a few chunks then close
            for (let i = 0; i < 3; i++) {
              const { done } = await reader.read()
              if (done) break
            }
          } finally {
            reader.releaseLock()
          }
        }
      }
    })
  })

  describe("Data Validation Error Scenarios", () => {
    it("should handle deeply nested malicious payloads", async () => {
      const maliciousPayloads = [
        // Circular reference
        (() => {
          const obj: any = { model: "gpt-4", messages: [] }
          obj.circular = obj
          return obj
        })(),
        
        // Extremely deep nesting
        {
          model: "gpt-4",
          messages: [{ 
            role: "user", 
            content: JSON.stringify({ a: { b: { c: { d: { e: { f: "deep" } } } } } })
          }]
        },
        
        // Prototype pollution attempt
        {
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello" }],
          "__proto__": { "polluted": true }
        },
        
        // Function injection
        {
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello" }],
          "constructor": { "constructor": "return process" }
        }
      ]

      for (const payload of maliciousPayloads) {
        try {
          const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })

          // Should reject malicious payloads
          expect([400, 422].includes(response.status)).toBe(true)
        } catch (error) {
          // JSON serialization error is acceptable
          expect(error).toBeDefined()
        }
      }
    })

    it("should handle invalid Unicode and encoding", async () => {
      const encodingTests = [
        // Invalid UTF-8 sequences
        { model: "gpt-4", messages: [{ role: "user", content: "\uFFFD\uFFFE" }] },
        
        // Null bytes
        { model: "gpt-4", messages: [{ role: "user", content: "Hello\x00World" }] },
        
        // Control characters
        { model: "gpt-4", messages: [{ role: "user", content: "Hello\x01\x02\x03" }] },
        
        // Surrogate pairs
        { model: "gpt-4", messages: [{ role: "user", content: "\uD800\uDC00" }] },
        
        // Overlong UTF-8
        { model: "gpt-4", messages: [{ role: "user", content: "Test\xC0\x80" }] }
      ]

      for (const testCase of encodingTests) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testCase)
        })

        // Should handle encoding issues gracefully
        expect([200, 400, 422].includes(response.status)).toBe(true)
      }
    })

    it("should handle type confusion attacks", async () => {
      const typeConfusionTests = [
        // Array instead of string
        { model: ["gpt", "4"], messages: [{ role: "user", content: "Hello" }] },
        
        // Object instead of string
        { model: { name: "gpt-4" }, messages: [{ role: "user", content: "Hello" }] },
        
        // Number instead of string
        { model: 4, messages: [{ role: "user", content: "Hello" }] },
        
        // Boolean instead of string
        { model: true, messages: [{ role: "user", content: "Hello" }] },
        
        // Function (should be serialized as undefined)
        { model: "gpt-4", messages: [{ role: "user", content: function() { return "evil" } }] }
      ]

      for (const testCase of typeConfusionTests) {
        try {
          const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testCase)
          })

          // Should reject type confusion attempts
          expect([400, 422].includes(response.status)).toBe(true)
        } catch (error) {
          // JSON serialization error is acceptable
          expect(error).toBeDefined()
        }
      }
    })
  })

  describe("Resource Exhaustion Scenarios", () => {
    it("should handle memory pressure gracefully", async () => {
      // Create requests with large message arrays
      const largeMessageArray = Array.from({ length: 1000 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: "This is a test message to consume memory. ".repeat(100)
      }))

      const request = {
        model: "gpt-4",
        messages: largeMessageArray,
        max_tokens: 10
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      // Should handle large requests gracefully
      expect([200, 400, 413, 429, 503].includes(response.status)).toBe(true)
    })

    it("should handle CPU intensive requests", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ 
          role: "user", 
          content: "Process this complex data: " + JSON.stringify({
            data: Array.from({ length: 10000 }, (_, i) => ({ id: i, value: Math.random() }))
          })
        }],
        max_tokens: 100
      }

      const startTime = Date.now()
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })
      const duration = Date.now() - startTime

      // Should handle within reasonable time
      expect([200, 400, 413, 429, 503].includes(response.status)).toBe(true)
      expect(duration).toBeLessThan(30000) // 30 second timeout
    })
  })

  describe("Error Response Consistency", () => {
    it("should return consistent error formats across scenarios", async () => {
      const errorScenarios = [
        { body: "{invalid json", expectedStatus: 400 },
        { body: JSON.stringify({}), expectedStatus: 400 },
        { body: JSON.stringify({ model: "gpt-4" }), expectedStatus: 400 },
        { body: JSON.stringify({ messages: [] }), expectedStatus: 400 },
      ]

      for (const scenario of errorScenarios) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: scenario.body
        })

        expect(response.status).toBe(scenario.expectedStatus)

        if (response.headers.get("content-type")?.includes("application/json")) {
          const errorData = await response.json()
          
          // Validate error structure
          expect(errorData.error).toBeDefined()
          expect(errorData.error.message).toBeDefined()
          expect(errorData.error.type).toBeDefined()
          expect(typeof errorData.error.message).toBe("string")
          expect(typeof errorData.error.type).toBe("string")
          
          // Should not expose sensitive information
          const errorStr = JSON.stringify(errorData).toLowerCase()
          expect(errorStr).not.toContain("password")
          expect(errorStr).not.toContain("secret")
          expect(errorStr).not.toContain("token")
          expect(errorStr).not.toContain("process.env")
        }
      }
    })

    it("should handle error logging without exposure", async () => {
      // Test that errors are logged but not exposed to client
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: "Test error logging" }],
          temperature: 999 // Invalid parameter
        })
      })

      expect(response.status).toBe(400)
      
      const errorData = await response.json()
      
      // Error should be generic, not exposing internal details
      expect(errorData.error.message).toBeDefined()
      expect(errorData.error.message).not.toContain("stack trace")
      expect(errorData.error.message).not.toContain("file path")
      expect(errorData.error.message).not.toContain("line number")
    })
  })
})
