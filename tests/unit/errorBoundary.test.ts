/**
 * Unit Tests for Error Boundary System
 * Tests error handling, retry logic, timeouts, and fallback mechanisms
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  ErrorBoundary,
  StreamingErrorBoundary,
  NetworkErrorBoundary,
  AuthErrorBoundary,
  type ErrorBoundaryConfig,
  type ErrorBoundaryResult
} from "../../src/utils/errorBoundary"
import { ErrorFactory } from "../../src/types/errors"

// Mock logger to avoid console output during tests
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setCorrelationId: () => {},
  getCorrelationId: () => null
}

describe("Error Boundary System", () => {
  beforeEach(() => {
    // Reset any state if needed
  })

  describe("ErrorBoundary.handleAsync", () => {
    it("should handle successful async operations", async () => {
      const operation = async () => "success"
      const result = await ErrorBoundary.handleAsync(operation, "test-operation")
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("success")
      expect(result.attempts).toBe(1)
      expect(result.error).toBeUndefined()
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it("should handle failed operations without retry", async () => {
      const operation = async () => {
        throw new Error("Test error")
      }
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { retryAttempts: 0, logErrors: false }
      )
      
      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(result.attempts).toBe(1)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe("Test error")
    })

    it("should retry failed operations", async () => {
      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error(`Attempt ${attemptCount} failed`)
        }
        return "success on attempt 3"
      }
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { retryAttempts: 2, retryDelay: 10, logErrors: false }
      )
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("success on attempt 3")
      expect(result.attempts).toBe(3)
      expect(attemptCount).toBe(3)
    })

    it("should fail after exhausting retry attempts", async () => {
      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        throw new Error(`Attempt ${attemptCount} failed`)
      }
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { retryAttempts: 2, retryDelay: 10, logErrors: false }
      )
      
      expect(result.success).toBe(false)
      expect(result.attempts).toBe(3) // 1 initial + 2 retries
      expect(attemptCount).toBe(3)
      expect(result.error?.message).toBe("Attempt 3 failed")
    })

    it("should handle timeout operations", async () => {
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return "should not reach here"
      }
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { timeoutMs: 50, logErrors: false }
      )
      
      expect(result.success).toBe(false)
      expect(result.error?.message).toBe("Operation timeout")
    })

    it("should use fallback when operation fails", async () => {
      const operation = async () => {
        throw new Error("Primary operation failed")
      }
      
      const fallback = async () => "fallback result"
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { enableFallback: true, logErrors: false },
        fallback
      )
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("fallback result")
      expect(result.error?.message).toBe("Primary operation failed")
    })

    it("should handle fallback failure", async () => {
      const operation = async () => {
        throw new Error("Primary operation failed")
      }
      
      const fallback = async () => {
        throw new Error("Fallback also failed")
      }
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { enableFallback: true, logErrors: false },
        fallback
      )
      
      expect(result.success).toBe(false)
      expect(result.error?.message).toBe("Primary operation failed")
    })

    it("should convert different error types to typed errors", async () => {
      const testCases = [
        { error: new Error("timeout occurred"), expectedCode: "TIMEOUT" },
        { error: new Error("connection refused"), expectedCode: "CONNECTION_FAILED" },
        { error: new Error("validation failed"), expectedCode: "SCHEMA_VALIDATION_FAILED" },
        { error: "string error", expectedCode: "INTERNAL_ERROR" },
        { error: { custom: "object" }, expectedCode: "INTERNAL_ERROR" }
      ]

      for (const testCase of testCases) {
        const operation = async () => {
          throw testCase.error
        }
        
        const result = await ErrorBoundary.handleAsync(
          operation, 
          "test-operation",
          { logErrors: false }
        )
        
        expect(result.success).toBe(false)
        expect(result.error?.code).toBe(testCase.expectedCode)
      }
    })
  })

  describe("ErrorBoundary.handleSync", () => {
    it("should handle successful sync operations", () => {
      const operation = () => "sync success"
      const result = ErrorBoundary.handleSync(operation, "test-sync")
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("sync success")
      expect(result.attempts).toBe(1)
    })

    it("should handle failed sync operations", () => {
      const operation = () => {
        throw new Error("Sync error")
      }
      
      const result = ErrorBoundary.handleSync(
        operation, 
        "test-sync",
        { logErrors: false }
      )
      
      expect(result.success).toBe(false)
      expect(result.error?.message).toBe("Sync error")
    })

    it("should use sync fallback", () => {
      const operation = () => {
        throw new Error("Primary sync failed")
      }
      
      const fallback = () => "sync fallback"
      
      const result = ErrorBoundary.handleSync(
        operation, 
        "test-sync",
        { enableFallback: true, logErrors: false },
        fallback
      )
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("sync fallback")
    })
  })

  describe("StreamingErrorBoundary", () => {
    it("should handle streaming operations with default config", async () => {
      const operation = async () => "streaming success"
      const result = await StreamingErrorBoundary.handleStreamingOperation(
        operation,
        "test-stream-123"
      )
      
      expect(result.success).toBe(true)
      expect(result.data).toBe("streaming success")
    })

    it("should handle chunk processing", () => {
      const operation = () => ({ chunk: "processed" })
      const result = StreamingErrorBoundary.handleChunkProcessing(
        operation,
        "test-stream-123",
        5
      )
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ chunk: "processed" })
    })

    it("should create streaming errors with context", () => {
      const error = StreamingErrorBoundary.createStreamingError(
        "STREAM_FAILED",
        "Test streaming error",
        "stream-123",
        10
      )
      
      expect(error.code).toBe("STREAM_FAILED")
      expect(error.message).toBe("Test streaming error")
      expect(error.streamId).toBe("stream-123")
      expect(error.details?.chunkCount).toBe(10)
    })
  })

  describe("NetworkErrorBoundary", () => {
    it("should handle network requests with default config", async () => {
      const operation = async () => ({ status: 200, data: "success" })
      const result = await NetworkErrorBoundary.handleRequest(
        operation,
        "https://api.example.com/test"
      )
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ status: 200, data: "success" })
    })

    it("should retry network requests on failure", async () => {
      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        if (attemptCount < 2) {
          throw new Error("Network error")
        }
        return { status: 200, data: "success" }
      }
      
      const result = await NetworkErrorBoundary.handleRequest(
        operation,
        "https://api.example.com/test",
        { logErrors: false }
      )
      
      expect(result.success).toBe(true)
      expect(attemptCount).toBe(2)
    })
  })

  describe("AuthErrorBoundary", () => {
    it("should handle auth operations with default config", async () => {
      const operation = async () => ({ token: "auth-token-123" })
      const result = await AuthErrorBoundary.handleAuthOperation(
        operation,
        "get-token"
      )
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ token: "auth-token-123" })
    })

    it("should retry auth operations with appropriate delay", async () => {
      let attemptCount = 0
      const operation = async () => {
        attemptCount++
        if (attemptCount < 2) {
          throw new Error("Auth failed")
        }
        return { token: "auth-token-123" }
      }
      
      const startTime = Date.now()
      const result = await AuthErrorBoundary.handleAuthOperation(
        operation,
        "get-token",
        { logErrors: false }
      )
      const duration = Date.now() - startTime
      
      expect(result.success).toBe(true)
      expect(attemptCount).toBe(2)
      // Should have some delay due to retry
      expect(duration).toBeGreaterThan(100)
    })
  })

  describe("Error Type Conversion", () => {
    it("should preserve API errors", async () => {
      const apiError = ErrorFactory.validation("INVALID_INPUT", "Test validation error")
      const operation = async () => {
        throw apiError
      }
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { logErrors: false }
      )
      
      expect(result.success).toBe(false)
      expect(result.error).toEqual(apiError)
    })

    it("should convert ZodError to validation error", async () => {
      const zodError = new Error("validation failed")
      zodError.name = "ZodError"
      
      const operation = async () => {
        throw zodError
      }
      
      const result = await ErrorBoundary.handleAsync(
        operation, 
        "test-operation",
        { logErrors: false }
      )
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe("SCHEMA_VALIDATION_FAILED")
    })
  })
})
