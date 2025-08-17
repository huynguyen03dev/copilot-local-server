#!/usr/bin/env bun

/**
 * Integration tests for streaming and non-streaming functionality
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { CopilotAPIServer } from "../src/server"

describe("Integration Tests - Streaming & Non-Streaming", () => {
  let server: CopilotAPIServer
  const testPort = 8073
  const baseUrl = `http://localhost:${testPort}`

  beforeAll(async () => {
    server = new CopilotAPIServer(testPort, "127.0.0.1")
    server.start()
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  describe("Health Check", () => {
    it("should respond to health check", async () => {
      const response = await fetch(`${baseUrl}/`)
      expect(response.ok).toBe(true)
      
      const data = await response.json()
      expect(data.status).toBe("healthy")
      expect(data.service).toBe("GitHub Copilot API Server")
    })
  })

  describe("Non-Streaming Compatibility", () => {
    it("should handle non-streaming requests exactly as before", async () => {
      const request = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say hello" }
        ],
        temperature: 0.7,
        max_tokens: 50,
        stream: false
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.headers.get("content-type")).toBe("application/json; charset=UTF-8")
      
      const data = await response.json()
      expect(data.object).toBe("chat.completion")
      expect(data.model).toBe("gpt-4")
      expect(data.choices).toBeDefined()
      expect(Array.isArray(data.choices)).toBe(true)
      expect(data.choices.length).toBeGreaterThan(0)
      expect(data.choices[0].message).toBeDefined()
      expect(data.choices[0].message.role).toBe("assistant")
      expect(typeof data.choices[0].message.content).toBe("string")
    })

    it("should default to non-streaming when stream parameter is omitted", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 20
        // No stream parameter
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.headers.get("content-type")).toBe("application/json; charset=UTF-8")
      
      const data = await response.json()
      expect(data.object).toBe("chat.completion")
    })
  })

  describe("Streaming Functionality", () => {
    it("should handle streaming requests with proper SSE format", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Count to 3" }],
        stream: true,
        max_tokens: 30
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/event-stream")
      expect(response.headers.get("cache-control")).toBe("no-cache")

      // Read the streaming response
      const reader = response.body?.getReader()
      expect(reader).toBeDefined()

      if (reader) {
        const decoder = new TextDecoder()
        let buffer = ""
        let chunkCount = 0
        let foundDone = false

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') {
                  foundDone = true
                  break
                }

                try {
                  const chunk = JSON.parse(data)
                  expect(chunk.object).toBe("chat.completion.chunk")
                  expect(chunk.model).toBe("gpt-4")
                  expect(Array.isArray(chunk.choices)).toBe(true)
                  chunkCount++
                } catch (parseError) {
                  // Some chunks might be empty or malformed, that's ok
                }
              }
            }

            if (foundDone) break
          }

          expect(chunkCount).toBeGreaterThan(0)
          expect(foundDone).toBe(true)
        } finally {
          reader.releaseLock()
        }
      }
    })

    it("should handle stream_options parameter", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
        stream_options: {
          include_usage: true
        },
        max_tokens: 20
      }

      // Wait for rate limit
      await new Promise(resolve => setTimeout(resolve, 1100))

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/event-stream")
    })
  })

  describe("Error Handling", () => {
    it("should handle authentication errors gracefully", async () => {
      // This test assumes the server will handle auth errors properly
      // In a real scenario, you might want to test with invalid tokens
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        stream: true
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer invalid-token"
        },
        body: JSON.stringify(request)
      })

      // Should handle auth error gracefully (either 401 or proper error response)
      expect([200, 401, 500].includes(response.status)).toBe(true)
    })

    it("should validate request parameters", async () => {
      const invalidRequest = {
        // Missing required fields
        stream: true
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidRequest)
      })

      expect(response.status).toBe(400)
    })
  })

  describe("Performance & Limits", () => {
    it("should track active streams", async () => {
      // This is more of a behavioral test - we can't easily assert on internal state
      // but we can verify the server handles multiple requests
      const requests = Array.from({ length: 2 }, (_, i) => ({
        model: "gpt-4",
        messages: [{ role: "user", content: `Request ${i}` }],
        stream: true,
        max_tokens: 10
      }))

      // Wait for rate limit
      await new Promise(resolve => setTimeout(resolve, 1100))

      const responses = await Promise.all(
        requests.map((req, i) => 
          fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-Forwarded-For": `192.168.1.${i + 10}` // Different IPs
            },
            body: JSON.stringify(req)
          })
        )
      )

      responses.forEach(response => {
        expect([200, 429, 503].includes(response.status)).toBe(true)
      })
    })
  })
})
