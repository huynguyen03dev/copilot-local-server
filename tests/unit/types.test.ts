/**
 * Unit Tests for Type Utilities
 * Tests error types, HTTP types, and utility functions
 */

import { describe, it, expect } from "bun:test"
import {
  ErrorFactory,
  isAPIError,
  toAPIErrorResponse,
  formatErrorForLogging,
  isAuthenticationError,
  isStreamingError,
  isValidationError,
  isNetworkError,
  isConfigurationError,
  isServerError,
  isHTTPMethod,
  isSuccessStatus,
  isClientError,
  isHTTPServerError,
  isRedirect,
  parseContentType,
  buildQueryString,
  parseUserAgent,
  type AuthenticationError,
  type StreamingError,
  type ValidationError,
  type NetworkError,
  type ConfigurationError,
  type ServerError
} from "../../src/types"

describe("Type Utilities", () => {
  describe("ErrorFactory", () => {
    it("should create authentication errors", () => {
      const error = ErrorFactory.authentication(
        "AUTH_FAILED",
        "Authentication failed",
        { reason: "invalid_token" }
      )
      
      expect(error.code).toBe("AUTH_FAILED")
      expect(error.message).toBe("Authentication failed")
      expect(error.details).toEqual({ reason: "invalid_token" })
      expect(error.timestamp).toBeTypeOf("number")
    })

    it("should create streaming errors", () => {
      const error = ErrorFactory.streaming(
        "STREAM_FAILED",
        "Stream processing failed",
        "stream-123",
        { chunkCount: 5 }
      )
      
      expect(error.code).toBe("STREAM_FAILED")
      expect(error.message).toBe("Stream processing failed")
      expect(error.streamId).toBe("stream-123")
      expect(error.details).toEqual({ chunkCount: 5 })
    })

    it("should create validation errors", () => {
      const error = ErrorFactory.validation(
        "INVALID_INPUT",
        "Invalid field value",
        "email",
        "string",
        "number"
      )
      
      expect(error.code).toBe("INVALID_INPUT")
      expect(error.message).toBe("Invalid field value")
      expect(error.field).toBe("email")
      expect(error.expectedType).toBe("string")
      expect(error.actualType).toBe("number")
    })

    it("should create network errors", () => {
      const error = ErrorFactory.network(
        "CONNECTION_FAILED",
        "Failed to connect to server",
        "https://api.example.com",
        500
      )
      
      expect(error.code).toBe("CONNECTION_FAILED")
      expect(error.message).toBe("Failed to connect to server")
      expect(error.url).toBe("https://api.example.com")
      expect(error.statusCode).toBe(500)
    })

    it("should create configuration errors", () => {
      const error = ErrorFactory.configuration(
        "INVALID_CONFIG",
        "Invalid configuration value",
        "PORT",
        "number between 1-65535"
      )
      
      expect(error.code).toBe("INVALID_CONFIG")
      expect(error.message).toBe("Invalid configuration value")
      expect(error.configKey).toBe("PORT")
      expect(error.expectedValue).toBe("number between 1-65535")
    })

    it("should create server errors", () => {
      const error = ErrorFactory.server(
        "INTERNAL_ERROR",
        "Internal server error",
        "/api/chat",
        "POST"
      )
      
      expect(error.code).toBe("INTERNAL_ERROR")
      expect(error.message).toBe("Internal server error")
      expect(error.endpoint).toBe("/api/chat")
      expect(error.method).toBe("POST")
    })
  })

  describe("Error Type Guards", () => {
    it("should identify API errors", () => {
      const apiError = ErrorFactory.authentication("AUTH_FAILED", "Auth failed")
      const regularError = new Error("Regular error")
      const invalidObject = { message: "Not an API error" }
      
      expect(isAPIError(apiError)).toBe(true)
      expect(isAPIError(regularError)).toBe(false)
      expect(isAPIError(invalidObject)).toBe(false)
      expect(isAPIError(null)).toBe(false)
      expect(isAPIError(undefined)).toBe(false)
    })

    it("should identify authentication errors", () => {
      const authError = ErrorFactory.authentication("AUTH_FAILED", "Auth failed")
      const streamError = ErrorFactory.streaming("STREAM_FAILED", "Stream failed")
      
      expect(isAuthenticationError(authError)).toBe(true)
      expect(isAuthenticationError(streamError)).toBe(false)
    })

    it("should identify streaming errors", () => {
      const streamError = ErrorFactory.streaming("STREAM_FAILED", "Stream failed")
      const authError = ErrorFactory.authentication("AUTH_FAILED", "Auth failed")
      
      expect(isStreamingError(streamError)).toBe(true)
      expect(isStreamingError(authError)).toBe(false)
    })

    it("should identify validation errors", () => {
      const validationError = ErrorFactory.validation("INVALID_INPUT", "Invalid input")
      const networkError = ErrorFactory.network("CONNECTION_FAILED", "Connection failed")
      
      expect(isValidationError(validationError)).toBe(true)
      expect(isValidationError(networkError)).toBe(false)
    })

    it("should identify network errors", () => {
      const networkError = ErrorFactory.network("CONNECTION_FAILED", "Connection failed")
      const configError = ErrorFactory.configuration("INVALID_CONFIG", "Invalid config")
      
      expect(isNetworkError(networkError)).toBe(true)
      expect(isNetworkError(configError)).toBe(false)
    })

    it("should identify configuration errors", () => {
      const configError = ErrorFactory.configuration("INVALID_CONFIG", "Invalid config")
      const serverError = ErrorFactory.server("INTERNAL_ERROR", "Server error")
      
      expect(isConfigurationError(configError)).toBe(true)
      expect(isConfigurationError(serverError)).toBe(false)
    })

    it("should identify server errors", () => {
      const serverError = ErrorFactory.server("INTERNAL_ERROR", "Server error")
      const authError = ErrorFactory.authentication("AUTH_FAILED", "Auth failed")
      
      expect(isServerError(serverError)).toBe(true)
      expect(isServerError(authError)).toBe(false)
    })
  })

  describe("Error Formatting", () => {
    it("should convert API error to response format", () => {
      const error = ErrorFactory.validation("INVALID_INPUT", "Invalid field value")
      const response = toAPIErrorResponse(error)
      
      expect(response).toEqual({
        error: {
          message: "Invalid field value",
          type: "invalid_input",
          code: "INVALID_INPUT"
        }
      })
    })

    it("should format error for logging", () => {
      const error = ErrorFactory.streaming(
        "STREAM_FAILED",
        "Stream processing failed",
        "stream-123",
        { chunkCount: 5 }
      )
      
      const formatted = formatErrorForLogging(error)
      
      expect(formatted).toContain("[STREAM_FAILED]")
      expect(formatted).toContain("Stream processing failed")
      expect(formatted).toContain("Details:")
      expect(formatted).toContain("chunkCount")
    })

    it("should format error without details", () => {
      const error = ErrorFactory.authentication("AUTH_FAILED", "Authentication failed")
      const formatted = formatErrorForLogging(error)
      
      expect(formatted).toBe("[AUTH_FAILED] Authentication failed")
    })
  })

  describe("HTTP Type Guards", () => {
    it("should identify valid HTTP methods", () => {
      expect(isHTTPMethod("GET")).toBe(true)
      expect(isHTTPMethod("POST")).toBe(true)
      expect(isHTTPMethod("PUT")).toBe(true)
      expect(isHTTPMethod("DELETE")).toBe(true)
      expect(isHTTPMethod("PATCH")).toBe(true)
      expect(isHTTPMethod("OPTIONS")).toBe(true)
      expect(isHTTPMethod("HEAD")).toBe(true)
      
      expect(isHTTPMethod("INVALID")).toBe(false)
      expect(isHTTPMethod("get")).toBe(false) // Case sensitive
      expect(isHTTPMethod("")).toBe(false)
    })

    it("should identify HTTP status code ranges", () => {
      // Success status codes
      expect(isSuccessStatus(200)).toBe(true)
      expect(isSuccessStatus(201)).toBe(true)
      expect(isSuccessStatus(299)).toBe(true)
      expect(isSuccessStatus(300)).toBe(false)
      expect(isSuccessStatus(199)).toBe(false)
      
      // Client error status codes
      expect(isClientError(400)).toBe(true)
      expect(isClientError(404)).toBe(true)
      expect(isClientError(499)).toBe(true)
      expect(isClientError(399)).toBe(false)
      expect(isClientError(500)).toBe(false)
      
      // Server error status codes
      expect(isHTTPServerError(500)).toBe(true)
      expect(isHTTPServerError(502)).toBe(true)
      expect(isHTTPServerError(599)).toBe(true)
      expect(isHTTPServerError(499)).toBe(false)
      expect(isHTTPServerError(600)).toBe(false)
      
      // Redirect status codes
      expect(isRedirect(300)).toBe(true)
      expect(isRedirect(301)).toBe(true)
      expect(isRedirect(399)).toBe(true)
      expect(isRedirect(299)).toBe(false)
      expect(isRedirect(400)).toBe(false)
    })
  })

  describe("HTTP Utility Functions", () => {
    it("should parse content type", () => {
      expect(parseContentType("application/json")).toEqual({
        type: "application/json"
      })
      
      expect(parseContentType("text/html; charset=utf-8")).toEqual({
        type: "text/html",
        charset: "utf-8"
      })
      
      expect(parseContentType("application/json; charset=utf-8; boundary=something")).toEqual({
        type: "application/json",
        charset: "utf-8"
      })
      
      expect(parseContentType(undefined)).toEqual({
        type: "application/octet-stream"
      })
      
      expect(parseContentType("")).toEqual({
        type: "application/octet-stream"
      })
    })

    it("should build query strings", () => {
      expect(buildQueryString({})).toBe("")
      
      expect(buildQueryString({ key: "value" })).toBe("key=value")
      
      expect(buildQueryString({ 
        name: "John Doe", 
        age: 30, 
        active: true 
      })).toBe("name=John+Doe&age=30&active=true")
      
      expect(buildQueryString({ 
        key1: "value1", 
        key2: undefined, 
        key3: null,
        key4: "value4"
      })).toBe("key1=value1&key4=value4")
    })

    it("should parse user agent", () => {
      expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")).toEqual({
        browser: "Chrome",
        os: "Windows"
      })
      
      expect(parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")).toEqual({
        browser: "Chrome",
        os: "macOS"
      })
      
      expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/89.0")).toEqual({
        browser: "Firefox",
        os: "Linux"
      })
      
      expect(parseUserAgent("Bun/1.0.0")).toEqual({
        browser: "Bun"
      })
      
      expect(parseUserAgent(undefined)).toEqual({})
      
      expect(parseUserAgent("")).toEqual({})
    })
  })
})
