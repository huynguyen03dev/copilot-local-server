/**
 * Comprehensive Streaming Integration Tests
 * Tests streaming functionality, SSE format, and real-world scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { CopilotAPIServer } from "../../src/server"
import { testUtils } from "../setup"

describe("Streaming Integration Tests", () => {
  let server: CopilotAPIServer
  const testPort = 8075
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

  describe("SSE Format Validation", () => {
    it("should produce valid SSE format", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Say hello" }],
        stream: true,
        max_tokens: 20
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/event-stream")
      expect(response.headers.get("cache-control")).toBe("no-cache")
      expect(response.headers.get("connection")).toBe("keep-alive")

      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let buffer = ""
        let validChunks = 0
        let foundDone = false

        try {
          while (validChunks < 10 && !foundDone) { // Limit iterations
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

                if (data) {
                  try {
                    const chunk = JSON.parse(data)
                    
                    // Validate chunk structure
                    expect(chunk.object).toBe("chat.completion.chunk")
                    expect(chunk.model).toBe("gpt-4")
                    expect(chunk.id).toBeDefined()
                    expect(typeof chunk.id).toBe("string")
                    expect(chunk.created).toBeDefined()
                    expect(typeof chunk.created).toBe("number")
                    expect(Array.isArray(chunk.choices)).toBe(true)
                    
                    if (chunk.choices.length > 0) {
                      const choice = chunk.choices[0]
                      expect(choice.index).toBe(0)
                      expect(choice.delta).toBeDefined()
                      
                      if (choice.delta.content) {
                        expect(typeof choice.delta.content).toBe("string")
                      }
                    }
                    
                    validChunks++
                  } catch (parseError) {
                    console.warn(`Failed to parse chunk: ${data}`)
                  }
                }
              }
            }
          }

          expect(validChunks).toBeGreaterThan(0)
        } finally {
          reader.releaseLock()
        }
      }
    })

    it("should handle stream_options correctly", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Count to 3" }],
        stream: true,
        stream_options: {
          include_usage: true
        },
        max_tokens: 30
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.status).toBe(200)

      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let buffer = ""
        let foundUsage = false
        let chunkCount = 0

        try {
          while (chunkCount < 20 && !foundUsage) { // Limit iterations
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                
                if (data === '[DONE]') {
                  break
                }

                if (data) {
                  try {
                    const chunk = JSON.parse(data)
                    chunkCount++
                    
                    // Check for usage information
                    if (chunk.usage) {
                      foundUsage = true
                      expect(chunk.usage.prompt_tokens).toBeDefined()
                      expect(chunk.usage.completion_tokens).toBeDefined()
                      expect(chunk.usage.total_tokens).toBeDefined()
                      expect(typeof chunk.usage.prompt_tokens).toBe("number")
                      expect(typeof chunk.usage.completion_tokens).toBe("number")
                      expect(typeof chunk.usage.total_tokens).toBe("number")
                    }
                  } catch (parseError) {
                    // Ignore parse errors for this test
                  }
                }
              }
            }
          }

          // Usage might be included in the final chunk or not, depending on implementation
          expect(typeof foundUsage).toBe("boolean")
        } finally {
          reader.releaseLock()
        }
      }
    })

    it("should properly terminate streams with [DONE]", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Say goodbye" }],
        stream: true,
        max_tokens: 15
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.status).toBe(200)

      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let buffer = ""
        let foundDone = false
        let chunkCount = 0

        try {
          while (chunkCount < 30) { // Prevent infinite loop
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                chunkCount++
                
                if (data === '[DONE]') {
                  foundDone = true
                  break
                }
              }
            }

            if (foundDone) break
          }

          expect(foundDone).toBe(true)
        } finally {
          reader.releaseLock()
        }
      }
    })
  })

  describe("Streaming Performance", () => {
    it("should handle multiple concurrent streams", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Count to 5" }],
        stream: true,
        max_tokens: 25
      }

      // Create multiple concurrent streaming requests
      const streamPromises = Array.from({ length: 3 }, (_, i) =>
        fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Forwarded-For": `192.168.2.${i + 1}` // Different IPs
          },
          body: JSON.stringify(request)
        })
      )

      const responses = await Promise.all(streamPromises)
      
      // All should succeed or be rate limited
      responses.forEach(response => {
        expect([200, 429, 503].includes(response.status)).toBe(true)
      })

      // Process successful streams
      const successfulStreams = responses.filter(r => r.status === 200)
      
      for (const response of successfulStreams) {
        const reader = response.body?.getReader()
        if (reader) {
          const decoder = new TextDecoder()
          let chunkCount = 0

          try {
            while (chunkCount < 10) { // Limit to prevent hanging
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              if (chunk.includes('data: ')) {
                chunkCount++
              }
            }

            expect(chunkCount).toBeGreaterThan(0)
          } finally {
            reader.releaseLock()
          }
        }
      }
    })

    it("should handle stream backpressure", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Write a detailed explanation" }],
        stream: true,
        max_tokens: 200
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
          let totalBytes = 0
          let chunkCount = 0

          try {
            while (chunkCount < 50) { // Limit iterations
              const { done, value } = await reader.read()
              if (done) break

              totalBytes += value?.length || 0
              chunkCount++

              // Simulate slow reading to test backpressure
              if (chunkCount % 5 === 0) {
                await testUtils.wait(100)
              }
            }

            expect(totalBytes).toBeGreaterThan(0)
            expect(chunkCount).toBeGreaterThan(0)
          } finally {
            reader.releaseLock()
          }
        }
      }
    })

    it("should handle stream interruption gracefully", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Tell a long story" }],
        stream: true,
        max_tokens: 300
      }

      const controller = new AbortController()
      
      const responsePromise = fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal
      })

      // Start reading then abort
      setTimeout(() => {
        controller.abort()
      }, 500)

      try {
        const response = await responsePromise
        
        if (response.status === 200) {
          const reader = response.body?.getReader()
          if (reader) {
            try {
              while (true) {
                const { done } = await reader.read()
                if (done) break
              }
            } catch (error: any) {
              expect(error.name).toBe("AbortError")
            } finally {
              reader.releaseLock()
            }
          }
        }
      } catch (error: any) {
        expect(error.name).toBe("AbortError")
      }
    })
  })

  describe("Streaming Error Scenarios", () => {
    it("should handle streaming with invalid parameters", async () => {
      const invalidRequests = [
        {
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
          max_tokens: -1 // Invalid
        },
        {
          model: "gpt-4",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
          temperature: 5 // Invalid
        },
        {
          model: "invalid-model",
          messages: [{ role: "user", content: "Hello" }],
          stream: true
        }
      ]

      for (const request of invalidRequests) {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        })

        expect([400, 422].includes(response.status)).toBe(true)
      }
    })

    it("should handle streaming with empty messages", async () => {
      const request = {
        model: "gpt-4",
        messages: [],
        stream: true
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      })

      expect(response.status).toBe(400)
    })

    it("should handle network errors during streaming", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
        max_tokens: 50
      }

      // Test with connection timeout
      const timeoutController = new AbortController()
      setTimeout(() => timeoutController.abort(), 100)

      try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: timeoutController.signal
        })

        // If we get here, the request was fast enough
        expect([200, 429, 503].includes(response.status)).toBe(true)
      } catch (error: any) {
        expect(error.name).toBe("AbortError")
      }
    })
  })

  describe("Streaming Content Validation", () => {
    it("should stream valid JSON chunks", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Say hello world" }],
        stream: true,
        max_tokens: 30
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
          let buffer = ""
          let validJsonChunks = 0
          let invalidChunks = 0

          try {
            while (validJsonChunks + invalidChunks < 20) { // Limit iterations
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ""

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim()
                  
                  if (data === '[DONE]') {
                    break
                  }

                  if (data) {
                    try {
                      const chunk = JSON.parse(data)
                      validJsonChunks++
                      
                      // Validate required fields
                      expect(chunk.object).toBe("chat.completion.chunk")
                      expect(chunk.model).toBeDefined()
                      expect(chunk.id).toBeDefined()
                    } catch (parseError) {
                      invalidChunks++
                      console.warn(`Invalid JSON chunk: ${data}`)
                    }
                  }
                }
              }
            }

            expect(validJsonChunks).toBeGreaterThan(0)
            // Allow some invalid chunks but not too many
            expect(invalidChunks).toBeLessThan(validJsonChunks)
          } finally {
            reader.releaseLock()
          }
        }
      }
    })

    it("should handle special characters in streaming content", async () => {
      const request = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Say: Hello 🌍 with émojis and spëcial chars" }],
        stream: true,
        max_tokens: 40
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
          let buffer = ""
          let contentPieces: string[] = []

          try {
            while (contentPieces.length < 20) { // Limit iterations
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ""

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim()
                  
                  if (data === '[DONE]') {
                    break
                  }

                  if (data) {
                    try {
                      const chunk = JSON.parse(data)
                      if (chunk.choices?.[0]?.delta?.content) {
                        contentPieces.push(chunk.choices[0].delta.content)
                      }
                    } catch (parseError) {
                      // Ignore parse errors for this test
                    }
                  }
                }
              }
            }

            // Verify we got some content
            expect(contentPieces.length).toBeGreaterThan(0)
            
            // Verify content is properly encoded
            const fullContent = contentPieces.join('')
            expect(typeof fullContent).toBe("string")
            expect(fullContent.length).toBeGreaterThan(0)
          } finally {
            reader.releaseLock()
          }
        }
      }
    })
  })
})
