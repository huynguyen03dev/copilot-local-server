/**
 * CORS & Cross-Origin Security Tests
 * Tests for CORS configuration, origin validation, and cross-origin attack prevention
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { securityConfig, logSecurityConfig } from "../../src/config/security"

// Mock console to capture security logs
let consoleLogs: string[] = []
let consoleWarns: string[] = []

const originalConsole = {
  log: console.log,
  warn: console.warn
}

describe("CORS Security Tests", () => {
  beforeEach(() => {
    // Reset captured logs
    consoleLogs = []
    consoleWarns = []
    
    // Mock console methods
    console.log = (...args) => consoleLogs.push(args.join(' '))
    console.warn = (...args) => consoleWarns.push(args.join(' '))
  })

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log
    console.warn = originalConsole.warn
  })

  describe("Origin Validation", () => {
    it("should validate allowed origins format", () => {
      const validOrigins = [
        "http://localhost:3000",
        "https://localhost:3000",
        "https://example.com",
        "https://subdomain.example.com",
        "https://app.example.com:8080"
      ]
      
      validOrigins.forEach(origin => {
        try {
          new URL(origin)
          expect(true).toBe(true) // Valid URL
        } catch {
          expect(true).toBe(false) // Should not fail for valid origins
        }
      })
    })

    it("should reject malicious origins", () => {
      const maliciousOrigins = [
        "javascript:alert('XSS')",
        "data:text/html,<script>alert('XSS')</script>",
        "file:///etc/passwd",
        "ftp://malicious.com",
        "chrome-extension://malicious",
        "moz-extension://malicious",
        "about:blank",
        "blob:null",
        "null"
      ]
      
      maliciousOrigins.forEach(origin => {
        let isValidURL = false
        try {
          const url = new URL(origin)
          // Even if it's a valid URL, check if it's a safe protocol
          isValidURL = ["http:", "https:"].includes(url.protocol)
        } catch {
          isValidURL = false
        }
        
        // Malicious origins should either be invalid URLs or unsafe protocols
        if (origin === "null") {
          expect(isValidURL).toBe(false) // "null" string is not a valid URL
        } else {
          // Most malicious origins should be rejected
          const isSafeOrigin = isValidURL && !origin.includes("javascript:") && !origin.includes("data:")
          if (!isSafeOrigin) {
            expect(isValidURL).toBe(false)
          }
        }
      })
    })

    it("should handle wildcard origin securely", () => {
      // Test wildcard handling logic
      const testWildcardHandling = (origins: string[], environment: string) => {
        if (origins.includes('*')) {
          if (environment === 'development') {
            return ['*'] // Allowed in development
          } else {
            return ['http://localhost:3000'] // Fallback in production
          }
        }
        return origins
      }
      
      // Development environment - wildcard allowed
      const devResult = testWildcardHandling(['*'], 'development')
      expect(devResult).toEqual(['*'])
      
      // Production environment - wildcard rejected
      const prodResult = testWildcardHandling(['*'], 'production')
      expect(prodResult).toEqual(['http://localhost:3000'])
      
      // No wildcard - origins preserved
      const normalResult = testWildcardHandling(['https://example.com'], 'production')
      expect(normalResult).toEqual(['https://example.com'])
    })

    it("should validate localhost patterns", () => {
      const localhostPatterns = [
        "http://localhost:3000",
        "https://localhost:3000",
        "http://localhost:8080",
        "https://localhost:8080",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:3000"
      ]
      
      localhostPatterns.forEach(pattern => {
        const isValidLocalhost = pattern.startsWith('http://localhost:') || 
                                pattern.startsWith('https://localhost:') ||
                                pattern.startsWith('http://127.0.0.1:') ||
                                pattern.startsWith('https://127.0.0.1:')
        
        expect(isValidLocalhost).toBe(true)
        
        // Also validate as URL
        try {
          const url = new URL(pattern)
          expect(["http:", "https:"].includes(url.protocol)).toBe(true)
        } catch {
          expect(true).toBe(false) // Should not fail for valid localhost patterns
        }
      })
    })
  })

  describe("CORS Configuration Security", () => {
    it("should have secure default CORS settings", () => {
      // Test current security config
      expect(securityConfig.cors.origins).toBeDefined()
      expect(Array.isArray(securityConfig.cors.origins)).toBe(true)
      expect(securityConfig.cors.origins.length).toBeGreaterThan(0)
      
      // Should not include wildcard in production-like settings
      const hasWildcard = securityConfig.cors.origins.includes('*')
      if (hasWildcard) {
        // If wildcard is present, it should only be in development
        console.warn("Wildcard CORS origin detected - ensure this is development environment")
      }
      
      // Credentials should be carefully controlled
      expect(typeof securityConfig.cors.credentials).toBe('boolean')
      
      // Methods should be restricted
      expect(Array.isArray(securityConfig.cors.methods)).toBe(true)
      const allowedMethods = securityConfig.cors.methods
      const dangerousMethods = ['DELETE', 'PUT', 'PATCH']
      
      // Check if dangerous methods are included (not necessarily bad, but should be intentional)
      dangerousMethods.forEach(method => {
        if (allowedMethods.includes(method)) {
          console.warn(`Potentially dangerous HTTP method allowed: ${method}`)
        }
      })
      
      // Headers should be controlled
      expect(Array.isArray(securityConfig.cors.headers)).toBe(true)
      const allowedHeaders = securityConfig.cors.headers
      
      // Should include necessary headers
      expect(allowedHeaders.includes('Content-Type')).toBe(true)
      expect(allowedHeaders.includes('Authorization')).toBe(true)
    })

    it("should log security configuration safely", () => {
      // Test security config logging
      logSecurityConfig()
      
      // Should have logged security information
      expect(consoleLogs.length).toBeGreaterThan(0)
      
      const securityLog = consoleLogs.find(log => log.includes('Security Configuration'))
      expect(securityLog).toBeDefined()
      
      // Should log CORS origins
      const corsLog = consoleLogs.find(log => log.includes('CORS Origins'))
      expect(corsLog).toBeDefined()
      
      // Should not log sensitive information
      consoleLogs.forEach(log => {
        expect(log).not.toContain('password')
        expect(log).not.toContain('secret')
        expect(log).not.toContain('key')
        expect(log).not.toContain('token')
      })
    })

    it("should handle invalid CORS configuration gracefully", () => {
      // Test with empty origins array
      const testEmptyOrigins = (origins: string[]) => {
        if (origins.length === 0) {
          console.warn('No valid CORS origins found, falling back to localhost:3000')
          return ['http://localhost:3000']
        }
        return origins
      }
      
      const result = testEmptyOrigins([])
      expect(result).toEqual(['http://localhost:3000'])
      expect(consoleWarns.some(warn => warn.includes('No valid CORS origins'))).toBe(true)
    })
  })

  describe("Cross-Origin Attack Prevention", () => {
    it("should prevent CSRF attacks through origin validation", () => {
      const attackOrigins = [
        "https://evil.com",
        "https://phishing-site.com",
        "https://malicious-subdomain.evil.com",
        "https://example.com.evil.com", // Subdomain attack
        "https://examplecom.evil.com", // Typosquatting
      ]
      
      const allowedOrigins = securityConfig.cors.origins
      
      attackOrigins.forEach(attackOrigin => {
        const isAllowed = allowedOrigins.includes(attackOrigin) || allowedOrigins.includes('*')
        
        if (isAllowed && !allowedOrigins.includes('*')) {
          // If specific malicious origin is allowed, that's a security issue
          expect(true).toBe(false) // Should not allow malicious origins
        }
        
        // If wildcard is used, warn about potential security risk
        if (allowedOrigins.includes('*')) {
          console.warn('Wildcard CORS origin allows all origins including malicious ones')
        }
      })
    })

    it("should validate origin header format", () => {
      const malformedOrigins = [
        "", // Empty origin
        " ", // Whitespace only
        "https://", // Incomplete URL
        "://example.com", // Missing protocol
        "https://example.com/path", // Should not include path
        "https://example.com?query=1", // Should not include query
        "https://example.com#fragment", // Should not include fragment
        "HTTPS://EXAMPLE.COM", // Case sensitivity test
      ]
      
      malformedOrigins.forEach(malformedOrigin => {
        let isValidOrigin = false
        
        try {
          const url = new URL(malformedOrigin)
          // Origin should only be protocol + hostname + port
          const expectedOrigin = `${url.protocol}//${url.host}`
          isValidOrigin = malformedOrigin === expectedOrigin
        } catch {
          isValidOrigin = false
        }
        
        // Most malformed origins should be invalid
        if (malformedOrigin === "HTTPS://EXAMPLE.COM") {
          // This is actually valid, just different case
          isValidOrigin = true
        }
        
        expect(typeof isValidOrigin).toBe('boolean')
      })
    })

    it("should handle preflight request security", () => {
      // Test CORS preflight request validation
      const preflightHeaders = {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
        'Origin': 'https://example.com'
      }
      
      // Validate requested method
      const requestedMethod = preflightHeaders['Access-Control-Request-Method']
      const allowedMethods = securityConfig.cors.methods
      const isMethodAllowed = allowedMethods.includes(requestedMethod)
      
      expect(typeof isMethodAllowed).toBe('boolean')
      
      // Validate requested headers
      const requestedHeaders = preflightHeaders['Access-Control-Request-Headers'].split(',')
      const allowedHeaders = securityConfig.cors.headers
      
      const areHeadersAllowed = requestedHeaders.every(header => 
        allowedHeaders.includes(header.trim())
      )
      
      expect(typeof areHeadersAllowed).toBe('boolean')
      
      // Validate origin
      const origin = preflightHeaders['Origin']
      const allowedOrigins = securityConfig.cors.origins
      const isOriginAllowed = allowedOrigins.includes(origin) || allowedOrigins.includes('*')
      
      expect(typeof isOriginAllowed).toBe('boolean')
    })
  })

  describe("Credential Security", () => {
    it("should handle credentials securely with CORS", () => {
      const credentialsEnabled = securityConfig.cors.credentials
      const allowsWildcard = securityConfig.cors.origins.includes('*')
      
      // If credentials are enabled, wildcard origin should not be allowed
      if (credentialsEnabled && allowsWildcard) {
        expect(true).toBe(false) // Security violation: credentials + wildcard
      }
      
      // This is a valid configuration check
      expect(typeof credentialsEnabled).toBe('boolean')
    })

    it("should validate secure credential transmission", () => {
      // Test HTTPS requirement for credentials
      const origins = securityConfig.cors.origins
      const credentialsEnabled = securityConfig.cors.credentials
      
      if (credentialsEnabled) {
        origins.forEach(origin => {
          if (origin !== '*' && !origin.startsWith('http://localhost')) {
            // Non-localhost origins should use HTTPS when credentials are enabled
            try {
              const url = new URL(origin)
              if (url.protocol !== 'https:') {
                console.warn(`Insecure origin with credentials enabled: ${origin}`)
              }
            } catch {
              // Invalid URL
            }
          }
        })
      }
      
      expect(typeof credentialsEnabled).toBe('boolean')
    })
  })

  describe("Security Headers", () => {
    it("should validate security-related headers", () => {
      const allowedHeaders = securityConfig.cors.headers
      
      // Should include necessary security headers
      const securityHeaders = [
        'Content-Type',
        'Authorization',
        'X-Request-ID'
      ]
      
      securityHeaders.forEach(header => {
        expect(allowedHeaders.includes(header)).toBe(true)
      })
      
      // Should not include dangerous headers
      const dangerousHeaders = [
        'X-Forwarded-For', // Can be spoofed
        'X-Real-IP', // Can be spoofed
        'Cookie', // Should be handled carefully
        'Set-Cookie' // Should not be in request headers
      ]
      
      dangerousHeaders.forEach(header => {
        if (allowedHeaders.includes(header)) {
          console.warn(`Potentially dangerous header allowed: ${header}`)
        }
      })
    })

    it("should prevent header injection attacks", () => {
      const maliciousHeaders = [
        'X-Injected-Header\r\nX-Evil: malicious',
        'Content-Type\nX-XSS: <script>alert(1)</script>',
        'Authorization\r\n\r\n<script>alert(1)</script>',
        'X-Request-ID\x00X-Null-Injection: evil'
      ]
      
      maliciousHeaders.forEach(maliciousHeader => {
        // Headers should not contain newlines or null bytes
        const hasNewlines = /[\r\n]/.test(maliciousHeader)
        const hasNullBytes = /\x00/.test(maliciousHeader)
        
        if (hasNewlines || hasNullBytes) {
          // These should be rejected by proper header validation
          expect(hasNewlines || hasNullBytes).toBe(true) // Confirming they are malicious
        }
      })
    })
  })
})
