/**
 * Performance Optimization Utilities
 * Provides caching, memoization, and performance improvements
 */

import { logger } from './logger'
import { PERFORMANCE_CONSTANTS } from '../constants'

/**
 * Simple LRU Cache implementation for performance optimization
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>()
  private maxSize: number

  constructor(maxSize: number = PERFORMANCE_CONSTANTS.DEFAULT_CACHE_SIZE) {
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

/**
 * Memoization decorator for expensive function calls
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  cacheSize: number = PERFORMANCE_CONSTANTS.DEFAULT_CACHE_SIZE
): T {
  const cache = new LRUCache<string, ReturnType<T>>(cacheSize)
  
  const memoized = ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args)
    
    if (cache.has(key)) {
      return cache.get(key)!
    }
    
    const result = fn(...args)
    cache.set(key, result)
    return result
  }) as T

  // Add cache management methods
  ;(memoized as any).clearCache = () => cache.clear()
  ;(memoized as any).getCacheSize = () => cache.size()
  
  return memoized
}

/**
 * Debounce function to limit function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = PERFORMANCE_CONSTANTS.DEFAULT_DEBOUNCE_MS
): T {
  let timeoutId: NodeJS.Timeout | null = null
  
  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    timeoutId = setTimeout(() => {
      fn(...args)
    }, delay)
  }) as T
}

/**
 * Throttle function to limit function execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number = PERFORMANCE_CONSTANTS.DEFAULT_THROTTLE_MS
): T {
  let inThrottle = false
  
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }) as T
}

/**
 * Optimized string concatenation for template literals
 */
export class StringBuffer {
  private parts: string[] = []
  
  append(str: string): this {
    this.parts.push(str)
    return this
  }
  
  appendLine(str: string = ''): this {
    this.parts.push(str, '\n')
    return this
  }
  
  toString(): string {
    return this.parts.join('')
  }
  
  clear(): this {
    this.parts.length = 0
    return this
  }
  
  size(): number {
    return this.parts.length
  }
}

/**
 * Optimized object property access
 */
export function fastGet<T>(obj: any, path: string): T | undefined {
  // Pre-split paths for better performance
  const keys = path.split('.')
  let current = obj
  
  for (let i = 0; i < keys.length; i++) {
    if (current == null) return undefined
    current = current[keys[i]]
  }
  
  return current
}

/**
 * Fast array operations
 */
export class FastArray<T> {
  private items: T[] = []
  
  constructor(initialCapacity?: number) {
    if (initialCapacity) {
      this.items = new Array(initialCapacity)
    }
  }
  
  push(item: T): number {
    return this.items.push(item)
  }
  
  get(index: number): T | undefined {
    return this.items[index]
  }
  
  set(index: number, value: T): void {
    this.items[index] = value
  }
  
  length(): number {
    return this.items.length
  }
  
  clear(): void {
    this.items.length = 0
  }
  
  toArray(): T[] {
    return this.items.slice()
  }
  
  forEach(callback: (item: T, index: number) => void): void {
    for (let i = 0; i < this.items.length; i++) {
      callback(this.items[i], i)
    }
  }
  
  filter(predicate: (item: T) => boolean): T[] {
    const result: T[] = []
    for (let i = 0; i < this.items.length; i++) {
      if (predicate(this.items[i])) {
        result.push(this.items[i])
      }
    }
    return result
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private static timers = new Map<string, number>()
  
  static start(label: string): void {
    this.timers.set(label, performance.now())
  }
  
  static end(label: string): number {
    const startTime = this.timers.get(label)
    if (!startTime) {
      logger.warn('PERFORMANCE', `Timer ${label} not found`)
      return 0
    }
    
    const duration = performance.now() - startTime
    this.timers.delete(label)
    
    logger.debug('PERFORMANCE', `${label} took ${duration.toFixed(2)}ms`)
    return duration
  }
  
  static measure<T>(label: string, fn: () => T): T {
    this.start(label)
    try {
      return fn()
    } finally {
      this.end(label)
    }
  }
  
  static async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label)
    try {
      return await fn()
    } finally {
      this.end(label)
    }
  }
}

/**
 * Batch processing utility for performance
 */
export class BatchProcessor<T> {
  private batch: T[] = []
  private batchSize: number
  private processor: (items: T[]) => Promise<void> | void
  private timeout: NodeJS.Timeout | null = null
  private flushDelay: number

  constructor(
    processor: (items: T[]) => Promise<void> | void,
    batchSize: number = PERFORMANCE_CONSTANTS.DEFAULT_BATCH_SIZE,
    flushDelay: number = PERFORMANCE_CONSTANTS.DEFAULT_BATCH_FLUSH_MS
  ) {
    this.processor = processor
    this.batchSize = batchSize
    this.flushDelay = flushDelay
  }

  add(item: T): void {
    this.batch.push(item)
    
    if (this.batch.length >= this.batchSize) {
      this.flush()
    } else {
      this.scheduleFlush()
    }
  }

  private scheduleFlush(): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }
    
    this.timeout = setTimeout(() => {
      this.flush()
    }, this.flushDelay)
  }

  async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    
    if (this.batch.length === 0) {
      return
    }
    
    const items = this.batch.splice(0)
    try {
      await this.processor(items)
    } catch (error) {
      logger.error('BATCH_PROCESSOR', 'Failed to process batch', error instanceof Error ? error : new Error(String(error)))
    }
  }

  size(): number {
    return this.batch.length
  }
}

/**
 * Optimized JSON operations
 */
export const FastJSON = {
  /**
   * Fast JSON parsing with error handling
   */
  parse<T = any>(text: string): T | null {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  },

  /**
   * Fast JSON stringification with error handling
   */
  stringify(value: any): string | null {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  },

  /**
   * Safe JSON stringify with fallback
   */
  safeStringify(value: any, fallback: string = '{}'): string {
    return this.stringify(value) ?? fallback
  }
}

/**
 * Memory-efficient string operations
 */
export const FastString = {
  /**
   * Fast string concatenation
   */
  concat(...strings: string[]): string {
    return strings.join('')
  },

  /**
   * Fast string replacement
   */
  replaceAll(str: string, search: string, replace: string): string {
    return str.split(search).join(replace)
  },

  /**
   * Fast string trimming
   */
  trim(str: string): string {
    return str.trim()
  },

  /**
   * Fast case conversion
   */
  toLowerCase(str: string): string {
    return str.toLowerCase()
  },

  toUpperCase(str: string): string {
    return str.toUpperCase()
  }
}

/**
 * Export commonly used optimized functions
 */
export const optimized = {
  memoize,
  debounce,
  throttle,
  StringBuffer,
  FastArray,
  PerformanceMonitor,
  BatchProcessor,
  FastJSON,
  FastString,
  LRUCache
}
