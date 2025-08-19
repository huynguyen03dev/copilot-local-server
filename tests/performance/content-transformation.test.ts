/**
 * Performance Tests for Content Transformation Optimization
 * Tests content transformation caching and optimization
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { ContentTransformer, extractTextContent, transformMessagesForCopilot } from "../../src/utils/content"

describe("Content Transformation Performance Tests", () => {
  beforeEach(() => {
    // Clear content transformation cache
    ContentTransformer.clearCache()
  })

  afterEach(() => {
    ContentTransformer.clearCache()
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
      console.log(`  Cache speedup: ${duration2 <= duration1 ? 'YES' : 'NO'}`)

      expect(result1).toBe(result2)
      expect(result1).toBe("Hello world This is a test message")
      
      // Cache hit should be faster or equal (allowing for timing variance)
      expect(duration2).toBeLessThanOrEqual(duration1 + 2)

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
      console.log(`  Processing rate: ${(largeContent.length / Math.max(duration / 1000, 0.001)).toFixed(1)} blocks/sec`)

      expect(result.length).toBeGreaterThan(100000)
      expect(duration).toBeLessThan(200) // Should complete within 200ms
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
      console.log(`  Rate: ${(messages.length / Math.max(duration / 1000, 0.001)).toFixed(1)} messages/sec`)

      expect(transformedMessages).toHaveLength(messages.length)
      expect(transformedMessages[0].content).toBe("Message 0 Additional content 0")
      expect(duration).toBeLessThan(100) // Should complete within 100ms
    })

    it("should handle mixed content types efficiently", async () => {
      const mixedContent = [
        { type: "text", text: "Start of message" },
        { type: "image_url", image_url: { url: "https://example.com/image1.jpg" } },
        { type: "text", text: "Middle text" },
        { type: "image_url", image_url: { url: "https://example.com/image2.jpg" } },
        { type: "text", text: "End of message" }
      ]

      const startTime = Date.now()
      const result = extractTextContent(mixedContent)
      const duration = Date.now() - startTime

      console.log(`Mixed content transformation:`)
      console.log(`  Content blocks: ${mixedContent.length}`)
      console.log(`  Text blocks: 3, Image blocks: 2`)
      console.log(`  Result: "${result}"`)
      console.log(`  Duration: ${duration}ms`)

      expect(result).toBe("Start of message Middle text End of message")
      expect(duration).toBeLessThan(10) // Should be very fast
    })

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

      expect(avgDuration).toBeLessThan(10) // Average should be under 10ms
      expect(maxDuration).toBeLessThan(50) // No single operation should take more than 50ms
    })

    it("should demonstrate cache effectiveness", async () => {
      const testContents = [
        [{ type: "text", text: "Test message 1" }],
        [{ type: "text", text: "Test message 2" }],
        [{ type: "text", text: "Test message 3" }],
        [{ type: "text", text: "Test message 1" }], // Repeat for cache hit
        [{ type: "text", text: "Test message 2" }], // Repeat for cache hit
      ]

      const durations: number[] = []

      for (const content of testContents) {
        const start = Date.now()
        extractTextContent(content)
        const duration = Date.now() - start
        durations.push(duration)
      }

      console.log(`Cache effectiveness test:`)
      console.log(`  First 3 calls (cache misses): ${durations.slice(0, 3).join(', ')}ms`)
      console.log(`  Last 2 calls (cache hits): ${durations.slice(3).join(', ')}ms`)

      const stats = ContentTransformer.getCacheStats()
      console.log(`  Cache size: ${stats.size}`)
      console.log(`  Max cache size: ${stats.maxSize}`)

      expect(stats.size).toBeGreaterThan(0)
      expect(stats.size).toBeLessThanOrEqual(stats.maxSize)
    })

    it("should handle preprocessing correctly", async () => {
      const simpleContent = "Simple string content"
      const complexContent = Array.from({ length: 100 }, (_, i) => ({
        type: "text",
        text: `Complex content block ${i} with lots of text`.repeat(50)
      }))

      // Test simple content preprocessing
      const simplePreprocessing = ContentTransformer.preprocessContent(simpleContent)
      console.log(`Simple content preprocessing:`)
      console.log(`  Valid: ${simplePreprocessing.isValid}`)
      console.log(`  Size: ${simplePreprocessing.estimatedSize} bytes`)
      console.log(`  Complexity: ${simplePreprocessing.complexity}`)

      expect(simplePreprocessing.isValid).toBe(true)
      expect(simplePreprocessing.complexity).toBe('simple')

      // Test complex content preprocessing
      const complexPreprocessing = ContentTransformer.preprocessContent(complexContent)
      console.log(`Complex content preprocessing:`)
      console.log(`  Valid: ${complexPreprocessing.isValid}`)
      console.log(`  Size: ${complexPreprocessing.estimatedSize} bytes`)
      console.log(`  Complexity: ${complexPreprocessing.complexity}`)

      expect(complexPreprocessing.isValid).toBe(true)
      expect(complexPreprocessing.complexity).toBe('complex')
      expect(complexPreprocessing.estimatedSize).toBeGreaterThan(100000)
    })

    it("should handle optimized transformation with preprocessing", async () => {
      const testContent = Array.from({ length: 50 }, (_, i) => ({
        type: "text",
        text: `Optimized test content ${i}`
      }))

      const startTime = Date.now()
      const result = await ContentTransformer.transformWithPreprocessing(testContent)
      const duration = Date.now() - startTime

      console.log(`Optimized transformation with preprocessing:`)
      console.log(`  Content blocks: ${testContent.length}`)
      console.log(`  Result length: ${result.length} characters`)
      console.log(`  Duration: ${duration}ms`)

      expect(result.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(50) // Should be fast
    })
  })

  describe("Performance Regression Tests", () => {
    it("should maintain consistent performance across different content sizes", async () => {
      const sizes = [10, 50, 100, 500, 1000]
      const results: Array<{ size: number; duration: number; rate: number }> = []

      for (const size of sizes) {
        const content = Array.from({ length: size }, (_, i) => ({
          type: "text",
          text: `Performance test message ${i}`
        }))

        const start = Date.now()
        extractTextContent(content)
        const duration = Date.now() - start
        const rate = size / Math.max(duration / 1000, 0.001)

        results.push({ size, duration, rate })
      }

      console.log(`Performance scaling test:`)
      results.forEach(({ size, duration, rate }) => {
        console.log(`  Size ${size}: ${duration}ms (${rate.toFixed(1)} blocks/sec)`)
      })

      // Performance should scale reasonably
      results.forEach(({ duration }) => {
        expect(duration).toBeLessThan(100) // No test should take more than 100ms
      })

      // Rate should remain reasonable even for large content
      const largestTest = results[results.length - 1]
      expect(largestTest.rate).toBeGreaterThan(1000) // Should process at least 1000 blocks/sec
    })
  })
})
