/**
 * Performance Tests for HTTP/2 Evaluation System
 * Tests HTTP/2 support detection, benchmarking, and configuration generation
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { 
  HTTP2Evaluator,
  getHTTP2Evaluator,
  initializeHTTP2Evaluator,
  DEFAULT_HTTP2_CONFIG,
  PRODUCTION_HTTP2_CONFIG
} from "../../src/utils/http2Support"
import { 
  HTTP2Benchmark,
  createHTTP2Benchmark,
  DEFAULT_BENCHMARK_CONFIG,
  PRODUCTION_BENCHMARK_CONFIG
} from "../../src/utils/http2Benchmark"

describe("HTTP/2 Evaluation Performance Tests", () => {
  let http2Evaluator: HTTP2Evaluator
  let benchmark: HTTP2Benchmark

  beforeEach(() => {
    http2Evaluator = initializeHTTP2Evaluator(DEFAULT_HTTP2_CONFIG)
    benchmark = createHTTP2Benchmark(DEFAULT_BENCHMARK_CONFIG)
  })

  describe("HTTP/2 Support Evaluation", () => {
    it("should evaluate HTTP/2 capabilities efficiently", async () => {
      const startTime = Date.now()

      const evaluation = await http2Evaluator.evaluateHTTP2Support()
      
      const duration = Date.now() - startTime

      console.log(`HTTP/2 evaluation performance:`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Recommended: ${evaluation.recommended}`)
      console.log(`  Server support: ${evaluation.capabilities.serverSupport}`)
      console.log(`  Client support: ${evaluation.capabilities.clientSupport}`)
      console.log(`  Expected latency reduction: ${(evaluation.performanceGains.expectedLatencyReduction * 100).toFixed(1)}%`)
      console.log(`  Expected throughput increase: ${(evaluation.performanceGains.expectedThroughputIncrease * 100).toFixed(1)}%`)

      expect(duration).toBeLessThan(1000) // Should complete within 1 second
      expect(evaluation.recommended).toBeDefined()
      expect(evaluation.capabilities).toBeDefined()
      expect(evaluation.performanceGains).toBeDefined()
      expect(evaluation.requirements).toBeInstanceOf(Array)
      expect(evaluation.limitations).toBeInstanceOf(Array)
      expect(evaluation.migrationSteps).toBeInstanceOf(Array)
    })

    it("should detect Node.js HTTP/2 support", async () => {
      const evaluation = await http2Evaluator.evaluateHTTP2Support()

      console.log(`HTTP/2 capabilities:`)
      console.log(`  Server support: ${evaluation.capabilities.serverSupport}`)
      console.log(`  Multiplexing support: ${evaluation.capabilities.multiplexingSupport}`)
      console.log(`  Header compression: ${evaluation.capabilities.headerCompressionSupport}`)
      console.log(`  Server push: ${evaluation.capabilities.serverPushSupport}`)
      console.log(`  Stream priority: ${evaluation.capabilities.streamPrioritySupport}`)
      console.log(`  TLS required: ${evaluation.capabilities.tlsRequired}`)

      // Node.js should support HTTP/2
      expect(evaluation.capabilities.serverSupport).toBe(true)
      expect(evaluation.capabilities.multiplexingSupport).toBe(true)
      expect(evaluation.capabilities.headerCompressionSupport).toBe(true)
      expect(evaluation.capabilities.serverPushSupport).toBe(true)
      expect(evaluation.capabilities.streamPrioritySupport).toBe(true)
    })

    it("should generate appropriate recommendations", async () => {
      const evaluation = await http2Evaluator.evaluateHTTP2Support()

      console.log(`HTTP/2 recommendation analysis:`)
      console.log(`  Recommended: ${evaluation.recommended}`)
      console.log(`  Requirements count: ${evaluation.requirements.length}`)
      console.log(`  Limitations count: ${evaluation.limitations.length}`)
      console.log(`  Migration steps: ${evaluation.migrationSteps.length}`)

      // Should have reasonable requirements and migration steps
      expect(evaluation.requirements.length).toBeGreaterThan(0)
      expect(evaluation.migrationSteps.length).toBeGreaterThan(5) // Should have comprehensive migration plan
      expect(evaluation.limitations.length).toBeGreaterThan(0) // Should identify potential issues

      // Check for key requirements
      const requirementText = evaluation.requirements.join(' ')
      expect(requirementText).toContain('TLS')
      expect(requirementText).toContain('certificate')
    })

    it("should calculate realistic performance gains", async () => {
      const evaluation = await http2Evaluator.evaluateHTTP2Support()

      console.log(`Performance gains analysis:`)
      console.log(`  Latency reduction: ${(evaluation.performanceGains.expectedLatencyReduction * 100).toFixed(1)}%`)
      console.log(`  Throughput increase: ${(evaluation.performanceGains.expectedThroughputIncrease * 100).toFixed(1)}%`)
      console.log(`  Connection reduction: ${(evaluation.performanceGains.expectedConnectionReduction * 100).toFixed(1)}%`)

      // Performance gains should be realistic
      expect(evaluation.performanceGains.expectedLatencyReduction).toBeGreaterThan(0)
      expect(evaluation.performanceGains.expectedLatencyReduction).toBeLessThan(1) // Less than 100%
      expect(evaluation.performanceGains.expectedThroughputIncrease).toBeGreaterThan(0)
      expect(evaluation.performanceGains.expectedConnectionReduction).toBeGreaterThan(0)
    })

    it("should generate valid HTTP/2 configuration", async () => {
      const evaluation = await http2Evaluator.evaluateHTTP2Support()
      const config = http2Evaluator.generateRecommendedConfig(evaluation)

      console.log(`Generated HTTP/2 configuration:`)
      console.log(`  Enabled: ${config.enabled}`)
      console.log(`  Server push: ${config.enableServerPush}`)
      console.log(`  Header compression: ${config.enableHeaderCompression}`)
      console.log(`  Stream priority: ${config.enableStreamPriority}`)
      console.log(`  Max concurrent streams: ${config.maxConcurrentStreams}`)
      console.log(`  TLS enabled: ${config.enableTLS}`)

      expect(config.enabled).toBeDefined()
      expect(config.maxConcurrentStreams).toBeGreaterThan(0)
      expect(config.maxHeaderListSize).toBeGreaterThan(0)
      expect(config.initialWindowSize).toBeGreaterThan(0)
      expect(config.maxFrameSize).toBeGreaterThan(0)
    })
  })

  describe("HTTP/2 Benchmark Performance", () => {
    it("should run performance comparison efficiently", async () => {
      const startTime = Date.now()
      
      // Use a mock URL for testing
      const mockUrl = 'http://localhost:8069'
      const comparison = await benchmark.runComparison(mockUrl)
      
      const duration = Date.now() - startTime

      console.log(`HTTP/2 benchmark performance:`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  HTTP/1.1 latency: ${comparison.http1Result.averageLatency.toFixed(1)}ms`)
      console.log(`  HTTP/2 latency: ${comparison.http2Result.averageLatency.toFixed(1)}ms`)
      console.log(`  Latency reduction: ${(comparison.improvements.latencyReduction * 100).toFixed(1)}%`)
      console.log(`  Throughput increase: ${(comparison.improvements.throughputIncrease * 100).toFixed(1)}%`)
      console.log(`  Recommendation: ${comparison.recommendation.shouldUpgrade ? 'UPGRADE' : 'STAY'}`)
      console.log(`  Confidence: ${comparison.recommendation.confidence}%`)

      expect(duration).toBeLessThan(60000) // Should complete within 1 minute
      expect(comparison.http1Result).toBeDefined()
      expect(comparison.http2Result).toBeDefined()
      expect(comparison.improvements).toBeDefined()
      expect(comparison.recommendation).toBeDefined()
    })

    it("should generate realistic benchmark results", async () => {
      const mockUrl = 'http://localhost:8069'
      const comparison = await benchmark.runComparison(mockUrl)

      console.log(`Benchmark results validation:`)
      console.log(`  HTTP/1.1 total requests: ${comparison.http1Result.totalRequests}`)
      console.log(`  HTTP/1.1 successful: ${comparison.http1Result.successfulRequests}`)
      console.log(`  HTTP/1.1 failed: ${comparison.http1Result.failedRequests}`)
      console.log(`  HTTP/1.1 throughput: ${comparison.http1Result.throughput.toFixed(1)} req/s`)
      console.log(`  HTTP/2 throughput: ${comparison.http2Result.throughput.toFixed(1)} req/s`)

      // Validate HTTP/1.1 results
      expect(comparison.http1Result.totalRequests).toBeGreaterThan(0)
      expect(comparison.http1Result.averageLatency).toBeGreaterThan(0)
      expect(comparison.http1Result.throughput).toBeGreaterThan(0)
      expect(comparison.http1Result.connectionCount).toBeGreaterThan(0)

      // Validate HTTP/2 results
      expect(comparison.http2Result.protocol).toBe('HTTP/2')
      expect(comparison.http2Result.streamCount).toBeDefined()
      expect(comparison.http2Result.averageLatency).toBeLessThanOrEqual(comparison.http1Result.averageLatency)
      expect(comparison.http2Result.throughput).toBeGreaterThanOrEqual(comparison.http1Result.throughput)
    })

    it("should calculate meaningful performance improvements", async () => {
      const mockUrl = 'http://localhost:8069'
      const comparison = await benchmark.runComparison(mockUrl)

      console.log(`Performance improvements:`)
      console.log(`  Latency reduction: ${(comparison.improvements.latencyReduction * 100).toFixed(1)}%`)
      console.log(`  Throughput increase: ${(comparison.improvements.throughputIncrease * 100).toFixed(1)}%`)
      console.log(`  Connection reduction: ${(comparison.improvements.connectionReduction * 100).toFixed(1)}%`)
      console.log(`  Data efficiency: ${(comparison.improvements.dataEfficiency * 100).toFixed(1)}%`)

      // Improvements should be positive and realistic
      expect(comparison.improvements.latencyReduction).toBeGreaterThan(0)
      expect(comparison.improvements.latencyReduction).toBeLessThan(1) // Less than 100%
      expect(comparison.improvements.throughputIncrease).toBeGreaterThan(0)
      expect(comparison.improvements.connectionReduction).toBeGreaterThan(0)
      expect(comparison.improvements.dataEfficiency).toBeGreaterThan(0)
    })

    it("should provide actionable recommendations", async () => {
      const mockUrl = 'http://localhost:8069'
      const comparison = await benchmark.runComparison(mockUrl)

      console.log(`Recommendation analysis:`)
      console.log(`  Should upgrade: ${comparison.recommendation.shouldUpgrade}`)
      console.log(`  Confidence: ${comparison.recommendation.confidence}%`)
      console.log(`  Reasons count: ${comparison.recommendation.reasons.length}`)
      console.log(`  Reasons: ${comparison.recommendation.reasons.slice(0, 3).join(', ')}`)

      expect(comparison.recommendation.shouldUpgrade).toBeDefined()
      expect(comparison.recommendation.confidence).toBeGreaterThanOrEqual(0)
      expect(comparison.recommendation.confidence).toBeLessThanOrEqual(100)
      expect(comparison.recommendation.reasons).toBeInstanceOf(Array)
      expect(comparison.recommendation.reasons.length).toBeGreaterThan(0)
    })

    it("should handle different benchmark configurations", async () => {
      const customConfig = {
        testDuration: 5000, // 5 seconds for faster testing
        concurrentRequests: 5,
        requestsPerSecond: 20,
        endpoints: ['/v1/models'],
        enableDetailedMetrics: true
      }

      const customBenchmark = createHTTP2Benchmark(customConfig)
      const mockUrl = 'http://localhost:8069'
      
      const startTime = Date.now()
      const comparison = await customBenchmark.runComparison(mockUrl)
      const duration = Date.now() - startTime

      console.log(`Custom benchmark performance:`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Test duration: ${customConfig.testDuration}ms`)
      console.log(`  Requests per second: ${customConfig.requestsPerSecond}`)
      console.log(`  Total requests: ${comparison.http1Result.totalRequests}`)

      expect(duration).toBeLessThan(customConfig.testDuration + 5000) // Allow some overhead
      expect(comparison.http1Result.totalRequests).toBeGreaterThan(0)
    })
  })

  describe("Integration Performance", () => {
    it("should handle concurrent evaluations efficiently", async () => {
      const concurrentEvaluations = 5
      const startTime = Date.now()

      // Run multiple evaluations concurrently
      const promises = Array.from({ length: concurrentEvaluations }, () => 
        http2Evaluator.evaluateHTTP2Support()
      )

      const results = await Promise.all(promises)
      const duration = Date.now() - startTime

      console.log(`Concurrent evaluations performance:`)
      console.log(`  Evaluations: ${concurrentEvaluations}`)
      console.log(`  Total duration: ${duration}ms`)
      console.log(`  Average per evaluation: ${(duration / concurrentEvaluations).toFixed(1)}ms`)
      console.log(`  All recommended: ${results.every(r => r.recommended === results[0].recommended)}`)

      expect(results.length).toBe(concurrentEvaluations)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
      
      // All results should be consistent
      const firstResult = results[0]
      results.forEach(result => {
        expect(result.recommended).toBe(firstResult.recommended)
        expect(result.capabilities.serverSupport).toBe(firstResult.capabilities.serverSupport)
      })
    })

    it("should maintain performance under sustained load", async () => {
      const duration = 10000 // 10 seconds
      const startTime = Date.now()
      let evaluationCount = 0

      // Sustained evaluation load
      while (Date.now() - startTime < duration) {
        await http2Evaluator.evaluateHTTP2Support()
        evaluationCount++
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const actualDuration = Date.now() - startTime
      const evaluationsPerSecond = Math.round(evaluationCount / (actualDuration / 1000))

      console.log(`Sustained load performance:`)
      console.log(`  Duration: ${actualDuration}ms`)
      console.log(`  Evaluations: ${evaluationCount}`)
      console.log(`  Rate: ${evaluationsPerSecond} evaluations/sec`)

      expect(evaluationCount).toBeGreaterThan(10) // Should handle reasonable load
      expect(evaluationsPerSecond).toBeGreaterThan(1) // Should maintain decent throughput
    })

    it("should demonstrate end-to-end HTTP/2 evaluation workflow", async () => {
      const startTime = Date.now()

      // Step 1: Evaluate HTTP/2 support
      const evaluation = await http2Evaluator.evaluateHTTP2Support()
      
      // Step 2: Generate configuration
      const config = http2Evaluator.generateRecommendedConfig(evaluation)
      
      // Step 3: Run benchmark
      const benchmark = createHTTP2Benchmark({
        testDuration: 5000, // Shorter for testing
        concurrentRequests: 3,
        requestsPerSecond: 10
      })
      
      const mockUrl = 'http://localhost:8069'
      const comparison = await benchmark.runComparison(mockUrl)
      
      const totalDuration = Date.now() - startTime

      console.log(`End-to-end workflow performance:`)
      console.log(`  Total duration: ${totalDuration}ms`)
      console.log(`  Evaluation recommended: ${evaluation.recommended}`)
      console.log(`  Config enabled: ${config.enabled}`)
      console.log(`  Benchmark recommendation: ${comparison.recommendation.shouldUpgrade}`)
      console.log(`  Workflow consistency: ${evaluation.recommended === comparison.recommendation.shouldUpgrade}`)

      expect(totalDuration).toBeLessThan(30000) // Should complete within 30 seconds
      expect(evaluation).toBeDefined()
      expect(config).toBeDefined()
      expect(comparison).toBeDefined()
      
      // Results should be consistent
      expect(config.enabled).toBe(evaluation.recommended)
    })
  })
})
