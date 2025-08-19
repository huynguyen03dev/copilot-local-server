/**
 * Performance Tests for Request Processing Optimization
 * Tests streaming validation, content transformation caching, and single-pass processing
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Hono } from "hono"
import { streamingValidationMiddleware, StreamingValidator } from "../../src/middleware/streamingValidation"
import { requestSizeMiddleware } from "../../src/middleware/requestSize"
import { ContentTransformer, extractTextContent, transformMessagesForCopilot } from "../../src/utils/content"

describe("Request Processing Performance Tests", () => {
  beforeEach(() => {
    // Clear content transformation cache
    ContentTransformer.clearCache()
  })

  afterEach(() => {
    ContentTransformer.clearCache()
  })

  describe("Streaming Validation Performance", () => {
    it("should handle large JSON requests efficiently", async () => {
      const validator = new StreamingValidator({
        maxChunkSize: 8192,
        maxTotalSize: 1024 * 1024, // 1MB
        maxJsonDepth: 10,
        maxArrayLength: 1000,
        enableStreamingParsing: true,
        chunkTimeout: 5000
      })

      // Create a large JSON payload
      const largeArray = Array.from({ length: 500 }, (_, i) => ({
        id: i,
        message: `Test message ${i}`,
        content: `This is a longer content block for testing purposes ${i}`.repeat(10),
        metadata: {
          timestamp: Date.now(),
          type: "test",
          nested: {
            level1: {
              level2: {
                data: `nested data ${i}`
              }
            }
          }
        }
      }))

      const jsonString = JSON.stringify({ messages: largeArray })
      const jsonBytes = new TextEncoder().encode(jsonString)

      console.log(`Testing large JSON: ${jsonBytes.length} bytes`)

      const startTime = Date.now()
      
      // Split into chunks and validate
      const chunkSize = 8192
      let isComplete = false
      
      for (let i = 0; i < jsonBytes.length; i += chunkSize) {
        const chunk = jsonBytes.slice(i, i + chunkSize)
        const result = validator.validateChunk(chunk)
        
        expect(result.valid).toBe(true)
        
        if (result.isComplete) {
          isComplete = true
          break
        }
      }

      const duration = Date.now() - startTime
      const stats = validator.getStats()

      console.log(`Streaming validation results:`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Bytes processed: ${stats.bytesProcessed}`)
      console.log(`  Chunks processed: ${stats.chunksProcessed}`)
      console.log(`  Processing rate: ${(stats.bytesProcessed / 1024 / (duration / 1000)).toFixed(1)} KB/sec`)

      expect(isComplete).toBe(true)
      expect(stats.bytesProcessed).toBe(jsonBytes.length)
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
      expect(stats.chunksProcessed).toBeGreaterThan(0)
    })

    it("should detect invalid JSON structures efficiently", async () => {
      const validator = new StreamingValidator({
        maxChunkSize: 1024,
        maxTotalSize: 10000,
        maxJsonDepth: 3,
        maxArrayLength: 10,
        enableStreamingParsing: true,
        chunkTimeout: 1000
      })

      // Test deeply nested JSON (should fail)
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: "too deep"
              }
            }
          }
        }
      }

      const jsonBytes = new TextEncoder().encode(JSON.stringify(deeplyNested))
      const result = validator.validateChunk(jsonBytes)

      expect(result.valid).toBe(false)
      expect(result.error).toContain("nesting too deep")
    })

    it("should handle malformed JSON gracefully", async () => {
      const validator = new StreamingValidator({
        maxChunkSize: 1024,
        maxTotalSize: 10000,
        maxJsonDepth: 10,
        maxArrayLength: 100,
        enableStreamingParsing: true,
        chunkTimeout: 1000
      })

      // Test malformed JSON
      const malformedJson = '{"key": "value", "incomplete":'
      const jsonBytes = new TextEncoder().encode(malformedJson)
      
      const result = validator.validateChunk(jsonBytes)
      
      // Should be valid but incomplete
      expect(result.valid).toBe(true)
      expect(result.isComplete).toBe(false)
      expect(result.needsMoreData).toBe(true)
    })
  })

  describe("Content Transformation Caching", () => {
    it("should cache content transformations effectively", async () => {
      const testContent = [
        { type: "text", text: "Hello world" },
        { type: "text", text: "This is a test message" },
        { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
      ]

      // First transformation (cache miss)
      const start1 = Date.now()
      const result1 = extractTextContent(testContent)
      const duration1 = Date.now() - start1

      // Second transformation (cache hit)
      const start2 = Date.now()
      const result2 = extractTextContent(testContent)
      const duration2 = Date.now() - start2

      console.log(`Content transformation performance:`)
      console.log(`  First call (cache miss): ${duration1}ms`)
      console.log(`  Second call (cache hit): ${duration2}ms`)
      console.log(`  Cache speedup: ${duration2 < duration1 ? 'YES' : 'NO'}`)

      expect(result1).toBe(result2)
      expect(result1).toBe("Hello world This is a test message")
      
      // Cache hit should be faster (allowing for timing variance)
      expect(duration2).toBeLessThanOrEqual(duration1 + 1)

      // Check cache statistics
      const stats = ContentTransformer.getCacheStats()
      expect(stats.size).toBeGreaterThan(0)
    })

    it("should handle large content arrays efficiently", async () => {
      // Create large content array
      const largeContent = Array.from({ length: 1000 }, (_, i) => ({
        type: "text",
        text: `Message ${i}: ${'x'.repeat(100)}`
      }))

      const startTime = Date.now()
      const result = extractTextContent(largeContent)
      const duration = Date.now() - startTime

      console.log(`Large content transformation:`)
      console.log(`  Content blocks: ${largeContent.length}`)
      console.log(`  Result length: ${result.length} characters`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Processing rate: ${(largeContent.length / (duration / 1000)).toFixed(1)} blocks/sec`)

      expect(result.length).toBeGreaterThan(100000)
      expect(duration).toBeLessThan(100) // Should complete within 100ms
    })

    it("should optimize message transformation for batches", async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: "user" as const,
        content: [
          { type: "text", text: `Message ${i}` },
          { type: "text", text: `Additional content ${i}` }
        ]
      }))

      const startTime = Date.now()
      const transformedMessages = transformMessagesForCopilot(messages)
      const duration = Date.now() - startTime

      console.log(`Batch message transformation:`)
      console.log(`  Messages: ${messages.length}`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Rate: ${(messages.length / (duration / 1000)).toFixed(1)} messages/sec`)

      expect(transformedMessages).toHaveLength(messages.length)
      expect(transformedMessages[0].content).toBe("Message 0 Additional content 0")
      expect(duration).toBeLessThan(50) // Should complete within 50ms
    })
  })

  describe("Single-Pass Processing Integration", () => {
    it("should process requests in a single pass", async () => {
      const app = new Hono()
      
      // Add middleware
      app.use("*", streamingValidationMiddleware({
        maxChunkSize: 1024,
        maxTotalSize: 10000,
        maxJsonDepth: 10,
        maxArrayLength: 100,
        enableStreamingParsing: true,
        chunkTimeout: 1000
      }))
      
      app.use("*", requestSizeMiddleware({
        maxBodySize: 10000,
        maxJsonDepth: 10,
        maxArrayLength: 100,
        maxStringLength: 1000
      }))

      // Test endpoint
      app.post("/test", async (c) => {
        const parsedBody = c.get('parsedBody')
        const metadata = c.get('requestValidationMetadata')
        
        return c.json({
          success: true,
          bodyReceived: !!parsedBody,
          metadata: metadata || null
        })
      })

      // Test request
      const testData = {
        messages: [
          { role: "user", content: "Test message" },
          { role: "assistant", content: "Test response" }
        ],
        model: "gpt-4",
        stream: false
      }

      const startTime = Date.now()
      
      const response = await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(testData)
      })

      const duration = Date.now() - startTime
      const result = await response.json()

      console.log(`Single-pass processing:`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Success: ${result.success}`)
      console.log(`  Body received: ${result.bodyReceived}`)
      console.log(`  Metadata: ${JSON.stringify(result.metadata)}`)

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.bodyReceived).toBe(true)
      expect(duration).toBeLessThan(20) // Should be very fast
    })

    it("should handle large requests with streaming validation", async () => {
      const app = new Hono()
      
      app.use("*", streamingValidationMiddleware({
        maxChunkSize: 2048,
        maxTotalSize: 100000,
        maxJsonDepth: 10,
        maxArrayLength: 1000,
        enableStreamingParsing: true,
        chunkTimeout: 5000
      }))

      app.post("/large-test", async (c) => {
        const streamingBody = c.get('streamingValidatedBody')
        return c.json({
          success: true,
          streamingValidated: !!streamingBody,
          messageCount: streamingBody?.messages?.length || 0
        })
      })

      // Create large request
      const largeMessages = Array.from({ length: 200 }, (_, i) => ({
        role: "user",
        content: `Large message ${i}: ${'x'.repeat(100)}`
      }))

      const largeData = {
        messages: largeMessages,
        model: "gpt-4",
        stream: true
      }

      const startTime = Date.now()
      
      const response = await app.request("/large-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(largeData)
      })

      const duration = Date.now() - startTime
      const result = await response.json()

      console.log(`Large request streaming validation:`)
      console.log(`  Request size: ${JSON.stringify(largeData).length} bytes`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Streaming validated: ${result.streamingValidated}`)
      console.log(`  Message count: ${result.messageCount}`)

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.messageCount).toBe(200)
      expect(duration).toBeLessThan(500) // Should complete within 500ms
    })
  })

  describe("Performance Regression Tests", () => {
    it("should maintain performance under load", async () => {
      const iterations = 50
      const durations: number[] = []

      for (let i = 0; i < iterations; i++) {
        const content = Array.from({ length: 10 }, (_, j) => ({
          type: "text",
          text: `Load test message ${i}-${j}`
        }))

        const start = Date.now()
        extractTextContent(content)
        const duration = Date.now() - start
        
        durations.push(duration)
      }

      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
      const maxDuration = Math.max(...durations)
      const minDuration = Math.min(...durations)

      console.log(`Load test results (${iterations} iterations):`)
      console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`)
      console.log(`  Min duration: ${minDuration}ms`)
      console.log(`  Max duration: ${maxDuration}ms`)
      console.log(`  Standard deviation: ${Math.sqrt(durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length).toFixed(2)}ms`)

      expect(avgDuration).toBeLessThan(5) // Average should be under 5ms
      expect(maxDuration).toBeLessThan(20) // No single operation should take more than 20ms
    })
  })
})
