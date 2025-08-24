import type { ContentBlock, TextContent, ImageContent } from "../types"
import { logger } from "./logger"
import { CONTENT_CONSTANTS, SIZE_CONSTANTS } from "../constants"
import { safeGet, safeArrayAccess, validateInput } from "./errorBoundary"

/**
 * Content transformation cache for optimized processing
 * PERFORMANCE OPTIMIZATION: Enhanced with hit/miss tracking and proper LRU eviction
 */
class ContentTransformationCache {
  private cache = new Map<string, { result: any, timestamp: number, lastAccessed: number }>()
  private readonly MAX_CACHE_SIZE = 1000
  private readonly CACHE_TTL = 300000 // 5 minutes

  // PERFORMANCE OPTIMIZATION: Hit/miss tracking for cache effectiveness monitoring
  private hitCount = 0
  private missCount = 0
  private evictionCount = 0

  /**
   * Generate cache key from content
   */
  private generateKey(content: string | ContentBlock[]): string {
    if (typeof content === "string") {
      return `str:${content.length}:${content.slice(0, 100)}`
    }

    const summary = content.map(block => `${block.type}:${
      block.type === "text" ? (block as TextContent).text.length : "img"
    }`).join("|")

    return `arr:${content.length}:${summary}`
  }

  /**
   * Get cached transformation result
   * PERFORMANCE OPTIMIZATION: Enhanced with hit/miss tracking and LRU access time update
   */
  get(content: string | ContentBlock[]): any | null {
    const key = this.generateKey(content)
    const cached = this.cache.get(key)

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Cache hit - update access time for LRU and increment hit counter
      cached.lastAccessed = Date.now()
      this.cache.set(key, cached) // Update the entry to maintain insertion order
      this.hitCount++

      logger.debug('CONTENT_CACHE', `✅ Cache hit for content transformation (${this.getHitRate().toFixed(2)}% hit rate)`)
      return cached.result
    }

    if (cached) {
      this.cache.delete(key) // Remove expired entry
      logger.debug('CONTENT_CACHE', `🕐 Expired cache entry removed`)
    }

    // Cache miss
    this.missCount++
    logger.debug('CONTENT_CACHE', `❌ Cache miss for content transformation (${this.getHitRate().toFixed(2)}% hit rate)`)
    return null
  }

  /**
   * Store transformation result in cache
   * PERFORMANCE OPTIMIZATION: Enhanced with proper LRU eviction strategy
   */
  set(content: string | ContentBlock[], result: any): void {
    const key = this.generateKey(content)
    const now = Date.now()

    // PERFORMANCE OPTIMIZATION: Proper LRU eviction - remove multiple entries if needed
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLRUEntries()
    }

    this.cache.set(key, {
      result,
      timestamp: now,
      lastAccessed: now
    })

    logger.debug('CONTENT_CACHE', `📦 Cached content transformation result (cache size: ${this.cache.size}/${this.MAX_CACHE_SIZE})`)
  }

  /**
   * PERFORMANCE OPTIMIZATION: Evict least recently used entries
   * Removes oldest 20% of entries to make room for new ones
   */
  private evictLRUEntries(): void {
    const entries = Array.from(this.cache.entries())

    // Sort by last accessed time (oldest first)
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)

    // Remove oldest 20% of entries
    const toRemove = Math.max(1, Math.floor(entries.length * 0.2))
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0])
      this.evictionCount++
    }

    logger.debug('CONTENT_CACHE', `🗑️ Evicted ${toRemove} LRU cache entries`)
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * PERFORMANCE OPTIMIZATION: Get hit rate percentage
   */
  getHitRate(): number {
    const totalRequests = this.hitCount + this.missCount
    return totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0
  }

  /**
   * Get cache statistics
   * PERFORMANCE OPTIMIZATION: Enhanced with actual hit/miss tracking
   */
  getStats(): {
    size: number
    maxSize: number
    hitRate: number
    hitCount: number
    missCount: number
    evictionCount: number
    totalRequests: number
  } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: this.getHitRate(),
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
      totalRequests: this.hitCount + this.missCount
    }
  }
}

// Global cache instance
const transformationCache = new ContentTransformationCache()

/**
 * Extract text content from either string or array format (optimized with caching)
 * Handles both legacy string format and new multi-modal array format
 */
export function extractTextContent(content: string | ContentBlock[]): string {
  // Check cache first
  const cached = transformationCache.get(content)
  if (cached !== null) {
    return cached
  }

  let result: string

  // Handle legacy string format
  if (typeof content === "string") {
    result = content
  }
  // Handle new array format
  else if (Array.isArray(content)) {
    // Extract text from all text blocks (optimized)
    const textBlocks: string[] = []
    let imageCount = 0

    for (const block of content) {
      if (block.type === "text") {
        textBlocks.push((block as TextContent).text)
      } else if (block.type === "image_url") {
        imageCount++
      }
    }

    // Log warning if no text content found
    if (textBlocks.length === 0) {
      logger.warn('CONTENT', "No text content found in message array - message will be empty")
      result = ""
    } else {
      // Log info about dropped image content (only if images present)
      if (imageCount > 0) {
        logger.debug('CONTENT', `Dropping ${imageCount} image(s) - GitHub Copilot only supports text content`)
      }

      // Join all text blocks with spaces
      result = textBlocks.join(" ")
    }
  }
  // Fallback for unexpected content type
  else {
    logger.warn('CONTENT', "Unexpected content type, treating as empty string")
    result = ""
  }

  // Cache the result
  transformationCache.set(content, result)
  return result
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
 * Transform an array of messages for GitHub Copilot compatibility (optimized)
 * Converts all multi-modal content to text-only format with batch processing
 */
export function transformMessagesForCopilot(messages: Array<{
  role: "system" | "user" | "assistant"
  content: string | ContentBlock[]
}>): Array<{
  role: "system" | "user" | "assistant"
  content: string
}> {
  const startTime = Date.now()

  // Batch process messages for better performance
  const transformedMessages = messages.map(transformMessageForCopilot)

  const duration = Date.now() - startTime
  if (duration > 10) { // Log only if transformation takes significant time
    logger.debug('CONTENT', `Transformed ${messages.length} messages in ${duration}ms`)
  }

  return transformedMessages
}

/**
 * Optimized batch transformation for large message arrays
 */
export async function transformMessagesForCopilotBatch(messages: Array<{
  role: "system" | "user" | "assistant"
  content: string | ContentBlock[]
}>, batchSize: number = 100): Promise<Array<{
  role: "system" | "user" | "assistant"
  content: string
}>> {
  if (messages.length <= batchSize) {
    return transformMessagesForCopilot(messages)
  }

  const result: Array<{
    role: "system" | "user" | "assistant"
    content: string
  }> = []

  // Process in batches to avoid blocking the event loop
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const transformedBatch = batch.map(transformMessageForCopilot)
    result.push(...transformedBatch)

    // Yield control to event loop between batches
    if (i + batchSize < messages.length) {
      // Use setImmediate equivalent for Bun
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  return result
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

/**
 * Content transformation utilities and cache management
 */
export class ContentTransformer {
  /**
   * Get transformation cache statistics
   */
  static getCacheStats(): {
    size: number
    maxSize: number
    hitRate: number
  } {
    return transformationCache.getStats()
  }

  /**
   * Clear transformation cache
   */
  static clearCache(): void {
    transformationCache.clear()
    logger.info('CONTENT', 'Content transformation cache cleared')
  }

  /**
   * Preprocess and validate content before transformation
   */
  static preprocessContent(content: string | ContentBlock[]): {
    isValid: boolean
    error?: string
    estimatedSize: number
    complexity: 'simple' | 'moderate' | 'complex'
  } {
    if (typeof content === "string") {
      return {
        isValid: true,
        estimatedSize: content.length,
        complexity: content.length > 10000 ? 'complex' : content.length > 1000 ? 'moderate' : 'simple'
      }
    }

    if (Array.isArray(content)) {
      let totalSize = 0
      let textBlocks = 0
      let imageBlocks = 0

      for (const block of content) {
        if (!block || typeof block !== 'object') {
          continue // Skip invalid blocks
        }

        if (block.type === "text") {
          textBlocks++
          const textContent = block as TextContent
          const textLength = textContent.text?.length || 0
          totalSize += textLength
        } else if (block.type === "image_url") {
          imageBlocks++
          totalSize += CONTENT_CONSTANTS.IMAGE_OVERHEAD_BYTES
        }
      }

      const complexity = totalSize > CONTENT_CONSTANTS.COMPLEXITY_THRESHOLDS.COMPLEX_SIZE ||
                        content.length > CONTENT_CONSTANTS.COMPLEXITY_THRESHOLDS.COMPLEX_BLOCKS ? 'complex' :
                        totalSize > CONTENT_CONSTANTS.COMPLEXITY_THRESHOLDS.SIMPLE_SIZE ||
                        content.length > CONTENT_CONSTANTS.COMPLEXITY_THRESHOLDS.SIMPLE_BLOCKS ? 'moderate' : 'simple'

      return {
        isValid: textBlocks > 0,
        error: textBlocks === 0 ? "No text content found" : undefined,
        estimatedSize: totalSize,
        complexity
      }
    }

    return {
      isValid: false,
      error: "Invalid content type",
      estimatedSize: 0,
      complexity: 'simple'
    }
  }

  /**
   * Optimized transformation with preprocessing
   */
  static async transformWithPreprocessing(content: string | ContentBlock[]): Promise<string> {
    const preprocessing = this.preprocessContent(content)

    if (!preprocessing.isValid) {
      throw new Error(preprocessing.error || "Invalid content")
    }

    // Use different strategies based on complexity
    if (preprocessing.complexity === 'complex') {
      logger.debug('CONTENT', `Processing complex content (${preprocessing.estimatedSize} bytes)`)

      // For complex content, use streaming approach
      return this.extractTextContentStreaming(content)
    } else {
      // For simple/moderate content, use standard approach
      return extractTextContent(content)
    }
  }

  /**
   * Streaming text extraction for large content
   */
  private static extractTextContentStreaming(content: string | ContentBlock[]): string {
    if (typeof content === "string") {
      return content
    }

    if (Array.isArray(content)) {
      const textParts: string[] = []

      // Process in chunks to avoid blocking
      for (const block of content) {
        if (block.type === "text") {
          textParts.push((block as TextContent).text)
        }
      }

      return textParts.join(" ")
    }

    return ""
  }
}
