/**
 * Performance Tests for Token Caching
 * Validates authentication token caching and refresh logic
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { tokenCache } from "../../src/utils/tokenCache"

describe("Token Cache Performance Tests", () => {
  beforeEach(() => {
    tokenCache.clearCache()
  })

  afterEach(() => {
    tokenCache.clearCache()
  })

  it("should cache tokens correctly", () => {
    const token = "test-token-123"
    const expiresAt = Date.now() + 3600000 // 1 hour
    const refreshToken = "refresh-token-123"
    const endpoint = "https://api.githubcopilot.com"

    tokenCache.cacheToken(token, expiresAt, refreshToken, endpoint)

    const cached = tokenCache.getCachedToken()
    expect(cached).toBeTruthy()
    expect(cached?.token).toBe(token)
    expect(cached?.expiresAt).toBe(expiresAt)
    expect(cached?.refreshToken).toBe(refreshToken)
    expect(cached?.endpoint).toBe(endpoint)
  })

  it("should return null for expired tokens", () => {
    const token = "test-token-123"
    const expiresAt = Date.now() - 1000 // Expired 1 second ago
    const refreshToken = "refresh-token-123"

    tokenCache.cacheToken(token, expiresAt, refreshToken)

    const cached = tokenCache.getCachedToken()
    expect(cached).toBeNull()
  })

  it("should detect when refresh is needed", () => {
    const token = "test-token-123"
    const expiresAt = Date.now() + 60000 // Expires in 1 minute (within refresh buffer)
    const refreshToken = "refresh-token-123"

    tokenCache.cacheToken(token, expiresAt, refreshToken)

    expect(tokenCache.needsRefresh()).toBe(true)
  })

  it("should not need refresh for fresh tokens", () => {
    const token = "test-token-123"
    const expiresAt = Date.now() + 3600000 // Expires in 1 hour
    const refreshToken = "refresh-token-123"

    tokenCache.cacheToken(token, expiresAt, refreshToken)

    expect(tokenCache.needsRefresh()).toBe(false)
  })

  it("should handle concurrent refresh requests", async () => {
    let refreshCallCount = 0
    const mockRefreshCallback = async () => {
      refreshCallCount++
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 100))
      return {
        token: `new-token-${refreshCallCount}`,
        expiresAt: Date.now() + 3600000,
        refreshToken: "refresh-token-123",
        endpoint: "https://api.githubcopilot.com",
        lastRefresh: Date.now()
      }
    }

    // Start multiple concurrent refresh requests
    const promises = [
      tokenCache.getTokenWithRefresh(mockRefreshCallback),
      tokenCache.getTokenWithRefresh(mockRefreshCallback),
      tokenCache.getTokenWithRefresh(mockRefreshCallback)
    ]

    const results = await Promise.all(promises)

    // All should return the same token
    expect(results[0]).toBe(results[1])
    expect(results[1]).toBe(results[2])
    
    // Refresh should only be called once
    expect(refreshCallCount).toBe(1)
  })

  it("should provide accurate cache statistics", () => {
    // No cache initially
    let stats = tokenCache.getCacheStats()
    expect(stats.hasCachedToken).toBe(false)
    expect(stats.needsRefresh).toBe(true)

    // Cache a token
    const token = "test-token-123"
    const expiresAt = Date.now() + 3600000
    const refreshToken = "refresh-token-123"

    tokenCache.cacheToken(token, expiresAt, refreshToken)

    stats = tokenCache.getCacheStats()
    expect(stats.hasCachedToken).toBe(true)
    expect(stats.needsRefresh).toBe(false)
    expect(stats.expiresIn).toBeGreaterThan(3500000) // Should be close to 1 hour
    expect(stats.cacheAge).toBeLessThan(1000) // Should be very recent
  })

  it("should clear cache properly", () => {
    const token = "test-token-123"
    const expiresAt = Date.now() + 3600000
    const refreshToken = "refresh-token-123"

    tokenCache.cacheToken(token, expiresAt, refreshToken)
    expect(tokenCache.getCachedToken()).toBeTruthy()

    tokenCache.clearCache()
    expect(tokenCache.getCachedToken()).toBeNull()
  })

  it("should handle refresh failures gracefully", async () => {
    const mockRefreshCallback = async () => {
      throw new Error("Refresh failed")
    }

    const result = await tokenCache.getTokenWithRefresh(mockRefreshCallback)
    expect(result).toBeNull()

    // Cache should be cleared after failure
    expect(tokenCache.getCachedToken()).toBeNull()
  })

  it("should force refresh when requested", async () => {
    // Cache a valid token
    const token = "test-token-123"
    const expiresAt = Date.now() + 3600000
    const refreshToken = "refresh-token-123"

    tokenCache.cacheToken(token, expiresAt, refreshToken)
    expect(tokenCache.getCachedToken()?.token).toBe(token)

    // Force refresh
    let refreshCalled = false
    const mockRefreshCallback = async () => {
      refreshCalled = true
      return {
        token: "new-token-456",
        expiresAt: Date.now() + 3600000,
        refreshToken: "refresh-token-123",
        endpoint: "https://api.githubcopilot.com",
        lastRefresh: Date.now()
      }
    }

    const newToken = await tokenCache.forceRefresh(mockRefreshCallback)
    expect(refreshCalled).toBe(true)
    expect(newToken).toBe("new-token-456")
    expect(tokenCache.getCachedToken()?.token).toBe("new-token-456")
  })
})

/**
 * Performance benchmark test
 */
describe("Token Cache Performance Benchmark", () => {
  it("should demonstrate performance improvement over file I/O", async () => {
    // This would be a benchmark test comparing cached vs non-cached token access
    const iterations = 100
    
    // Simulate file I/O time (would be actual file operations in real test)
    const simulateFileIO = async () => {
      await new Promise(resolve => setTimeout(resolve, 5)) // 5ms simulated I/O
      return "file-token"
    }

    // Benchmark cached access
    tokenCache.cacheToken("cached-token", Date.now() + 3600000, "refresh-token")
    
    const cacheStart = Date.now()
    for (let i = 0; i < iterations; i++) {
      tokenCache.getCachedToken()
    }
    const cacheTime = Date.now() - cacheStart

    // Benchmark file I/O access
    const fileStart = Date.now()
    for (let i = 0; i < iterations; i++) {
      await simulateFileIO()
    }
    const fileTime = Date.now() - fileStart

    console.log(`Cache access time: ${cacheTime}ms`)
    console.log(`File I/O time: ${fileTime}ms`)
    console.log(`Performance improvement: ${Math.round((1 - cacheTime/fileTime) * 100)}%`)

    // Cache should be significantly faster
    expect(cacheTime).toBeLessThan(fileTime * 0.1) // At least 90% faster
  })
})
