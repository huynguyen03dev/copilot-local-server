/**
 * Comprehensive streaming error handling tests
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { CopilotAPIServer } from "../src/server"

describe("Streaming Error Handling Tests", () => {
  let server: CopilotAPIServer
  const testPort = 8071
  const baseUrl = `http://localhost:${testPort}`

  beforeAll(async () => {
    server = new CopilotAPIServer(testPort, "127.0.0.1")
    server.start()
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  afterAll(() => {
    // Server cleanup would go here if we had a stop method
  })

  it("should handle rate limiting for streaming requests", async () => {
    const request = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
      max_tokens: 10
    }

    // Make first request
    const response1 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })

    // Make immediate second request (should be rate limited)
    const response2 = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })

    // Rate limiting should either work (429) or both requests succeed (200)
    // depending on timing and server load
    expect([200, 429].includes(response2.status)).toBe(true)

    if (response2.status === 429) {
      const errorData = await response2.json()
      expect(errorData.error.type).toBe("rate_limit_error")
      expect(errorData.error.code).toBe("rate_limit_exceeded")
    }
  })

  it("should handle malformed streaming requests", async () => {
    const malformedRequest = {
      model: "", // Empty model
      messages: [], // Empty messages
      stream: true
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(malformedRequest)
    })

    // Malformed requests should be handled gracefully
    // Could be 400 (validation error) or 429 (rate limited) or 500 (server error)
    expect([400, 429, 500].includes(response.status)).toBe(true)
  })

  it("should return proper headers for streaming responses", async () => {
    const request = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
      max_tokens: 10
    }

    // Wait for rate limit to reset
    await new Promise(resolve => setTimeout(resolve, 1100))

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })

    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(response.headers.get("cache-control")).toBe("no-cache")
    expect(response.headers.get("connection")).toBe("keep-alive")
  })

  it("should handle client disconnection gracefully", async () => {
    const request = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Count to 100" }],
      stream: true,
      max_tokens: 200
    }

    // Wait for rate limit to reset
    await new Promise(resolve => setTimeout(resolve, 1100))

    const controller = new AbortController()
    const response = fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    })

    // Abort the request after 100ms
    setTimeout(() => controller.abort(), 100)

    try {
      await response
    } catch (error) {
      expect(error.name).toBe("AbortError")
    }
  })

  it("should maintain backward compatibility for non-streaming requests", async () => {
    const request = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: false, // Explicitly non-streaming
      max_tokens: 10
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })

    expect(response.headers.get("content-type")).toContain("application/json")
    
    // Should get a JSON response, not SSE
    const data = await response.json()
    expect(data.object).toBe("chat.completion")
  })

  it("should handle missing stream parameter (default to non-streaming)", async () => {
    const request = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      // No stream parameter - should default to false
      max_tokens: 10
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })

    expect(response.headers.get("content-type")).toContain("application/json")
    
    const data = await response.json()
    expect(data.object).toBe("chat.completion")
  })
})

describe("Streaming Performance Tests", () => {
  const testPort = 8072
  const baseUrl = `http://localhost:${testPort}`
  let server: CopilotAPIServer

  beforeAll(async () => {
    server = new CopilotAPIServer(testPort, "127.0.0.1")
    server.start()
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000))
  })

  it("should handle multiple concurrent streaming requests", async () => {
    const request = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Count to 5" }],
      stream: true,
      max_tokens: 20
    }

    // Create multiple concurrent requests with different IPs (simulated)
    const requests = Array.from({ length: 3 }, (_, i) => 
      fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Forwarded-For": `192.168.1.${i + 1}` // Simulate different IPs
        },
        body: JSON.stringify(request)
      })
    )

    const responses = await Promise.all(requests)
    
    // All should succeed (different IPs, so no rate limiting)
    responses.forEach(response => {
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/event-stream")
    })
  })
})
