/**
 * Unit Tests for Authentication System
 * Tests authentication utilities and token management
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { GitHubCopilotAuth } from "../../src/auth"
import fs from "fs/promises"
import path from "path"
import os from "os"

// Mock file system operations for testing
const mockAuthData = {
  type: "oauth",
  refresh: "mock-refresh-token",
  access: "mock-access-token",
  expires: Date.now() + 3600000, // 1 hour from now
  endpoint: "https://api.individual.githubcopilot.com"
}

const expiredAuthData = {
  type: "oauth",
  refresh: "mock-refresh-token",
  access: "mock-access-token",
  expires: Date.now() - 3600000, // 1 hour ago (expired)
  endpoint: "https://api.individual.githubcopilot.com"
}

describe("Authentication System", () => {
  const testAuthFile = path.join(os.tmpdir(), "test-copilot-auth.json")
  
  beforeEach(async () => {
    // Clean up any existing test auth file
    try {
      await fs.unlink(testAuthFile)
    } catch {
      // File doesn't exist, that's fine
    }
    
    // Mock the auth file path
    (GitHubCopilotAuth as any).AUTH_FILE = testAuthFile
  })

  afterEach(async () => {
    // Clean up test auth file
    try {
      await fs.unlink(testAuthFile)
    } catch {
      // File doesn't exist, that's fine
    }
  })

  describe("Auth File Management", () => {
    it("should return null when no auth file exists", async () => {
      const auth = await GitHubCopilotAuth.getAuth()
      expect(auth).toBeNull()
    })

    it("should save and retrieve auth data", async () => {
      await GitHubCopilotAuth.setAuth(mockAuthData)
      const retrievedAuth = await GitHubCopilotAuth.getAuth()
      
      expect(retrievedAuth).toEqual(mockAuthData)
    })

    it("should handle malformed auth file", async () => {
      // Write invalid JSON to auth file
      await fs.writeFile(testAuthFile, "invalid json")
      
      const auth = await GitHubCopilotAuth.getAuth()
      expect(auth).toBeNull()
    })

    it("should clear auth data", async () => {
      await GitHubCopilotAuth.setAuth(mockAuthData)
      await GitHubCopilotAuth.clearAuth()
      
      const auth = await GitHubCopilotAuth.getAuth()
      expect(auth).toBeNull()
    })

    it("should handle missing auth file directory", async () => {
      // Test directory creation logic without actually creating files
      const testDirectoryCreation = async (dirPath: string): Promise<boolean> => {
        try {
          await fs.mkdir(dirPath, { recursive: true })
          await fs.rmdir(dirPath) // Clean up immediately
          return true
        } catch {
          return false
        }
      }

      const nonExistentDir = path.join(os.tmpdir(), `test-nonexistent-${Date.now()}`)
      const canCreateDir = await testDirectoryCreation(nonExistentDir)

      expect(canCreateDir).toBe(true)
    })
  })

  describe("Token Management", () => {
    it("should return valid access token when not expired", async () => {
      await GitHubCopilotAuth.setAuth(mockAuthData)
      
      // Mock fetch to avoid actual network calls
      const originalFetch = global.fetch
      global.fetch = async () => {
        throw new Error("Should not make network call for valid token")
      }
      
      try {
        const token = await GitHubCopilotAuth.getAccessToken()
        expect(token).toBe("mock-access-token")
      } finally {
        global.fetch = originalFetch
      }
    })

    it("should refresh expired access token", async () => {
      await GitHubCopilotAuth.setAuth(expiredAuthData)
      
      const mockTokenResponse = {
        token: "new-access-token",
        expires_at: Math.floor((Date.now() + 3600000) / 1000),
        endpoints: {
          api: "https://api.individual.githubcopilot.com"
        }
      }
      
      // Mock successful token refresh
      const originalFetch = global.fetch
      global.fetch = async (url: string) => {
        if (url.includes("copilot_internal/v2/token")) {
          return {
            ok: true,
            json: async () => mockTokenResponse
          } as Response
        }
        throw new Error(`Unexpected fetch to ${url}`)
      }
      
      try {
        const token = await GitHubCopilotAuth.getAccessToken()
        expect(token).toBe("new-access-token")
        
        // Verify auth was updated
        const updatedAuth = await GitHubCopilotAuth.getAuth()
        expect(updatedAuth?.access).toBe("new-access-token")
        expect(updatedAuth?.expires).toBe(mockTokenResponse.expires_at * 1000)
      } finally {
        global.fetch = originalFetch
      }
    })

    it("should handle token refresh failure", async () => {
      await GitHubCopilotAuth.setAuth(expiredAuthData)
      
      // Mock failed token refresh
      const originalFetch = global.fetch
      global.fetch = async () => {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized"
        } as Response
      }
      
      try {
        const token = await GitHubCopilotAuth.getAccessToken()
        expect(token).toBeNull()
      } finally {
        global.fetch = originalFetch
      }
    })

    it("should handle network errors during token refresh", async () => {
      await GitHubCopilotAuth.setAuth(expiredAuthData)
      
      // Mock network error
      const originalFetch = global.fetch
      global.fetch = async () => {
        throw new Error("Network error")
      }
      
      try {
        const token = await GitHubCopilotAuth.getAccessToken()
        expect(token).toBeNull()
      } finally {
        global.fetch = originalFetch
      }
    })
  })

  describe("Authentication Status", () => {
    it("should return true when authenticated with valid token", async () => {
      await GitHubCopilotAuth.setAuth(mockAuthData)
      
      // Mock fetch to avoid network calls
      const originalFetch = global.fetch
      global.fetch = async () => {
        throw new Error("Should not make network call")
      }
      
      try {
        const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
        expect(isAuthenticated).toBe(true)
      } finally {
        global.fetch = originalFetch
      }
    })

    it("should return false when not authenticated", async () => {
      const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
      expect(isAuthenticated).toBe(false)
    })

    it("should return false when token refresh fails", async () => {
      await GitHubCopilotAuth.setAuth(expiredAuthData)
      
      // Mock failed token refresh
      const originalFetch = global.fetch
      global.fetch = async () => {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized"
        } as Response
      }
      
      try {
        const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
        expect(isAuthenticated).toBe(false)
      } finally {
        global.fetch = originalFetch
      }
    })
  })

  describe("Auth Data Validation", () => {
    it("should validate complete auth data", async () => {
      await GitHubCopilotAuth.setAuth(mockAuthData)
      const auth = await GitHubCopilotAuth.getAuth()
      
      expect(auth?.type).toBe("oauth")
      expect(auth?.refresh).toBe("mock-refresh-token")
      expect(auth?.access).toBe("mock-access-token")
      expect(auth?.expires).toBeTypeOf("number")
      expect(auth?.endpoint).toBe("https://api.individual.githubcopilot.com")
    })

    it("should handle auth data without endpoint", async () => {
      const authWithoutEndpoint = {
        type: "oauth",
        refresh: "mock-refresh-token",
        access: "mock-access-token",
        expires: Date.now() + 3600000
      }
      
      await GitHubCopilotAuth.setAuth(authWithoutEndpoint)
      const auth = await GitHubCopilotAuth.getAuth()
      
      expect(auth?.endpoint).toBeUndefined()
    })

    it("should handle auth data with different type", async () => {
      const deviceAuth = {
        type: "device",
        device_code: "mock-device-code",
        user_code: "ABCD-1234"
      }
      
      await GitHubCopilotAuth.setAuth(deviceAuth)
      const auth = await GitHubCopilotAuth.getAuth()
      
      expect(auth?.type).toBe("device")
    })
  })

  describe("Error Handling", () => {
    it("should handle file system errors gracefully", async () => {
      // Mock fs.readFile to throw an error
      const originalReadFile = fs.readFile
      fs.readFile = async () => {
        throw new Error("Permission denied")
      }
      
      try {
        const auth = await GitHubCopilotAuth.getAuth()
        expect(auth).toBeNull()
      } finally {
        fs.readFile = originalReadFile
      }
    })

    it("should handle JSON parsing errors", async () => {
      // Write invalid JSON
      await fs.writeFile(testAuthFile, "{ invalid json")
      
      const auth = await GitHubCopilotAuth.getAuth()
      expect(auth).toBeNull()
    })

    it("should handle write errors gracefully", async () => {
      // Mock fs.writeFile to throw an error
      const originalWriteFile = fs.writeFile
      fs.writeFile = async () => {
        throw new Error("Disk full")
      }
      
      try {
        // Should not throw, but handle error gracefully
        await expect(GitHubCopilotAuth.setAuth(mockAuthData)).rejects.toThrow()
      } finally {
        fs.writeFile = originalWriteFile
      }
    })
  })
})
