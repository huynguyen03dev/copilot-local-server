/**
 * Performance Tests for Advanced Logging System
 * Tests batch logging, async logging, and performance metrics collection
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { 
  BatchLogger, 
  createBatchLogger, 
  TEST_BATCH_CONFIG,
  DEFAULT_BATCH_CONFIG 
} from "../../src/utils/batchLogger"
import { 
  AsyncLogger, 
  createAsyncLogger, 
  TEST_ASYNC_CONFIG,
  DEFAULT_ASYNC_CONFIG 
} from "../../src/utils/asyncLogger"
import { 
  PerformanceLogger, 
  measurePerformance,
  getPerformanceLogger 
} from "../../src/utils/performanceLogger"
import { LogLevel } from "../../src/utils/logger"

describe("Advanced Logging Performance Tests", () => {
  let batchLogger: BatchLogger
  let asyncLogger: AsyncLogger
  let performanceLogger: PerformanceLogger

  beforeEach(() => {
    batchLogger = createBatchLogger(TEST_BATCH_CONFIG)
    asyncLogger = createAsyncLogger(TEST_ASYNC_CONFIG)
    performanceLogger = new PerformanceLogger(asyncLogger)
  })

  afterEach(async () => {
    await batchLogger.shutdown()
    await asyncLogger.shutdown()
    await performanceLogger.shutdown()
  })

  describe("Batch Logger Performance", () => {
    it("should handle high-volume logging efficiently", async () => {
      const startTime = Date.now()
      const logCount = 1000

      // Generate many log entries
      const promises: Promise<void>[] = []
      for (let i = 0; i < logCount; i++) {
        promises.push(batchLogger.log({
          timestamp: Date.now(),
          level: 'INFO',
          category: 'TEST',
          message: `Test log entry ${i}`,
          metadata: { index: i, batch: 'performance-test' }
        }))
      }

      await Promise.all(promises)
      await batchLogger.flush()

      const duration = Date.now() - startTime
      const logsPerSecond = Math.round(logCount / (duration / 1000))

      console.log(`Batch logging performance:`)
      console.log(`  Logs: ${logCount}`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Rate: ${logsPerSecond} logs/sec`)

      const metrics = batchLogger.getMetrics()
      console.log(`  Batches written: ${metrics.batchesWritten}`)
      console.log(`  Average batch size: ${metrics.averageBatchSize.toFixed(1)}`)
      console.log(`  Average flush time: ${metrics.averageFlushTime.toFixed(1)}ms`)

      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
      expect(logsPerSecond).toBeGreaterThan(100) // Should process at least 100 logs/sec
      expect(metrics.batchesWritten).toBeGreaterThan(0)
      expect(metrics.bufferOverflows).toBe(0) // No buffer overflows
    })

    it("should handle buffer overflow gracefully", async () => {
      const smallBufferLogger = createBatchLogger({
        ...TEST_BATCH_CONFIG,
        maxBufferSize: 10, // Very small buffer
        batchSize: 20 // Larger than buffer to force overflow
      })

      try {
        // Add more entries than buffer can hold
        for (let i = 0; i < 50; i++) {
          await smallBufferLogger.log({
            timestamp: Date.now(),
            level: 'INFO',
            category: 'OVERFLOW_TEST',
            message: `Overflow test ${i}`
          })
        }

        await smallBufferLogger.flush()

        const metrics = smallBufferLogger.getMetrics()
        console.log(`Buffer overflow test:`)
        console.log(`  Buffer overflows: ${metrics.bufferOverflows}`)
        console.log(`  Total entries: ${metrics.totalEntries}`)
        console.log(`  Batches written: ${metrics.batchesWritten}`)

        expect(metrics.bufferOverflows).toBeGreaterThan(0)
        expect(metrics.totalEntries).toBe(50)

      } finally {
        await smallBufferLogger.shutdown()
      }
    })

    it("should demonstrate batch efficiency vs individual logging", async () => {
      const logCount = 500

      // Test individual logging (simulated)
      const startIndividual = Date.now()
      for (let i = 0; i < logCount; i++) {
        // Simulate individual console.log calls
        const message = `Individual log ${i}`
        // Don't actually log to avoid spam
      }
      const individualDuration = Date.now() - startIndividual

      // Test batch logging
      const startBatch = Date.now()
      const batchPromises: Promise<void>[] = []
      for (let i = 0; i < logCount; i++) {
        batchPromises.push(batchLogger.log({
          timestamp: Date.now(),
          level: 'INFO',
          category: 'BATCH_TEST',
          message: `Batch log ${i}`
        }))
      }
      await Promise.all(batchPromises)
      await batchLogger.flush()
      const batchDuration = Date.now() - startBatch

      console.log(`Batch vs Individual logging:`)
      console.log(`  Individual (simulated): ${individualDuration}ms`)
      console.log(`  Batch logging: ${batchDuration}ms`)
      console.log(`  Efficiency gain: ${individualDuration < batchDuration ? 'None (overhead)' : `${Math.round((individualDuration - batchDuration) / individualDuration * 100)}%`}`)

      const metrics = batchLogger.getMetrics()
      expect(metrics.totalEntries).toBe(logCount)
      expect(batchDuration).toBeLessThan(2000) // Should complete within 2 seconds
    })
  })

  describe("Async Logger Performance", () => {
    it("should handle async logging without blocking", async () => {
      const startTime = Date.now()
      const logCount = 500

      // Start async logging operations
      const promises: Promise<void>[] = []
      for (let i = 0; i < logCount; i++) {
        promises.push(asyncLogger.infoAsync(
          'ASYNC_TEST',
          `Async log message ${i}`,
          { correlationId: `test-${i}` },
          { index: i, timestamp: Date.now() }
        ))
      }

      // Measure time to queue all operations (should be fast)
      const queueTime = Date.now() - startTime

      // Wait for all operations to complete
      await Promise.all(promises)
      await asyncLogger.flush()

      const totalTime = Date.now() - startTime

      console.log(`Async logging performance:`)
      console.log(`  Logs: ${logCount}`)
      console.log(`  Queue time: ${queueTime}ms`)
      console.log(`  Total time: ${totalTime}ms`)
      console.log(`  Queue rate: ${Math.round(logCount / (queueTime / 1000))} logs/sec`)

      const metrics = asyncLogger.getPerformanceMetrics()
      console.log(`  Total async operations: ${metrics.asyncOperations}`)
      console.log(`  Average log time: ${metrics.averageLogTime.toFixed(2)}ms`)
      console.log(`  Queue overflows: ${metrics.queueOverflows}`)

      expect(queueTime).toBeLessThan(100) // Queueing should be very fast
      expect(totalTime).toBeLessThan(3000) // Total should complete within 3 seconds
      expect(metrics.queueOverflows).toBe(0) // No queue overflows
    })

    it("should track performance metrics accurately", async () => {
      const testOperations = [
        { category: 'API', message: 'API call completed', delay: 10 },
        { category: 'DB', message: 'Database query', delay: 50 },
        { category: 'CACHE', message: 'Cache operation', delay: 5 }
      ]

      // Perform various async logging operations
      for (const op of testOperations) {
        await new Promise(resolve => setTimeout(resolve, op.delay))
        await asyncLogger.infoAsync(op.category, op.message)
      }

      await asyncLogger.flush()

      const metrics = asyncLogger.getPerformanceMetrics()
      console.log(`Async logger metrics:`)
      console.log(`  Total logs: ${metrics.totalLogs}`)
      console.log(`  Average log time: ${metrics.averageLogTime.toFixed(2)}ms`)
      console.log(`  Max log time: ${metrics.maxLogTime}ms`)
      console.log(`  Min log time: ${metrics.minLogTime}ms`)

      expect(metrics.totalLogs).toBe(testOperations.length)
      expect(metrics.averageLogTime).toBeGreaterThan(0)
      expect(metrics.maxLogTime).toBeGreaterThanOrEqual(metrics.minLogTime)
    })

    it("should handle queue overflow gracefully", async () => {
      const smallQueueLogger = createAsyncLogger({
        ...TEST_ASYNC_CONFIG,
        queueMaxSize: 5, // Very small queue
        enableAsyncQueue: true
      })

      try {
        // Add more operations than queue can hold
        const promises: Promise<void>[] = []
        for (let i = 0; i < 20; i++) {
          promises.push(smallQueueLogger.infoAsync(
            'OVERFLOW_TEST',
            `Queue overflow test ${i}`
          ))
        }

        await Promise.all(promises)
        await smallQueueLogger.flush()

        const metrics = smallQueueLogger.getPerformanceMetrics()
        console.log(`Queue overflow test:`)
        console.log(`  Queue overflows: ${metrics.queueOverflows}`)
        console.log(`  Total logs: ${metrics.totalLogs}`)

        expect(metrics.queueOverflows).toBeGreaterThan(0)

      } finally {
        await smallQueueLogger.shutdown()
      }
    })
  })

  describe("Performance Logger", () => {
    it("should measure and track operation performance", async () => {
      const operations = [
        { name: 'fast-operation', duration: 10 },
        { name: 'medium-operation', duration: 100 },
        { name: 'slow-operation', duration: 500 }
      ]

      // Perform measured operations
      for (const op of operations) {
        const measurement = performanceLogger.startMeasurement(op.name, 'TEST')
        
        // Simulate operation
        await new Promise(resolve => setTimeout(resolve, op.duration))
        
        const actualDuration = await measurement.end()
        expect(actualDuration).toBeGreaterThanOrEqual(op.duration - 10) // Allow 10ms tolerance
      }

      await performanceLogger.flush()

      // Check operation statistics
      const stats = performanceLogger.getOperationStats()
      console.log(`Performance tracking results:`)
      stats.forEach(stat => {
        console.log(`  ${stat.operation}: ${stat.count} calls, ${stat.averageDuration.toFixed(1)}ms avg`)
      })

      expect(stats.length).toBe(operations.length)
      
      // Find slow operation stats
      const slowOpStats = stats.find(s => s.operation === 'slow-operation')
      expect(slowOpStats).toBeTruthy()
      expect(slowOpStats!.averageDuration).toBeGreaterThan(400) // Should be around 500ms
    })

    it("should generate comprehensive performance reports", async () => {
      // Record some performance data
      performanceLogger.recordRequest()
      performanceLogger.recordRequest()
      performanceLogger.recordRequest()

      // Add some measurements
      const measurement1 = performanceLogger.startMeasurement('api-call', 'API')
      await new Promise(resolve => setTimeout(resolve, 50))
      await measurement1.end()

      const measurement2 = performanceLogger.startMeasurement('db-query', 'DATABASE')
      await new Promise(resolve => setTimeout(resolve, 100))
      await measurement2.end()

      await performanceLogger.flush()

      // Generate report
      const report = performanceLogger.generatePerformanceReport()

      console.log(`Performance report:`)
      console.log(`  Memory usage: ${report.summary.memoryUsage.used}MB / ${report.summary.memoryUsage.total}MB`)
      console.log(`  Requests/sec: ${report.summary.requestsPerSecond}`)
      console.log(`  P95 response time: ${report.summary.responseTimeP95}ms`)
      console.log(`  Top operations: ${report.topOperations.length}`)
      console.log(`  Recent entries: ${report.recentEntries.length}`)

      expect(report.summary).toBeTruthy()
      expect(report.topOperations.length).toBeGreaterThan(0)
      expect(report.recentEntries.length).toBeGreaterThan(0)
      expect(report.summary.memoryUsage.used).toBeGreaterThan(0)
    })

    it("should handle concurrent performance measurements", async () => {
      const concurrentOps = 20
      const promises: Promise<number>[] = []

      // Start concurrent measurements
      for (let i = 0; i < concurrentOps; i++) {
        const measurement = performanceLogger.startMeasurement(`concurrent-op-${i}`, 'CONCURRENT')
        
        promises.push((async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100))
          return measurement.end()
        })())
      }

      const durations = await Promise.all(promises)
      await performanceLogger.flush()

      console.log(`Concurrent measurements:`)
      console.log(`  Operations: ${concurrentOps}`)
      console.log(`  Average duration: ${(durations.reduce((sum, d) => sum + d, 0) / durations.length).toFixed(1)}ms`)
      console.log(`  Min duration: ${Math.min(...durations).toFixed(1)}ms`)
      console.log(`  Max duration: ${Math.max(...durations).toFixed(1)}ms`)

      const stats = performanceLogger.getOperationStats()
      const concurrentStats = stats.filter(s => s.operation.startsWith('concurrent-op'))
      
      expect(concurrentStats.length).toBe(concurrentOps)
      expect(durations.every(d => d > 0)).toBe(true)
    })
  })

  describe("Integration Performance", () => {
    it("should demonstrate end-to-end logging performance", async () => {
      const startTime = Date.now()
      
      // Simulate a complex operation with multiple logging points
      const measurement = measurePerformance('complex-operation', 'INTEGRATION')
      
      // Log various events
      await asyncLogger.infoAsync('INTEGRATION', 'Operation started')
      await new Promise(resolve => setTimeout(resolve, 50))
      
      await asyncLogger.debugAsync('INTEGRATION', 'Processing data', undefined, { step: 1 })
      await new Promise(resolve => setTimeout(resolve, 30))
      
      await asyncLogger.infoAsync('INTEGRATION', 'Data processed successfully')
      await new Promise(resolve => setTimeout(resolve, 20))
      
      const operationDuration = await measurement.end()
      await asyncLogger.infoAsync('INTEGRATION', 'Operation completed', undefined, { duration: operationDuration })

      // Flush all loggers
      await asyncLogger.flush()
      await performanceLogger.flush()

      const totalTime = Date.now() - startTime

      console.log(`End-to-end logging performance:`)
      console.log(`  Total time: ${totalTime}ms`)
      console.log(`  Operation duration: ${operationDuration}ms`)
      console.log(`  Logging overhead: ${totalTime - operationDuration}ms`)

      // Get combined metrics
      const combinedMetrics = asyncLogger.getCombinedMetrics()
      console.log(`  Async logs: ${combinedMetrics.asyncMetrics.totalLogs}`)
      console.log(`  Queue utilization: ${combinedMetrics.queueStatus.utilizationPercent.toFixed(1)}%`)

      expect(totalTime).toBeLessThan(500) // Should complete quickly
      expect(operationDuration).toBeGreaterThan(90) // Should measure actual work time
      expect(combinedMetrics.asyncMetrics.totalLogs).toBeGreaterThan(0)
    })

    it("should maintain performance under sustained load", async () => {
      const duration = 2000 // 2 seconds
      const startTime = Date.now()
      let operationCount = 0

      // Sustained load test
      while (Date.now() - startTime < duration) {
        const measurement = measurePerformance(`load-test-${operationCount}`, 'LOAD_TEST')
        
        await asyncLogger.infoAsync('LOAD_TEST', `Operation ${operationCount}`)
        await new Promise(resolve => setTimeout(resolve, 10))
        
        await measurement.end()
        operationCount++
      }

      await asyncLogger.flush()
      await performanceLogger.flush()

      const actualDuration = Date.now() - startTime
      const operationsPerSecond = Math.round(operationCount / (actualDuration / 1000))

      console.log(`Sustained load test:`)
      console.log(`  Duration: ${actualDuration}ms`)
      console.log(`  Operations: ${operationCount}`)
      console.log(`  Rate: ${operationsPerSecond} ops/sec`)

      const metrics = asyncLogger.getPerformanceMetrics()
      console.log(`  Average log time: ${metrics.averageLogTime.toFixed(2)}ms`)
      console.log(`  Queue overflows: ${metrics.queueOverflows}`)

      expect(operationCount).toBeGreaterThan(50) // Should handle reasonable load
      expect(operationsPerSecond).toBeGreaterThan(25) // Should maintain decent throughput
      expect(metrics.queueOverflows).toBe(0) // Should not overflow under normal load
    })
  })
})
