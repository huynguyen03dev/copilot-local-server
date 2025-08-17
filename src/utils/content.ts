import type { ContentBlock, TextContent, ImageContent } from "../types"

/**
 * Extract text content from either string or array format
 * Handles both legacy string format and new multi-modal array format
 */
export function extractTextContent(content: string | ContentBlock[]): string {
  // Handle legacy string format
  if (typeof content === "string") {
    return content
  }
  
  // Handle new array format
  if (Array.isArray(content)) {
    // Extract text from all text blocks
    const textBlocks = content
      .filter(block => block.type === "text")
      .map(block => (block as TextContent).text)
    
    // Log warning if no text content found
    if (textBlocks.length === 0) {
      console.warn("⚠️  No text content found in message array - message will be empty")
      return ""
    }
    
    // Log info about dropped image content
    const imageBlocks = content.filter(block => block.type === "image_url")
    if (imageBlocks.length > 0) {
      console.log(`📷 Dropping ${imageBlocks.length} image(s) - GitHub Copilot only supports text content`)
    }
    
    // Join all text blocks with spaces
    return textBlocks.join(" ")
  }
  
  // Fallback for unexpected content type
  console.warn("⚠️  Unexpected content type, treating as empty string")
  return ""
}

/**
 * Validate that content has at least one text block (for array format)
 * Returns validation result with helpful error messages
 */
export function validateContent(content: string | ContentBlock[]): {
  isValid: boolean
  error?: string
} {
  // String content is always valid
  if (typeof content === "string") {
    return { isValid: true }
  }
  
  // Array content validation
  if (Array.isArray(content)) {
    // Check if array is empty
    if (content.length === 0) {
      return {
        isValid: false,
        error: "Content array cannot be empty"
      }
    }
    
    // Check if there's at least one text block
    const hasTextContent = content.some(block => block.type === "text")
    if (!hasTextContent) {
      return {
        isValid: false,
        error: "Content array must contain at least one text block"
      }
    }
    
    // Check for valid block types
    const validTypes = ["text", "image_url"]
    const invalidBlocks = content.filter(block => !validTypes.includes(block.type))
    if (invalidBlocks.length > 0) {
      return {
        isValid: false,
        error: `Invalid content block type(s): ${invalidBlocks.map(b => b.type).join(", ")}`
      }
    }
    
    return { isValid: true }
  }
  
  return {
    isValid: false,
    error: "Content must be either a string or an array of content blocks"
  }
}

/**
 * Transform a message with multi-modal content to text-only format for GitHub Copilot
 * This ensures compatibility with Copilot's text-only API
 */
export function transformMessageForCopilot(message: {
  role: "system" | "user" | "assistant"
  content: string | ContentBlock[]
}): {
  role: "system" | "user" | "assistant"
  content: string
} {
  return {
    role: message.role,
    content: extractTextContent(message.content)
  }
}

/**
 * Transform an array of messages for GitHub Copilot compatibility
 * Converts all multi-modal content to text-only format
 */
export function transformMessagesForCopilot(messages: Array<{
  role: "system" | "user" | "assistant"
  content: string | ContentBlock[]
}>): Array<{
  role: "system" | "user" | "assistant"
  content: string
}> {
  return messages.map(transformMessageForCopilot)
}

/**
 * Get content statistics for logging/debugging
 */
export function getContentStats(content: string | ContentBlock[]): {
  type: "string" | "array"
  textBlocks: number
  imageBlocks: number
  totalLength: number
} {
  if (typeof content === "string") {
    return {
      type: "string",
      textBlocks: 1,
      imageBlocks: 0,
      totalLength: content.length
    }
  }
  
  if (Array.isArray(content)) {
    const textBlocks = content.filter(block => block.type === "text")
    const imageBlocks = content.filter(block => block.type === "image_url")
    const totalLength = textBlocks.reduce((sum, block) => sum + (block as TextContent).text.length, 0)
    
    return {
      type: "array",
      textBlocks: textBlocks.length,
      imageBlocks: imageBlocks.length,
      totalLength
    }
  }
  
  return {
    type: "string",
    textBlocks: 0,
    imageBlocks: 0,
    totalLength: 0
  }
}
