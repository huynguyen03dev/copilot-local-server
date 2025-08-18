/**
 * Unit Tests for Logger System
 * Tests logging functionality, correlation IDs, and structured logging
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Logger, LogLevel, type LoggerConfig } from "../../src/utils/logger"

// Mock console methods to capture output
let consoleLogs: string[] = []
let consoleWarns: string[] = []
let consoleErrors: string[] = []

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
}

describe("Logger System", () => {
  beforeEach(() => {
    // Reset captured logs
    consoleLogs = []
    consoleWarns = []
    consoleErrors = []
    
    // Mock console methods
    console.log = (...args) => consoleLogs.push(args.join(' '))
    console.warn = (...args) => consoleWarns.push(args.join(' '))
    console.error = (...args) => consoleErrors.push(args.join(' '))
  })

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.error = originalConsole.error
  })

  describe("Logger Construction", () => {
    it("should create logger with default config", () => {
      const logger = new Logger()
      expect(logger).toBeDefined()
    })

    it("should create logger with custom config", () => {
      const customConfig: Partial<LoggerConfig> = {
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: true
      }
      const logger = new Logger(customConfig)
      expect(logger).toBeDefined()
    })
  })

  describe("Log Level Filtering", () => {
    it("should respect log level filtering", () => {
      const logger = new Logger({ level: LogLevel.WARN })
      
      logger.debug("TEST", "Debug message")
      logger.info("TEST", "Info message")
      logger.warn("TEST", "Warning message")
      logger.error("TEST", "Error message")
      
      expect(consoleLogs).toHaveLength(0) // Debug and info should be filtered
      expect(consoleWarns).toHaveLength(1)
      expect(consoleErrors).toHaveLength(1)
    })

    it("should log all levels when set to DEBUG", () => {
      const logger = new Logger({ level: LogLevel.DEBUG })
      
      logger.debug("TEST", "Debug message")
      logger.info("TEST", "Info message")
      logger.warn("TEST", "Warning message")
      logger.error("TEST", "Error message")
      
      expect(consoleLogs).toHaveLength(2) // Debug and info go to console.log
      expect(consoleWarns).toHaveLength(1)
      expect(consoleErrors).toHaveLength(1)
    })

    it("should log nothing when set to SILENT", () => {
      const logger = new Logger({ level: LogLevel.SILENT })
      
      logger.debug("TEST", "Debug message")
      logger.info("TEST", "Info message")
      logger.warn("TEST", "Warning message")
      logger.error("TEST", "Error message")
      
      expect(consoleLogs).toHaveLength(0)
      expect(consoleWarns).toHaveLength(0)
      expect(consoleErrors).toHaveLength(0)
    })
  })

  describe("Message Formatting", () => {
    it("should format messages with category", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: true
      })
      
      logger.info("TEST", "Test message")
      
      expect(consoleLogs[0]).toContain("[TEST]")
      expect(consoleLogs[0]).toContain("Test message")
    })

    it("should format messages without category when disabled", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: false
      })
      
      logger.info("TEST", "Test message")
      
      expect(consoleLogs[0]).not.toContain("[TEST]")
      expect(consoleLogs[0]).toContain("Test message")
    })

    it("should include timestamps when enabled", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: true,
        enableCategories: false
      })
      
      logger.info("TEST", "Test message")
      
      // Should contain timestamp pattern (HH:MM:SS)
      expect(consoleLogs[0]).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it("should handle additional arguments", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: false
      })
      
      const testObject = { key: "value", number: 42 }
      logger.info("TEST", "Test message", testObject, "extra string")
      
      expect(consoleLogs[0]).toContain("Test message")
      expect(consoleLogs[0]).toContain(JSON.stringify(testObject))
      expect(consoleLogs[0]).toContain("extra string")
    })

    it("should handle circular objects gracefully", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: false
      })
      
      const circularObj: any = { name: "test" }
      circularObj.self = circularObj
      
      logger.info("TEST", "Circular object test", circularObj)
      
      expect(consoleLogs[0]).toContain("Circular object test")
      expect(consoleLogs[0]).toContain("[Circular Object]")
    })

    it("should handle null and undefined arguments", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: false
      })
      
      logger.info("TEST", "Null test", null, undefined)
      
      expect(consoleLogs[0]).toContain("null")
      expect(consoleLogs[0]).toContain("undefined")
    })
  })

  describe("Correlation ID Support", () => {
    it("should set and get correlation ID", () => {
      const logger = new Logger()
      const correlationId = "test-correlation-123"
      
      logger.setCorrelationId(correlationId)
      expect(logger.getCorrelationId()).toBe(correlationId)
    })

    it("should include correlation ID in log messages", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: true
      })
      
      const correlationId = "test-correlation-123"
      logger.setCorrelationId(correlationId)
      logger.info("TEST", "Test message with correlation")
      
      expect(consoleLogs[0]).toContain(`[${correlationId}]`)
    })

    it("should clear correlation ID", () => {
      const logger = new Logger()
      const correlationId = "test-correlation-123"
      
      logger.setCorrelationId(correlationId)
      expect(logger.getCorrelationId()).toBe(correlationId)
      
      logger.setCorrelationId(null)
      expect(logger.getCorrelationId()).toBeNull()
    })

    it("should not include correlation ID when not set", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: true
      })
      
      logger.info("TEST", "Test message without correlation")
      
      expect(consoleLogs[0]).not.toContain("[test-correlation")
      expect(consoleLogs[0]).toContain("[TEST]")
    })
  })

  describe("Specialized Logging Methods", () => {
    it("should handle stream start logging", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: true,
        enableProgressLogs: true
      })
      
      logger.streamStart("stream-123", 1, 10)
      
      expect(consoleLogs[0]).toContain("STREAM")
      expect(consoleLogs[0]).toContain("stream-123")
      expect(consoleLogs[0]).toContain("1/10")
    })

    it("should handle stream end logging", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: true,
        enableProgressLogs: true
      })
      
      logger.streamEnd("stream-123", 0, 10)
      
      expect(consoleLogs[0]).toContain("STREAM")
      expect(consoleLogs[0]).toContain("stream-123")
      expect(consoleLogs[0]).toContain("0/10")
    })

    it("should handle memory logging", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: true,
        enableMemoryLogs: true
      })
      
      logger.memoryUsage(256, 512)
      
      expect(consoleLogs[0]).toContain("MEMORY")
      expect(consoleLogs[0]).toContain("256MB")
      expect(consoleLogs[0]).toContain("512MB")
    })

    it("should skip disabled logging types", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: true,
        enableProgressLogs: false,
        enableMemoryLogs: false
      })
      
      logger.streamStart("stream-123", 1, 10)
      logger.memoryUsage(256, 512)
      
      expect(consoleLogs).toHaveLength(0)
    })
  })

  describe("Log Level Parsing", () => {
    it("should parse string log levels correctly", () => {
      const testCases = [
        { input: "debug", expected: LogLevel.DEBUG },
        { input: "info", expected: LogLevel.INFO },
        { input: "warn", expected: LogLevel.WARN },
        { input: "error", expected: LogLevel.ERROR },
        { input: "silent", expected: LogLevel.SILENT },
        { input: "invalid", expected: LogLevel.INFO }, // Default fallback
      ]

      testCases.forEach(({ input, expected }) => {
        const logger = new Logger()
        // Access private method through any cast for testing
        const result = (logger as any).parseLogLevel(input)
        expect(result).toBe(expected)
      })
    })
  })

  describe("Cleanup", () => {
    it("should flush batch on destroy", () => {
      const logger = new Logger({ 
        level: LogLevel.DEBUG,
        enableColors: false,
        enableTimestamps: false,
        enableCategories: false
      })
      
      // Add some logs that might be batched
      logger.info("TEST", "Message 1")
      logger.info("TEST", "Message 2")
      
      logger.destroy()
      
      // Should have flushed any pending logs
      expect(consoleLogs.length).toBeGreaterThan(0)
    })
  })
})
