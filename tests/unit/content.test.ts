/**
 * Unit Tests for Content Processing Utilities
 * Tests content validation, transformation, and statistics functions
 */

import { describe, it, expect, beforeEach } from "bun:test"
import {
  extractTextContent,
  validateContent,
  transformMessageForCopilot,
  transformMessagesForCopilot,
  getContentStats
} from "../../src/utils/content"
import type { ContentBlock, TextContent, ImageContent } from "../../src/types"

describe("Content Processing Utilities", () => {
  describe("extractTextContent", () => {
    it("should handle string content", () => {
      const content = "Hello, world!"
      const result = extractTextContent(content)
      expect(result).toBe("Hello, world!")
    })

    it("should extract text from array with single text block", () => {
      const content: ContentBlock[] = [
        { type: "text", text: "Hello from array" }
      ]
      const result = extractTextContent(content)
      expect(result).toBe("Hello from array")
    })

    it("should extract and join multiple text blocks", () => {
      const content: ContentBlock[] = [
        { type: "text", text: "First part" },
        { type: "text", text: "Second part" },
        { type: "text", text: "Third part" }
      ]
      const result = extractTextContent(content)
      expect(result).toBe("First part Second part Third part")
    })

    it("should filter out image blocks and extract only text", () => {
      const content: ContentBlock[] = [
        { type: "text", text: "Text before image" },
        { type: "image_url", image_url: { url: "https://example.com/image.jpg" } },
        { type: "text", text: "Text after image" }
      ]
      const result = extractTextContent(content)
      expect(result).toBe("Text before image Text after image")
    })

    it("should return empty string for array with no text blocks", () => {
      const content: ContentBlock[] = [
        { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
      ]
      const result = extractTextContent(content)
      expect(result).toBe("")
    })

    it("should return empty string for empty array", () => {
      const content: ContentBlock[] = []
      const result = extractTextContent(content)
      expect(result).toBe("")
    })

    it("should handle unexpected content types gracefully", () => {
      const content = null as any
      const result = extractTextContent(content)
      expect(result).toBe("")
    })

    it("should handle undefined content gracefully", () => {
      const content = undefined as any
      const result = extractTextContent(content)
      expect(result).toBe("")
    })
  })

  describe("validateContent", () => {
    it("should validate string content as valid", () => {
      const content = "Valid string content"
      const result = validateContent(content)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it("should validate empty string as valid", () => {
      const content = ""
      const result = validateContent(content)
      expect(result.isValid).toBe(true)
    })

    it("should validate array with text content as valid", () => {
      const content: ContentBlock[] = [
        { type: "text", text: "Valid text content" }
      ]
      const result = validateContent(content)
      expect(result.isValid).toBe(true)
    })

    it("should validate array with mixed content as valid", () => {
      const content: ContentBlock[] = [
        { type: "text", text: "Text content" },
        { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
      ]
      const result = validateContent(content)
      expect(result.isValid).toBe(true)
    })

    it("should reject empty array", () => {
      const content: ContentBlock[] = []
      const result = validateContent(content)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Content array cannot be empty")
    })

    it("should reject array with no text blocks", () => {
      const content: ContentBlock[] = [
        { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
      ]
      const result = validateContent(content)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Content array must contain at least one text block")
    })

    it("should reject array with invalid block types", () => {
      const content: ContentBlock[] = [
        { type: "text", text: "Valid text" },
        { type: "invalid_type" as any, data: "invalid" }
      ]
      const result = validateContent(content)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain("Invalid content block type(s): invalid_type")
    })

    it("should reject non-string, non-array content", () => {
      const content = 123 as any
      const result = validateContent(content)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe("Content must be either a string or an array of content blocks")
    })
  })

  describe("transformMessageForCopilot", () => {
    it("should transform message with string content", () => {
      const message = {
        role: "user" as const,
        content: "Hello, Copilot!"
      }
      const result = transformMessageForCopilot(message)
      expect(result).toEqual({
        role: "user",
        content: "Hello, Copilot!"
      })
    })

    it("should transform message with array content", () => {
      const message = {
        role: "user" as const,
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "Copilot" }
        ] as ContentBlock[]
      }
      const result = transformMessageForCopilot(message)
      expect(result).toEqual({
        role: "user",
        content: "Hello Copilot"
      })
    })

    it("should filter out images and keep only text", () => {
      const message = {
        role: "user" as const,
        content: [
          { type: "text", text: "Look at this image:" },
          { type: "image_url", image_url: { url: "https://example.com/image.jpg" } },
          { type: "text", text: "What do you see?" }
        ] as ContentBlock[]
      }
      const result = transformMessageForCopilot(message)
      expect(result).toEqual({
        role: "user",
        content: "Look at this image: What do you see?"
      })
    })
  })

  describe("transformMessagesForCopilot", () => {
    it("should transform array of messages", () => {
      const messages = [
        {
          role: "system" as const,
          content: "You are a helpful assistant"
        },
        {
          role: "user" as const,
          content: [
            { type: "text", text: "Hello" },
            { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
          ] as ContentBlock[]
        }
      ]
      const result = transformMessagesForCopilot(messages)
      expect(result).toEqual([
        {
          role: "system",
          content: "You are a helpful assistant"
        },
        {
          role: "user",
          content: "Hello"
        }
      ])
    })

    it("should handle empty messages array", () => {
      const messages: any[] = []
      const result = transformMessagesForCopilot(messages)
      expect(result).toEqual([])
    })
  })

  describe("getContentStats", () => {
    it("should get stats for string content", () => {
      const content = "Hello, world!"
      const result = getContentStats(content)
      expect(result).toEqual({
        type: "string",
        textBlocks: 1,
        imageBlocks: 0,
        totalLength: 13
      })
    })

    it("should get stats for array content with mixed blocks", () => {
      const content: ContentBlock[] = [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
        { type: "image_url", image_url: { url: "https://example.com/image.jpg" } }
      ]
      const result = getContentStats(content)
      expect(result).toEqual({
        type: "array",
        textBlocks: 2,
        imageBlocks: 1,
        totalLength: 10 // "Hello" (5) + "World" (5)
      })
    })

    it("should get stats for empty array", () => {
      const content: ContentBlock[] = []
      const result = getContentStats(content)
      expect(result).toEqual({
        type: "array",
        textBlocks: 0,
        imageBlocks: 0,
        totalLength: 0
      })
    })

    it("should handle array with only images", () => {
      const content: ContentBlock[] = [
        { type: "image_url", image_url: { url: "https://example.com/image1.jpg" } },
        { type: "image_url", image_url: { url: "https://example.com/image2.jpg" } }
      ]
      const result = getContentStats(content)
      expect(result).toEqual({
        type: "array",
        textBlocks: 0,
        imageBlocks: 2,
        totalLength: 0
      })
    })

    it("should handle unexpected content types", () => {
      const content = null as any
      const result = getContentStats(content)
      expect(result).toEqual({
        type: "string",
        textBlocks: 0,
        imageBlocks: 0,
        totalLength: 0
      })
    })
  })
})
