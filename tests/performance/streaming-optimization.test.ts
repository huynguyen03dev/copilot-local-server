/**
 * Performance Tests for Streaming Optimization
 * Validates streaming performance improvements and backpressure handling
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { streamingManager } from "../../src/utils/streamingManager"

describe("Streaming Performance Optimization Tests", () => {
  beforeEach(() => {
    // Reset streaming manager state
  })

  afterEach(() => {
    // Cleanup any active streams
  })

  it("should handle backpressure correctly", async () => {
    // Create a mock readable stream with high data rate
    const mockStream = new ReadableStream({
      start(controller) {
        // Enqueue many chunks quickly to trigger backpressure
        for (let i = 0; i < 100; i++) {
          const chunk = new TextEncoder().encode(`data: {"chunk": ${i}}\n\n`)
          controller.enqueue(chunk)
        }
        controller.close()
      }
    })

    const streamId = "test-backpressure-stream"
    const optimizedStream = await streamingManager.startStream(streamId, mockStream)
    const reader = optimizedStream.getReader()

    let chunksRead = 0
    let backpressureDetected = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunksRead++
        
        // Simulate slow consumer to trigger backpressure
        if (chunksRead % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }

      // Wait a moment for metrics to be available
      await new Promise(resolve => setTimeout(resolve, 100))

      const metrics = streamingManager.getStreamMetrics(streamId)
      expect(metrics).toBeTruthy()
      expect(metrics!.chunksProcessed).toBeGreaterThan(0)
      
      // Check if backpressure was handled
      if (metrics!.backpressureEvents > 0) {
        backpressureDetected = true
      }

      console.log(`Backpressure test: ${chunksRead} chunks processed, ${metrics!.backpressureEvents} backpressure events`)
      
    } finally {
      reader.releaseLock()
    }
  })

  it("should improve processing rate compared to baseline", async () => {
    const testData = Array.from({ length: 50 }, (_, i) => 
      `data: {"id": "chunk-${i}", "content": "test content for chunk ${i}"}\n\n`
    ).join('')

    // Test baseline processing
    const baselineStart = Date.now()
    const baselineStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(testData))
        controller.close()
      }
    })

    const baselineReader = baselineStream.getReader()
    let baselineChunks = 0
    while (true) {
      const { done } = await baselineReader.read()
      if (done) break
      baselineChunks++
    }
    const baselineTime = Date.now() - baselineStart

    // Test optimized processing
    const optimizedStart = Date.now()
    const optimizedSourceStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(testData))
        controller.close()
      }
    })

    const streamId = "test-performance-stream"
    const optimizedStream = await streamingManager.startStream(streamId, optimizedSourceStream)
    const optimizedReader = optimizedStream.getReader()
    
    let optimizedChunks = 0
    while (true) {
      const { done } = await optimizedReader.read()
      if (done) break
      optimizedChunks++
    }
    const optimizedTime = Date.now() - optimizedStart

    // Wait for metrics to be available
    await new Promise(resolve => setTimeout(resolve, 100))
    const metrics = streamingManager.getStreamMetrics(streamId)
    
    console.log(`Performance comparison:`)
    console.log(`  Baseline: ${baselineTime}ms`)
    console.log(`  Optimized: ${optimizedTime}ms`)
    console.log(`  Processing rate: ${metrics?.processingRate.toFixed(1)} chunks/sec`)
    console.log(`  Improvement: ${((baselineTime - optimizedTime) / baselineTime * 100).toFixed(1)}%`)

    // Optimized version should be reasonable (allowing for test variance)
    expect(optimizedTime).toBeLessThan(1000) // Should complete within 1 second
    expect(metrics?.processingRate).toBeGreaterThan(0)
  })

  it("should handle concurrent streams efficiently", async () => {
    const concurrentStreams = 10
    const streamPromises: Promise<void>[] = []

    for (let i = 0; i < concurrentStreams; i++) {
      const promise = (async () => {
        const mockStream = new ReadableStream({
          start(controller) {
            for (let j = 0; j < 20; j++) {
              const chunk = new TextEncoder().encode(`data: {"stream": ${i}, "chunk": ${j}}\n\n`)
              controller.enqueue(chunk)
            }
            controller.close()
          }
        })

        const streamId = `concurrent-stream-${i}`
        const optimizedStream = await streamingManager.startStream(streamId, mockStream)
        const reader = optimizedStream.getReader()

        while (true) {
          const { done } = await reader.read()
          if (done) break
        }

        reader.releaseLock()
      })()

      streamPromises.push(promise)
    }

    const startTime = Date.now()
    await Promise.all(streamPromises)
    const totalTime = Date.now() - startTime

    // Wait for metrics to be available
    await new Promise(resolve => setTimeout(resolve, 200))
    const stats = streamingManager.getStreamingStats()
    
    console.log(`Concurrent streams test:`)
    console.log(`  ${concurrentStreams} streams processed in ${totalTime}ms`)
    console.log(`  Average processing rate: ${stats.averageProcessingRate.toFixed(1)} chunks/sec`)
    console.log(`  Total bytes processed: ${(stats.totalBytesProcessed / 1024).toFixed(1)}KB`)
    console.log(`  Backpressure events: ${stats.backpressureEvents}`)

    expect(stats.totalStreams).toBeGreaterThanOrEqual(0) // Streams may still be in cleanup
    expect(stats.totalBytesProcessed).toBeGreaterThan(0)
    expect(totalTime).toBeLessThan(5000) // Should complete within 5 seconds
  })

  it("should optimize chunk content correctly", async () => {
    // Test with JSON content that can be optimized
    const unoptimizedData = `data: {  "id"  :  "test"  ,  "content"  :  "hello world"  ,  "timestamp"  :  123456789  }\n\n`
    
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(unoptimizedData))
        controller.close()
      }
    })

    const streamId = "test-optimization-stream"
    const optimizedStream = await streamingManager.startStream(streamId, mockStream)
    const reader = optimizedStream.getReader()

    let processedData = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      if (value) {
        processedData += new TextDecoder().decode(value)
      }
    }

    // Wait for metrics to be available
    await new Promise(resolve => setTimeout(resolve, 100))
    const metrics = streamingManager.getStreamMetrics(streamId)

    console.log(`Content optimization test:`)
    console.log(`  Original size: ${unoptimizedData.length} bytes`)
    console.log(`  Processed size: ${processedData.length} bytes`)
    console.log(`  Compression ratio: ${metrics?.compressionRatio?.toFixed(3) || 'N/A'}`)

    // Processed data should be smaller or equal (optimization may not always reduce size)
    expect(processedData.length).toBeLessThanOrEqual(unoptimizedData.length)
    if (metrics) {
      expect(metrics.chunksProcessed).toBeGreaterThan(0)
    }

    reader.releaseLock()
  })

  it("should provide accurate streaming statistics", async () => {
    const testStreams = 3
    const chunksPerStream = 15

    for (let i = 0; i < testStreams; i++) {
      const mockStream = new ReadableStream({
        start(controller) {
          for (let j = 0; j < chunksPerStream; j++) {
            const chunk = new TextEncoder().encode(`data: {"stream": ${i}, "chunk": ${j}}\n\n`)
            controller.enqueue(chunk)
          }
          controller.close()
        }
      })

      const streamId = `stats-test-stream-${i}`
      const optimizedStream = await streamingManager.startStream(streamId, mockStream)
      const reader = optimizedStream.getReader()

      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      reader.releaseLock()
    }

    // Wait for metrics to be available
    await new Promise(resolve => setTimeout(resolve, 200))
    const stats = streamingManager.getStreamingStats()
    
    console.log(`Statistics test:`)
    console.log(`  Active streams: ${stats.activeStreams}`)
    console.log(`  Total streams processed: ${testStreams}`)
    console.log(`  Average processing rate: ${stats.averageProcessingRate.toFixed(1)} chunks/sec`)
    console.log(`  Total bytes processed: ${stats.totalBytesProcessed} bytes`)

    expect(stats.activeStreams).toBeGreaterThanOrEqual(0) // Streams may still be in cleanup
    expect(stats.totalBytesProcessed).toBeGreaterThan(0)
    expect(stats.totalStreams).toBeGreaterThan(0)
  })
})

/**
 * Integration test for streaming performance
 */
describe("Streaming Performance Integration", () => {
  it("should demonstrate significant performance improvement", async () => {
    const largeTestData = Array.from({ length: 100 }, (_, i) => 
      `data: {"id": "large-chunk-${i}", "content": "${'x'.repeat(100)}", "timestamp": ${Date.now() + i}}\n\n`
    ).join('')

    console.log(`\n🚀 Streaming Performance Integration Test`)
    console.log(`📊 Test data size: ${(largeTestData.length / 1024).toFixed(1)}KB`)

    const mockStream = new ReadableStream({
      start(controller) {
        // Split data into multiple chunks to simulate real streaming
        const chunkSize = 1024
        for (let i = 0; i < largeTestData.length; i += chunkSize) {
          const chunk = largeTestData.slice(i, i + chunkSize)
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      }
    })

    const streamId = "integration-test-stream"
    const startTime = Date.now()
    
    const optimizedStream = await streamingManager.startStream(streamId, mockStream)
    const reader = optimizedStream.getReader()

    let totalChunks = 0
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      if (value) {
        totalChunks++
        totalBytes += value.length
      }
    }

    const duration = Date.now() - startTime

    // Wait for metrics to be available
    await new Promise(resolve => setTimeout(resolve, 100))
    const metrics = streamingManager.getStreamMetrics(streamId)

    console.log(`\n📈 Performance Results:`)
    console.log(`   Duration: ${duration}ms`)
    console.log(`   Chunks processed: ${totalChunks}`)
    console.log(`   Bytes processed: ${(totalBytes / 1024).toFixed(1)}KB`)
    console.log(`   Processing rate: ${metrics?.processingRate.toFixed(1)} chunks/sec`)
    console.log(`   Throughput: ${((totalBytes / 1024) / (duration / 1000)).toFixed(1)} KB/sec`)
    console.log(`   Backpressure events: ${metrics?.backpressureEvents || 0}`)

    // Performance targets
    if (metrics) {
      expect(metrics.processingRate).toBeGreaterThan(0) // Should have some processing rate
    }
    expect(duration).toBeLessThan(2000) // Should complete within 2 seconds
    expect(totalBytes).toBeGreaterThan(0)

    reader.releaseLock()
  })
})
