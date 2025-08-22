/**
 * Role Normalization Tests
 * Tests the role normalization functionality for client compatibility
 */

import { describe, it, expect } from "bun:test"
import { ChatMessage, DeltaMessage } from "../../src/types"

describe("Role Normalization", () => {
  describe("ChatMessage Role Normalization", () => {
    it("should accept standard lowercase roles", () => {
      const validRoles = ["system", "user", "assistant"]
      
      validRoles.forEach(role => {
        const message = {
          role,
          content: "Test message"
        }
        
        const result = ChatMessage.safeParse(message)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.role).toBe(role)
        }
      })
    })

    it("should normalize capitalized roles", () => {
      const testCases = [
        { input: "System", expected: "system" },
        { input: "User", expected: "user" },
        { input: "Assistant", expected: "assistant" },
        { input: "SYSTEM", expected: "system" },
        { input: "USER", expected: "user" },
        { input: "ASSISTANT", expected: "assistant" }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const message = {
          role: input,
          content: "Test message"
        }
        
        const result = ChatMessage.safeParse(message)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.role).toBe(expected)
        }
      })
    })

    it("should normalize roles with whitespace", () => {
      const testCases = [
        { input: " system ", expected: "system" },
        { input: "\tuser\t", expected: "user" },
        { input: "\nassistant\n", expected: "assistant" },
        { input: "  System  ", expected: "system" }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const message = {
          role: input,
          content: "Test message"
        }
        
        const result = ChatMessage.safeParse(message)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.role).toBe(expected)
        }
      })
    })

    it("should map alternative role names", () => {
      const testCases = [
        { input: "human", expected: "user" },
        { input: "ai", expected: "assistant" },
        { input: "bot", expected: "assistant" },
        { input: "model", expected: "assistant" },
        { input: "chatbot", expected: "assistant" },
        { input: "gpt", expected: "assistant" },
        { input: "Human", expected: "user" },
        { input: "AI", expected: "assistant" },
        { input: "Bot", expected: "assistant" }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const message = {
          role: input,
          content: "Test message"
        }
        
        const result = ChatMessage.safeParse(message)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.role).toBe(expected)
        }
      })
    })

    it("should reject invalid roles", () => {
      const invalidRoles = [
        "admin",
        "root",
        "superuser",
        "moderator",
        "invalid",
        "unknown",
        "",
        "123",
        "null"
      ]
      
      invalidRoles.forEach(role => {
        const message = {
          role,
          content: "Test message"
        }
        
        const result = ChatMessage.safeParse(message)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("Role must be one of: system, user, assistant")
        }
      })
    })

    it("should handle complex Cline-style requests", () => {
      // Simulate a typical Cline request that might cause issues
      const clineStyleMessage = {
        role: "System", // Capitalized role
        content: "You are Cline, a helpful AI assistant."
      }
      
      const result = ChatMessage.safeParse(clineStyleMessage)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.role).toBe("system")
        expect(result.data.content).toBe("You are Cline, a helpful AI assistant.")
      }
    })
  })

  describe("DeltaMessage Role Normalization", () => {
    it("should normalize roles in streaming responses", () => {
      const testCases = [
        { input: "System", expected: "system" },
        { input: "human", expected: "user" },
        { input: "AI", expected: "assistant" },
        { input: " bot ", expected: "assistant" }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const deltaMessage = {
          role: input,
          content: "Streaming content"
        }
        
        const result = DeltaMessage.safeParse(deltaMessage)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.role).toBe(expected)
        }
      })
    })

    it("should handle optional role in delta messages", () => {
      const deltaMessage = {
        content: "Content without role"
      }
      
      const result = DeltaMessage.safeParse(deltaMessage)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.role).toBeUndefined()
        expect(result.data.content).toBe("Content without role")
      }
    })
  })

  describe("Error Messages", () => {
    it("should provide helpful error messages with received value", () => {
      const message = {
        role: "invalid_role",
        content: "Test message"
      }
      
      const result = ChatMessage.safeParse(message)
      expect(result.success).toBe(false)
      if (!result.success) {
        const errorMessage = result.error.issues[0].message
        expect(errorMessage).toContain("Role must be one of: system, user, assistant")
        expect(errorMessage).toContain("invalid_role")
      }
    })
  })

  describe("Backward Compatibility", () => {
    it("should maintain compatibility with existing valid requests", () => {
      const standardRequest = {
        role: "user",
        content: "Hello, world!"
      }
      
      const result = ChatMessage.safeParse(standardRequest)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.role).toBe("user")
        expect(result.data.content).toBe("Hello, world!")
      }
    })

    it("should work with array content format", () => {
      const multiModalMessage = {
        role: "User", // Capitalized
        content: [
          { type: "text", text: "Look at this image:" },
          { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
        ]
      }
      
      const result = ChatMessage.safeParse(multiModalMessage)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.role).toBe("user") // Normalized to lowercase
        expect(Array.isArray(result.data.content)).toBe(true)
      }
    })
  })
})
