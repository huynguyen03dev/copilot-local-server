/**
 * Role Normalization Utilities
 * Provides utilities for debugging and handling role normalization issues
 */

import { logger } from "./logger"

export interface RoleNormalizationResult {
  original: string
  normalized: string
  wasTransformed: boolean
  mapping?: string
}

/**
 * Normalize a role string with detailed logging
 * Used for debugging role normalization issues
 */
export function normalizeRoleWithLogging(role: string): RoleNormalizationResult {
  const original = role
  const trimmed = role.trim()
  const normalized = trimmed.toLowerCase()
  
  // Map common alternative role names
  const roleMap: Record<string, string> = {
    'human': 'user',
    'ai': 'assistant',
    'bot': 'assistant',
    'model': 'assistant',
    'chatbot': 'assistant',
    'gpt': 'assistant'
  }
  
  const mapped = roleMap[normalized] || normalized
  const wasTransformed = mapped !== original
  
  const result: RoleNormalizationResult = {
    original,
    normalized: mapped,
    wasTransformed,
    mapping: roleMap[normalized] ? `${normalized} → ${mapped}` : undefined
  }
  
  // Log transformation in development
  if (process.env.NODE_ENV === 'development' && wasTransformed) {
    logger.debug('ROLE_NORMALIZATION', `Role transformed:`, result)
  }
  
  return result
}

/**
 * Check if a role is valid after normalization
 */
export function isValidRole(role: string): boolean {
  const normalized = normalizeRoleWithLogging(role)
  return ['system', 'user', 'assistant'].includes(normalized.normalized)
}

/**
 * Get all supported role variations
 * Useful for documentation and error messages
 */
export function getSupportedRoleVariations(): Record<string, string[]> {
  return {
    system: ['system', 'System', 'SYSTEM', ' system ', '\tsystem\t'],
    user: ['user', 'User', 'USER', 'human', 'Human', 'HUMAN', ' user ', '\tuser\t'],
    assistant: [
      'assistant', 'Assistant', 'ASSISTANT',
      'ai', 'AI', 'Ai',
      'bot', 'Bot', 'BOT',
      'model', 'Model', 'MODEL',
      'chatbot', 'Chatbot', 'CHATBOT',
      'gpt', 'GPT', 'Gpt',
      ' assistant ', '\tassistant\t'
    ]
  }
}

/**
 * Generate a helpful error message for invalid roles
 */
export function generateRoleErrorMessage(invalidRole: string): string {
  const variations = getSupportedRoleVariations()
  const allSupported = Object.values(variations).flat()
  
  // Check if it's close to a valid role
  const normalized = invalidRole.toLowerCase().trim()
  let suggestion = ''
  
  if (normalized.includes('sys')) {
    suggestion = ' Did you mean "system"?'
  } else if (normalized.includes('use') || normalized.includes('hum')) {
    suggestion = ' Did you mean "user" or "human"?'
  } else if (normalized.includes('ass') || normalized.includes('ai') || normalized.includes('bot')) {
    suggestion = ' Did you mean "assistant", "ai", or "bot"?'
  }
  
  return `Role must be one of: system, user, assistant (received: "${invalidRole}").${suggestion} Supported variations include: ${allSupported.slice(0, 10).join(', ')}...`
}

/**
 * Validate and normalize a message object
 * Returns normalized message or throws descriptive error
 */
export function validateAndNormalizeMessage(message: any): {
  role: 'system' | 'user' | 'assistant'
  content: string | any[]
} {
  if (!message || typeof message !== 'object') {
    throw new Error('Message must be an object')
  }
  
  if (!message.role) {
    throw new Error('Message must have a role field')
  }
  
  if (!message.content) {
    throw new Error('Message must have a content field')
  }
  
  const roleResult = normalizeRoleWithLogging(message.role)
  
  if (!isValidRole(message.role)) {
    throw new Error(generateRoleErrorMessage(message.role))
  }
  
  return {
    role: roleResult.normalized as 'system' | 'user' | 'assistant',
    content: message.content
  }
}

/**
 * Debug helper: Log role normalization statistics
 */
export function logRoleNormalizationStats(messages: any[]): void {
  if (process.env.NODE_ENV !== 'development') {
    return
  }
  
  const stats = {
    total: messages.length,
    transformed: 0,
    byRole: { system: 0, user: 0, assistant: 0 },
    transformations: [] as string[]
  }
  
  messages.forEach((message, index) => {
    if (message.role) {
      const result = normalizeRoleWithLogging(message.role)
      
      if (result.wasTransformed) {
        stats.transformed++
        stats.transformations.push(`[${index}] ${result.original} → ${result.normalized}`)
      }
      
      if (['system', 'user', 'assistant'].includes(result.normalized)) {
        stats.byRole[result.normalized as keyof typeof stats.byRole]++
      }
    }
  })
  
  if (stats.transformed > 0) {
    logger.debug('ROLE_NORMALIZATION', `Message role statistics:`, {
      ...stats,
      transformationRate: `${((stats.transformed / stats.total) * 100).toFixed(1)}%`
    })
  }
}

/**
 * Middleware helper: Extract and validate roles from request
 */
export function extractAndValidateRoles(requestBody: any): {
  isValid: boolean
  errors: string[]
  normalizedMessages?: any[]
} {
  const errors: string[] = []
  const normalizedMessages: any[] = []
  
  if (!requestBody.messages || !Array.isArray(requestBody.messages)) {
    errors.push('Request must contain a messages array')
    return { isValid: false, errors }
  }
  
  requestBody.messages.forEach((message: any, index: number) => {
    try {
      const normalized = validateAndNormalizeMessage(message)
      normalizedMessages.push({
        ...message,
        role: normalized.role
      })
    } catch (error) {
      errors.push(`Message ${index}: ${error instanceof Error ? error.message : 'Invalid message'}`)
    }
  })
  
  return {
    isValid: errors.length === 0,
    errors,
    normalizedMessages: errors.length === 0 ? normalizedMessages : undefined
  }
}
