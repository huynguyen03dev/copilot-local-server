/**
 * Performance Tests for Response Compression
 * Tests compression effectiveness, bandwidth savings, and performance impact
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Hono } from "hono"
import { 
  compressionMiddleware, 
  DEFAULT_COMPRESSION_CONFIG, 
  PRODUCTION_COMPRESSION_CONFIG 
} from "../../src/middleware/streamingValidation"

describe("Response Compression Performance Tests", () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
  })

  describe("Compression Effectiveness", () => {
    it("should compress JSON responses effectively", async () => {
      // Add compression middleware
      app.use("*", compressionMiddleware(DEFAULT_COMPRESSION_CONFIG))

      // Create test endpoint with large JSON response
      app.get("/large-json", (c) => {
        const largeData = {
          messages: Array.from({ length: 100 }, (_, i) => ({
            id: i,
            content: `This is a test message ${i} with repeated content `.repeat(10),
            timestamp: Date.now(),
            metadata: {
              type: "test",
              priority: "normal",
              tags: ["test", "performance", "compression"],
              description: "A longer description field that contains more text to compress".repeat(5)
            }
          })),
          pagination: {
            page: 1,
            limit: 100,
            total: 1000,
            hasNext: true,
            hasPrev: false
          },
          metadata: {
            requestId: "test-compression-request",
            timestamp: Date.now(),
            version: "1.0.0",
            environment: "test"
          }
        }
        return c.json(largeData)
      })

      const response = await app.request("/large-json", {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br'
        }
      })

      expect(response.status).toBe(200)
      
      const contentEncoding = response.headers.get('content-encoding')
      const contentLength = response.headers.get('content-length')
      
      console.log(`Compression test results:`)
      console.log(`  Content-Encoding: ${contentEncoding}`)
      console.log(`  Compressed size: ${contentLength} bytes`)
      
      // Verify compression was applied
      expect(contentEncoding).toBeTruthy()
      expect(['gzip', 'br', 'deflate']).toContain(contentEncoding)
      
      // Verify response is still valid JSON
      const data = await response.json()
      expect(data.messages).toHaveLength(100)
      expect(data.pagination.total).toBe(1000)
    })

    it("should handle different content types appropriately", async () => {
      app.use("*", compressionMiddleware(DEFAULT_COMPRESSION_CONFIG))

      // JSON endpoint
      app.get("/json", (c) => c.json({ message: "test".repeat(500) }))
      
      // Text endpoint
      app.get("/text", (c) => c.text("This is a long text response. ".repeat(100)))
      
      // HTML endpoint
      app.get("/html", (c) => c.html(`
        <html>
          <body>
            <h1>Test Page</h1>
            <p>${"This is a paragraph with lots of text. ".repeat(50)}</p>
          </body>
        </html>
      `))

      const testCases = [
        { path: "/json", expectedType: "application/json" },
        { path: "/text", expectedType: "text/plain" },
        { path: "/html", expectedType: "text/html" }
      ]

      for (const testCase of testCases) {
        const response = await app.request(testCase.path, {
          headers: { 'Accept-Encoding': 'gzip' }
        })

        const contentType = response.headers.get('content-type')
        const contentEncoding = response.headers.get('content-encoding')
        
        console.log(`${testCase.path} compression:`)
        console.log(`  Content-Type: ${contentType}`)
        console.log(`  Content-Encoding: ${contentEncoding}`)
        
        expect(response.status).toBe(200)
        if (contentType) {
          expect(contentType).toContain(testCase.expectedType)
        }
        
        // Note: Some responses might not be compressed due to size or content type
        console.log(`  Compression applied: ${contentEncoding ? 'Yes' : 'No'}`)
      }
    })

    it("should respect compression threshold", async () => {
      app.use("*", compressionMiddleware({
        threshold: 1000, // 1KB threshold
        enableForSSE: true,
        trackStats: false,
        algorithms: ['gzip']
      }))

      // Small response (below threshold)
      app.get("/small", (c) => c.json({ message: "small" }))
      
      // Large response (above threshold)
      app.get("/large", (c) => c.json({ 
        message: "large response ".repeat(200) // ~2.4KB
      }))

      // Test small response
      const smallResponse = await app.request("/small", {
        headers: { 'Accept-Encoding': 'gzip' }
      })
      
      const smallEncoding = smallResponse.headers.get('content-encoding')
      console.log(`Small response compression: ${smallEncoding || 'none'}`)
      
      // Test large response
      const largeResponse = await app.request("/large", {
        headers: { 'Accept-Encoding': 'gzip' }
      })
      
      const largeEncoding = largeResponse.headers.get('content-encoding')
      const largeSize = largeResponse.headers.get('content-length')
      
      console.log(`Large response compression: ${largeEncoding || 'none'}`)
      console.log(`Large response size: ${largeSize} bytes`)
      
      expect(smallResponse.status).toBe(200)
      expect(largeResponse.status).toBe(200)
      
      // Small response should not be compressed
      expect(smallEncoding).toBeFalsy()
      
      // Large response should be compressed
      expect(largeEncoding).toBe('gzip')
    })

    it("should handle different compression algorithms", async () => {
      app.use("*", compressionMiddleware({
        threshold: 100,
        enableForSSE: true,
        trackStats: false,
        algorithms: ['br', 'gzip', 'deflate']
      }))

      app.get("/test", (c) => c.json({ 
        data: "compression test data ".repeat(100)
      }))

      const algorithms = ['br', 'gzip', 'deflate']
      
      for (const algorithm of algorithms) {
        const response = await app.request("/test", {
          headers: { 'Accept-Encoding': algorithm }
        })

        const contentEncoding = response.headers.get('content-encoding')
        const contentLength = response.headers.get('content-length')
        
        console.log(`${algorithm} compression:`)
        console.log(`  Content-Encoding: ${contentEncoding}`)
        console.log(`  Content-Length: ${contentLength} bytes`)
        
        expect(response.status).toBe(200)
        
        // Should use the requested algorithm (or fallback)
        if (contentEncoding) {
          expect(['br', 'gzip', 'deflate']).toContain(contentEncoding)
        }
      }
    })
  })

  describe("Performance Impact", () => {
    it("should not significantly impact response time", async () => {
      const testData = {
        items: Array.from({ length: 50 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: "A detailed description of the item ".repeat(20),
          metadata: {
            created: Date.now(),
            updated: Date.now(),
            tags: ["tag1", "tag2", "tag3"]
          }
        }))
      }

      // Test without compression
      const appWithoutCompression = new Hono()
      appWithoutCompression.get("/test", (c) => c.json(testData))

      const startWithout = Date.now()
      const responseWithout = await appWithoutCompression.request("/test")
      const durationWithout = Date.now() - startWithout
      
      // Test with compression
      const appWithCompression = new Hono()
      appWithCompression.use("*", compressionMiddleware(DEFAULT_COMPRESSION_CONFIG))
      appWithCompression.get("/test", (c) => c.json(testData))

      const startWith = Date.now()
      const responseWith = await appWithCompression.request("/test", {
        headers: { 'Accept-Encoding': 'gzip' }
      })
      const durationWith = Date.now() - startWith

      console.log(`Performance comparison:`)
      console.log(`  Without compression: ${durationWithout}ms`)
      console.log(`  With compression: ${durationWith}ms`)
      console.log(`  Overhead: ${durationWith - durationWithout}ms`)

      expect(responseWithout.status).toBe(200)
      expect(responseWith.status).toBe(200)
      
      // Compression overhead should be minimal (less than 50ms)
      expect(durationWith - durationWithout).toBeLessThan(50)
    })

    it("should demonstrate bandwidth savings", async () => {
      app.use("*", compressionMiddleware(DEFAULT_COMPRESSION_CONFIG))

      // Create a response with highly compressible content
      const repetitiveData = {
        message: "This is a highly repetitive message that should compress very well. ".repeat(100),
        data: Array.from({ length: 50 }, () => ({
          field1: "repeated value",
          field2: "another repeated value",
          field3: "yet another repeated value",
          field4: "more repeated content for better compression"
        })),
        metadata: {
          timestamp: Date.now(),
          version: "1.0.0",
          environment: "test",
          description: "A metadata object with repeated patterns ".repeat(20)
        }
      }

      app.get("/compressible", (c) => c.json(repetitiveData))

      // Get uncompressed size
      const uncompressedResponse = await app.request("/compressible")
      const uncompressedData = await uncompressedResponse.json()
      const uncompressedSize = new TextEncoder().encode(JSON.stringify(uncompressedData)).length

      // Get compressed response
      const compressedResponse = await app.request("/compressible", {
        headers: { 'Accept-Encoding': 'gzip' }
      })
      
      const contentEncoding = compressedResponse.headers.get('content-encoding')
      const compressedSize = parseInt(compressedResponse.headers.get('content-length') || '0', 10)
      
      const compressionRatio = compressedSize / uncompressedSize
      const savings = uncompressedSize - compressedSize
      const savingsPercent = (1 - compressionRatio) * 100

      console.log(`Bandwidth savings analysis:`)
      console.log(`  Original size: ${uncompressedSize} bytes`)
      console.log(`  Compressed size: ${compressedSize} bytes`)
      console.log(`  Compression ratio: ${compressionRatio.toFixed(3)}`)
      console.log(`  Savings: ${savings} bytes (${savingsPercent.toFixed(1)}%)`)
      console.log(`  Algorithm: ${contentEncoding}`)

      expect(compressedResponse.status).toBe(200)
      expect(contentEncoding).toBeTruthy()
      expect(compressionRatio).toBeLessThan(0.5) // Should achieve at least 50% compression
      expect(savingsPercent).toBeGreaterThan(50) // Should save at least 50%
    })

    it("should handle concurrent requests efficiently", async () => {
      app.use("*", compressionMiddleware(PRODUCTION_COMPRESSION_CONFIG))

      app.get("/concurrent", (c) => c.json({
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          content: `Concurrent test data ${i} `.repeat(10)
        }))
      }))

      const concurrentRequests = 10
      const startTime = Date.now()

      // Make concurrent requests
      const promises = Array.from({ length: concurrentRequests }, () =>
        app.request("/concurrent", {
          headers: { 'Accept-Encoding': 'gzip' }
        })
      )

      const responses = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      console.log(`Concurrent compression test:`)
      console.log(`  Requests: ${concurrentRequests}`)
      console.log(`  Total time: ${totalTime}ms`)
      console.log(`  Average time per request: ${(totalTime / concurrentRequests).toFixed(1)}ms`)

      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(200)
        const contentEncoding = response.headers.get('content-encoding')
        console.log(`  Request ${index + 1}: ${contentEncoding || 'uncompressed'}`)
      })

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(1000) // 1 second for 10 requests
    })
  })

  describe("Edge Cases and Error Handling", () => {
    it("should handle requests without Accept-Encoding header", async () => {
      app.use("*", compressionMiddleware(DEFAULT_COMPRESSION_CONFIG))
      app.get("/test", (c) => c.json({ message: "test".repeat(100) }))

      const response = await app.request("/test") // No Accept-Encoding header

      expect(response.status).toBe(200)
      
      const contentEncoding = response.headers.get('content-encoding')
      console.log(`No Accept-Encoding header: ${contentEncoding || 'uncompressed'}`)
      
      // Should not compress without Accept-Encoding
      expect(contentEncoding).toBeFalsy()
    })

    it("should handle empty responses", async () => {
      app.use("*", compressionMiddleware(DEFAULT_COMPRESSION_CONFIG))
      app.get("/empty", (c) => c.json({}))

      const response = await app.request("/empty", {
        headers: { 'Accept-Encoding': 'gzip' }
      })

      expect(response.status).toBe(200)
      
      const data = await response.json()
      expect(data).toEqual({})
    })

    it("should handle non-JSON responses", async () => {
      app.use("*", compressionMiddleware(DEFAULT_COMPRESSION_CONFIG))
      
      app.get("/binary", (c) => {
        // Simulate binary data
        const binaryData = new Uint8Array(1000).fill(255)
        return c.body(binaryData, {
          headers: { 'Content-Type': 'application/octet-stream' }
        })
      })

      const response = await app.request("/binary", {
        headers: { 'Accept-Encoding': 'gzip' }
      })

      expect(response.status).toBe(200)
      
      const contentType = response.headers.get('content-type')
      const contentEncoding = response.headers.get('content-encoding')
      
      console.log(`Binary response:`)
      console.log(`  Content-Type: ${contentType}`)
      console.log(`  Content-Encoding: ${contentEncoding || 'none'}`)
      
      // Binary data should not be compressed by default
      expect(contentEncoding).toBeFalsy()
    })
  })
})
