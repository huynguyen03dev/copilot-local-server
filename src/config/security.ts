/**
 * Security Configuration Module
 * Centralizes security-related configuration including CORS settings
 *
 * @deprecated This module is being replaced by the centralized config system.
 * Use `import { config } from './config'` instead.
 */

import { config } from './index'

export interface CORSConfig {
  origins: string[]
  credentials: boolean
  methods: string[]
  headers: string[]
}

export interface SecurityConfig {
  cors: CORSConfig
}

/**
 * Parse and validate CORS origins from environment variable
 * @param origins - Array of origin strings from configuration
 * @returns Array of validated origin URLs
 */
function parseAllowedOrigins(origins: string[]): string[] {
  // Handle wildcard case (for development)
  if (origins.includes('*')) {
    if (config.environment === 'development') {
      // Use console.warn for security warnings during startup
      console.warn('⚠️  Using wildcard CORS origin (*) - only recommended for development')
      return ['*']
    } else {
      console.warn('⚠️  Wildcard CORS origin (*) not allowed in production, falling back to localhost:3000')
      return ['http://localhost:3000']
    }
  }

  // Validate each origin
  const validOrigins = origins.filter(origin => {
    try {
      // Allow localhost patterns and valid URLs
      if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
        return true
      }

      // Validate as URL
      new URL(origin)
      return true
    } catch (error) {
      // Use console.warn for configuration warnings during startup
      console.warn(`⚠️  Invalid CORS origin ignored: ${origin}`)
      return false
    }
  })

  if (validOrigins.length === 0) {
    // Use console.warn for configuration warnings during startup
    console.warn('⚠️  No valid CORS origins found, falling back to localhost:3000')
    return ['http://localhost:3000']
  }

  return validOrigins
}

/**
 * Security configuration using centralized config system
 */
export const securityConfig: SecurityConfig = {
  cors: {
    origins: parseAllowedOrigins(config.security.corsOrigins),
    credentials: config.security.corsCredentials,
    methods: config.security.corsMethods,
    headers: config.security.corsHeaders
  }
}

/**
 * Log security configuration on startup (without sensitive data)
 */
export function logSecurityConfig(): void {
  console.log('🔒 Security Configuration:')
  console.log(`   CORS Origins: ${securityConfig.cors.origins.join(', ')}`)
  console.log(`   CORS Credentials: ${securityConfig.cors.credentials}`)
  console.log(`   CORS Methods: ${securityConfig.cors.methods.join(', ')}`)
  console.log(`   CORS Headers: ${securityConfig.cors.headers.join(', ')}`)
}
