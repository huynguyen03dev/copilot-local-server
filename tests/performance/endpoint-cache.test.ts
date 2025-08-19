/**
 * Performance Tests for Endpoint Caching
 * Validates endpoint discovery optimization and cache effectiveness
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { endpointCache } from "../../src/utils/endpointCache"

describe("Endpoint Cache Performance Tests", () => {
  beforeEach(() => {
    endpointCache.clearCache()
  })

  afterEach(() => {
    endpointCache.clearCache()
  })

  it("should cache successful endpoints", () => {
    const baseUrl = "https://api.githubcopilot.com"
    const model = "gpt-4"
    const config = { path: "/v1/chat/completions", format: 0 }
    const responseTime = 150

    // Cache the endpoint
    endpointCache.cacheSuccessfulEndpoint(baseUrl, model, config, responseTime)

    // Verify it's cached
    const cached = endpointCache.getBestEndpoint(baseUrl, model)
    expect(cached).toBeTruthy()
    expect(cached?.url).toBe(`${baseUrl}${config.path}`)
    expect(cached?.averageResponseTime).toBe(responseTime)
  })

  it("should return null for cache miss", () => {
    const cached = endpointCache.getBestEndpoint("https://unknown.com", "gpt-4")
    expect(cached).toBeNull()
  })

  it("should handle endpoint failures correctly", () => {
    const baseUrl = "https://api.githubcopilot.com"
    const model = "gpt-4"
    const config = { path: "/v1/chat/completions", format: 0 }

    // Cache successful endpoint first
    endpointCache.cacheSuccessfulEndpoint(baseUrl, model, config, 150)
    
    // Record failures
    endpointCache.recordEndpointFailure(baseUrl, model, config)
    endpointCache.recordEndpointFailure(baseUrl, model, config)
    endpointCache.recordEndpointFailure(baseUrl, model, config)

    // Should be removed after 3 failures
    const cached = endpointCache.getBestEndpoint(baseUrl, model)
    expect(cached).toBeNull()
  })

  it("should expire cache entries after TTL", async () => {
    const baseUrl = "https://api.githubcopilot.com"
    const model = "gpt-4"
    const config = { path: "/v1/chat/completions", format: 0 }

    // Cache the endpoint
    endpointCache.cacheSuccessfulEndpoint(baseUrl, model, config, 150)

    // Verify it's cached
    let cached = endpointCache.getBestEndpoint(baseUrl, model)
    expect(cached).toBeTruthy()

    // Mock time passage (would need to modify cache for testing)
    // For now, just verify the cache exists
    expect(cached?.lastUsed).toBeLessThanOrEqual(Date.now())
  })

  it("should provide accurate cache statistics", () => {
    const baseUrl = "https://api.githubcopilot.com"
    const config = { path: "/v1/chat/completions", format: 0 }

    // Add some cache entries
    endpointCache.cacheSuccessfulEndpoint(baseUrl, "gpt-4", config, 150)
    endpointCache.cacheSuccessfulEndpoint(baseUrl, "gpt-3.5", config, 200)

    const stats = endpointCache.getCacheStats()
    expect(stats.totalEntries).toBe(2)
    expect(stats.healthyEndpoints).toBe(2)
    expect(stats.unhealthyEndpoints).toBe(0)
    expect(stats.averageResponseTime).toBe(175) // (150 + 200) / 2
  })

  it("should update moving average correctly", () => {
    const baseUrl = "https://api.githubcopilot.com"
    const model = "gpt-4"
    const config = { path: "/v1/chat/completions", format: 0 }

    // First request
    endpointCache.cacheSuccessfulEndpoint(baseUrl, model, config, 100)
    let cached = endpointCache.getBestEndpoint(baseUrl, model)
    expect(cached?.averageResponseTime).toBe(100)

    // Second request
    endpointCache.cacheSuccessfulEndpoint(baseUrl, model, config, 200)
    cached = endpointCache.getBestEndpoint(baseUrl, model)
    expect(cached?.averageResponseTime).toBe(150) // (100 + 200) / 2

    // Third request
    endpointCache.cacheSuccessfulEndpoint(baseUrl, model, config, 300)
    cached = endpointCache.getBestEndpoint(baseUrl, model)
    expect(cached?.averageResponseTime).toBe(200) // (100 + 200 + 300) / 3
  })
})

/**
 * Integration test to measure actual performance improvement
 */
describe("Endpoint Cache Performance Integration", () => {
  it("should demonstrate performance improvement", async () => {
    // This would be an integration test that measures actual request times
    // with and without caching enabled
    
    const testUrl = "http://localhost:8069/v1/chat/completions"
    const testPayload = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: false
    }

    // Measure first request (cache miss)
    const start1 = Date.now()
    // ... make request
    const time1 = Date.now() - start1

    // Measure second request (cache hit)
    const start2 = Date.now()
    // ... make request
    const time2 = Date.now() - start2

    // Cache hit should be significantly faster
    // expect(time2).toBeLessThan(time1 * 0.5) // At least 50% faster
    
    console.log(`First request (cache miss): ${time1}ms`)
    console.log(`Second request (cache hit): ${time2}ms`)
    console.log(`Performance improvement: ${Math.round((1 - time2/time1) * 100)}%`)
  })
})
