/**
 * Performance Tests for Circuit Breaker System
 * Tests circuit breaker functionality, performance, and resilience
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { 
  CircuitBreaker, 
  createCircuitBreaker,
  TEST_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG 
} from "../../src/utils/circuitBreaker"
import { 
  CircuitBreakerManager,
  initializeCircuitBreakerManager,
  TEST_MANAGER_CONFIG,
  executeWithCircuitBreaker
} from "../../src/utils/circuitBreakerManager"

describe("Circuit Breaker Performance Tests", () => {
  let circuitBreaker: CircuitBreaker
  let manager: CircuitBreakerManager

  beforeEach(() => {
    circuitBreaker = createCircuitBreaker('test-circuit', TEST_CIRCUIT_BREAKER_CONFIG)
    manager = initializeCircuitBreakerManager(TEST_MANAGER_CONFIG)
  })

  afterEach(() => {
    manager.shutdown()
  })

  describe("Circuit Breaker Core Functionality", () => {
    it("should handle successful operations efficiently", async () => {
      const startTime = Date.now()
      const operationCount = 100

      // Execute successful operations
      for (let i = 0; i < operationCount; i++) {
        await circuitBreaker.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 1))
          return `success-${i}`
        })
      }

      const duration = Date.now() - startTime
      const operationsPerSecond = Math.round(operationCount / (duration / 1000))

      console.log(`Circuit breaker successful operations:`)
      console.log(`  Operations: ${operationCount}`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Rate: ${operationsPerSecond} ops/sec`)

      const metrics = circuitBreaker.getMetrics()
      console.log(`  State: ${metrics.state}`)
      console.log(`  Success count: ${metrics.successCount}`)
      console.log(`  Total requests: ${metrics.totalRequests}`)
      console.log(`  Average response time: ${metrics.averageResponseTime.toFixed(1)}ms`)

      expect(metrics.state).toBe('CLOSED')
      expect(metrics.successCount).toBe(operationCount)
      expect(metrics.failureCount).toBe(0)
      expect(operationsPerSecond).toBeGreaterThan(50) // Should handle at least 50 ops/sec
    })

    it("should transition to OPEN state after failure threshold", async () => {
      const failureThreshold = TEST_CIRCUIT_BREAKER_CONFIG.failureThreshold
      
      // Execute operations that will fail
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error(`Failure ${i}`)
          })
        } catch (error) {
          // Expected failures
        }
      }

      const metrics = circuitBreaker.getMetrics()
      console.log(`Circuit breaker after ${failureThreshold} failures:`)
      console.log(`  State: ${metrics.state}`)
      console.log(`  Failure count: ${metrics.failureCount}`)
      console.log(`  Failure rate: ${(metrics.failureRate * 100).toFixed(1)}%`)

      expect(metrics.state).toBe('OPEN')
      expect(metrics.failureCount).toBe(failureThreshold)
    })

    it("should reject requests immediately when OPEN", async () => {
      // Force circuit breaker to OPEN state
      circuitBreaker.forceState('OPEN')

      const startTime = Date.now()
      let rejectedCount = 0

      // Try to execute operations while OPEN
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(async () => {
            return 'should not execute'
          })
        } catch (error) {
          if (error.message.includes('Circuit breaker is OPEN')) {
            rejectedCount++
          }
        }
      }

      const duration = Date.now() - startTime

      console.log(`Circuit breaker OPEN state performance:`)
      console.log(`  Rejected requests: ${rejectedCount}/10`)
      console.log(`  Total time: ${duration}ms`)
      console.log(`  Average rejection time: ${(duration / 10).toFixed(1)}ms`)

      expect(rejectedCount).toBe(10)
      expect(duration).toBeLessThan(100) // Should reject very quickly
    })

    it("should transition from HALF_OPEN to CLOSED after successful recovery", async () => {
      // Force to HALF_OPEN state
      circuitBreaker.forceState('HALF_OPEN')
      
      const successThreshold = TEST_CIRCUIT_BREAKER_CONFIG.successThreshold

      // Execute successful operations
      for (let i = 0; i < successThreshold; i++) {
        await circuitBreaker.execute(async () => {
          return `recovery-${i}`
        })
      }

      const metrics = circuitBreaker.getMetrics()
      console.log(`Circuit breaker recovery:`)
      console.log(`  State: ${metrics.state}`)
      console.log(`  Success count: ${metrics.successCount}`)
      console.log(`  State changes: ${metrics.stateChanges}`)

      expect(metrics.state).toBe('CLOSED')
      expect(metrics.successCount).toBeGreaterThanOrEqual(successThreshold)
    })

    it("should handle timeout operations correctly", async () => {
      const timeoutConfig = {
        ...TEST_CIRCUIT_BREAKER_CONFIG,
        timeout: 100 // 100ms timeout
      }
      
      const timeoutCircuitBreaker = createCircuitBreaker('timeout-test', timeoutConfig)
      let timeoutCount = 0

      // Execute operations that will timeout
      for (let i = 0; i < 5; i++) {
        try {
          await timeoutCircuitBreaker.execute(async () => {
            await new Promise(resolve => setTimeout(resolve, 200)) // 200ms delay
            return 'should timeout'
          })
        } catch (error) {
          if (error.message.includes('timeout')) {
            timeoutCount++
          }
        }
      }

      const metrics = timeoutCircuitBreaker.getMetrics()
      console.log(`Circuit breaker timeout handling:`)
      console.log(`  Timeout count: ${timeoutCount}`)
      console.log(`  Failure count: ${metrics.failureCount}`)
      console.log(`  State: ${metrics.state}`)

      expect(timeoutCount).toBe(5)
      expect(metrics.failureCount).toBe(5)
    })
  })

  describe("Circuit Breaker Manager Performance", () => {
    it("should manage multiple circuit breakers efficiently", async () => {
      const circuitBreakerCount = 10
      const operationsPerCircuitBreaker = 20

      const startTime = Date.now()

      // Create and execute operations on multiple circuit breakers
      const promises: Promise<void>[] = []
      
      for (let i = 0; i < circuitBreakerCount; i++) {
        const cbName = `test-cb-${i}`
        
        for (let j = 0; j < operationsPerCircuitBreaker; j++) {
          promises.push(
            executeWithCircuitBreaker(
              cbName,
              async () => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
                return `result-${i}-${j}`
              },
              TEST_CIRCUIT_BREAKER_CONFIG
            )
          )
        }
      }

      await Promise.all(promises)
      const duration = Date.now() - startTime

      const globalMetrics = manager.getGlobalMetrics()
      const totalOperations = circuitBreakerCount * operationsPerCircuitBreaker
      const operationsPerSecond = Math.round(totalOperations / (duration / 1000))

      console.log(`Circuit breaker manager performance:`)
      console.log(`  Circuit breakers: ${globalMetrics.totalCircuitBreakers}`)
      console.log(`  Total operations: ${totalOperations}`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Rate: ${operationsPerSecond} ops/sec`)
      console.log(`  Global failure rate: ${(globalMetrics.globalFailureRate * 100).toFixed(1)}%`)

      expect(globalMetrics.totalCircuitBreakers).toBe(circuitBreakerCount)
      expect(globalMetrics.totalRequests).toBe(totalOperations)
      expect(operationsPerSecond).toBeGreaterThan(100) // Should handle at least 100 ops/sec
    })

    it("should handle mixed success and failure scenarios", async () => {
      const scenarios = [
        { name: 'reliable-service', failureRate: 0.1 }, // 10% failure
        { name: 'unreliable-service', failureRate: 0.6 }, // 60% failure
        { name: 'failing-service', failureRate: 0.9 } // 90% failure
      ]

      const operationsPerService = 50

      for (const scenario of scenarios) {
        for (let i = 0; i < operationsPerService; i++) {
          try {
            await executeWithCircuitBreaker(
              scenario.name,
              async () => {
                if (Math.random() < scenario.failureRate) {
                  throw new Error(`Simulated failure for ${scenario.name}`)
                }
                return `success-${i}`
              },
              TEST_CIRCUIT_BREAKER_CONFIG
            )
          } catch (error) {
            // Expected failures
          }
        }
      }

      const globalMetrics = manager.getGlobalMetrics()
      
      console.log(`Mixed scenario results:`)
      console.log(`  Total circuit breakers: ${globalMetrics.totalCircuitBreakers}`)
      console.log(`  Open circuit breakers: ${globalMetrics.openCircuitBreakers}`)
      console.log(`  Closed circuit breakers: ${globalMetrics.closedCircuitBreakers}`)
      console.log(`  Global failure rate: ${(globalMetrics.globalFailureRate * 100).toFixed(1)}%`)

      // Check individual circuit breaker states
      for (const scenario of scenarios) {
        const cb = manager.getCircuitBreakerByName(scenario.name)
        if (cb) {
          const metrics = cb.getMetrics()
          console.log(`  ${scenario.name}: ${metrics.state} (${(metrics.failureRate * 100).toFixed(1)}% failure rate)`)
        }
      }

      expect(globalMetrics.totalCircuitBreakers).toBe(scenarios.length)
      
      // Failing service should be OPEN
      const failingServiceCB = manager.getCircuitBreakerByName('failing-service')
      expect(failingServiceCB?.getState()).toBe('OPEN')
    })

    it("should generate health reports accurately", async () => {
      // Create some circuit breakers with different states
      await executeWithCircuitBreaker('healthy-service', async () => 'success')
      
      // Create a failing service
      for (let i = 0; i < 5; i++) {
        try {
          await executeWithCircuitBreaker('unhealthy-service', async () => {
            throw new Error('Service failure')
          })
        } catch (error) {
          // Expected
        }
      }

      const healthReport = manager.generateHealthReport()
      
      console.log(`Health report:`)
      console.log(`  Healthy: ${healthReport.healthy}`)
      console.log(`  Issues: ${healthReport.issues.length}`)
      console.log(`  Recommendations: ${healthReport.recommendations.length}`)
      console.log(`  Open circuit breakers: ${healthReport.summary.openCircuitBreakers}`)

      expect(healthReport.summary.totalCircuitBreakers).toBeGreaterThan(0)
      expect(typeof healthReport.healthy).toBe('boolean')
      expect(Array.isArray(healthReport.issues)).toBe(true)
      expect(Array.isArray(healthReport.recommendations)).toBe(true)
    })
  })

  describe("Circuit Breaker Resilience", () => {
    it("should handle high concurrency without issues", async () => {
      const concurrentOperations = 100
      const startTime = Date.now()

      // Execute many concurrent operations
      const promises = Array.from({ length: concurrentOperations }, async (_, i) => {
        return executeWithCircuitBreaker(
          'concurrent-test',
          async () => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50))
            return `concurrent-${i}`
          },
          TEST_CIRCUIT_BREAKER_CONFIG
        )
      })

      const results = await Promise.all(promises)
      const duration = Date.now() - startTime

      console.log(`High concurrency test:`)
      console.log(`  Concurrent operations: ${concurrentOperations}`)
      console.log(`  Successful results: ${results.length}`)
      console.log(`  Duration: ${duration}ms`)
      console.log(`  Average time per operation: ${(duration / concurrentOperations).toFixed(1)}ms`)

      const cb = manager.getCircuitBreakerByName('concurrent-test')
      const metrics = cb?.getMetrics()
      
      if (metrics) {
        console.log(`  Circuit breaker state: ${metrics.state}`)
        console.log(`  Total requests: ${metrics.totalRequests}`)
        console.log(`  Success rate: ${((1 - metrics.failureRate) * 100).toFixed(1)}%`)
      }

      expect(results.length).toBe(concurrentOperations)
      expect(metrics?.state).toBe('CLOSED')
    })

    it("should recover automatically after recovery timeout", async () => {
      const quickRecoveryConfig = {
        ...TEST_CIRCUIT_BREAKER_CONFIG,
        recoveryTimeout: 100 // 100ms recovery timeout
      }

      const quickRecoveryCB = createCircuitBreaker('quick-recovery', quickRecoveryConfig)

      // Force to OPEN state
      quickRecoveryCB.forceState('OPEN')
      expect(quickRecoveryCB.getState()).toBe('OPEN')

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 150))

      // Try to execute an operation (should transition to HALF_OPEN)
      try {
        await quickRecoveryCB.execute(async () => 'recovery test')
      } catch (error) {
        // May fail if still in transition
      }

      const finalState = quickRecoveryCB.getState()
      console.log(`Auto recovery test:`)
      console.log(`  Final state: ${finalState}`)
      console.log(`  Recovery timeout: ${quickRecoveryConfig.recoveryTimeout}ms`)

      // Should be either HALF_OPEN (attempting recovery) or CLOSED (recovered)
      expect(['HALF_OPEN', 'CLOSED']).toContain(finalState)
    })

    it("should maintain performance under sustained load", async () => {
      const duration = 2000 // 2 seconds
      const startTime = Date.now()
      let operationCount = 0
      let successCount = 0

      // Sustained load test
      while (Date.now() - startTime < duration) {
        try {
          await executeWithCircuitBreaker(
            'sustained-load',
            async () => {
              await new Promise(resolve => setTimeout(resolve, 5))
              return 'success'
            },
            TEST_CIRCUIT_BREAKER_CONFIG
          )
          successCount++
        } catch (error) {
          // Handle any failures
        }
        operationCount++
      }

      const actualDuration = Date.now() - startTime
      const operationsPerSecond = Math.round(operationCount / (actualDuration / 1000))
      const successRate = (successCount / operationCount) * 100

      console.log(`Sustained load test:`)
      console.log(`  Duration: ${actualDuration}ms`)
      console.log(`  Operations: ${operationCount}`)
      console.log(`  Success rate: ${successRate.toFixed(1)}%`)
      console.log(`  Rate: ${operationsPerSecond} ops/sec`)

      const cb = manager.getCircuitBreakerByName('sustained-load')
      const metrics = cb?.getMetrics()
      
      if (metrics) {
        console.log(`  Circuit breaker state: ${metrics.state}`)
        console.log(`  Average response time: ${metrics.averageResponseTime.toFixed(1)}ms`)
      }

      expect(operationCount).toBeGreaterThan(100) // Should handle reasonable load
      expect(successRate).toBeGreaterThan(95) // Should maintain high success rate
      expect(metrics?.state).toBe('CLOSED') // Should remain closed under normal load
    })
  })
})
