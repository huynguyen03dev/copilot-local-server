/**
 * Configuration Builder Utility
 * Provides consistent configuration building patterns across the application
 */

import { ENVIRONMENTS, DEFAULT_CONFIGS } from '../constants'

export interface BaseConfig {
  enableMetrics?: boolean
  enableLogging?: boolean
  environment?: string
}

export interface EnvironmentOverrides<T> {
  [ENVIRONMENTS.DEVELOPMENT]?: Partial<T>
  [ENVIRONMENTS.PRODUCTION]?: Partial<T>
  [ENVIRONMENTS.TEST]?: Partial<T>
}

/**
 * Build configuration with environment-specific overrides
 */
export function buildConfig<T extends BaseConfig>(
  defaultConfig: T,
  environmentOverrides: EnvironmentOverrides<T> = {},
  userConfig: Partial<T> = {}
): T {
  const env = (process.env.NODE_ENV as keyof typeof ENVIRONMENTS) || ENVIRONMENTS.DEVELOPMENT
  const envOverrides = environmentOverrides[env] || {}
  
  return {
    ...defaultConfig,
    ...envOverrides,
    ...userConfig
  }
}

/**
 * Build middleware configuration with consistent patterns
 */
export function buildMiddlewareConfig<T extends BaseConfig>(
  defaultConfig: T,
  testConfig: Partial<T>,
  productionConfig: Partial<T>,
  userConfig: Partial<T> = {}
): T {
  const environmentOverrides: EnvironmentOverrides<T> = {
    [ENVIRONMENTS.TEST]: testConfig,
    [ENVIRONMENTS.PRODUCTION]: productionConfig,
    [ENVIRONMENTS.DEVELOPMENT]: {} // Use defaults for development
  }
  
  return buildConfig(defaultConfig, environmentOverrides, userConfig)
}

/**
 * Get environment-specific default configuration
 */
export function getEnvironmentDefaults(environment?: string) {
  const env = environment || process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT
  
  switch (env) {
    case ENVIRONMENTS.PRODUCTION:
      return DEFAULT_CONFIGS.PRODUCTION
    case ENVIRONMENTS.TEST:
      return DEFAULT_CONFIGS.TEST
    case ENVIRONMENTS.DEVELOPMENT:
    default:
      return DEFAULT_CONFIGS.DEVELOPMENT
  }
}

/**
 * Check if current environment matches
 */
export function isEnvironment(env: string): boolean {
  return (process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT) === env
}

/**
 * Environment-specific helpers
 */
export const Environment = {
  isDevelopment: () => isEnvironment(ENVIRONMENTS.DEVELOPMENT),
  isProduction: () => isEnvironment(ENVIRONMENTS.PRODUCTION),
  isTest: () => isEnvironment(ENVIRONMENTS.TEST),
  
  get current() {
    return process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT
  }
} as const

/**
 * Configuration validation helper
 */
export function validateConfig<T>(
  config: T,
  requiredFields: (keyof T)[],
  configName: string = 'Configuration'
): T {
  const missingFields = requiredFields.filter(field => 
    config[field] === undefined || config[field] === null
  )
  
  if (missingFields.length > 0) {
    throw new Error(
      `${configName} validation failed. Missing required fields: ${missingFields.join(', ')}`
    )
  }
  
  return config
}

/**
 * Merge configurations with deep merge for nested objects
 */
export function mergeConfigs<T extends Record<string, any>>(
  base: T,
  ...overrides: Partial<T>[]
): T {
  const result = { ...base }
  
  for (const override of overrides) {
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        if (
          typeof value === 'object' && 
          value !== null && 
          !Array.isArray(value) &&
          typeof result[key] === 'object' &&
          result[key] !== null &&
          !Array.isArray(result[key])
        ) {
          // Deep merge for nested objects
          result[key] = mergeConfigs(result[key], value)
        } else {
          // Direct assignment for primitives, arrays, and null values
          result[key] = value
        }
      }
    }
  }
  
  return result
}

/**
 * Create environment-aware configuration factory
 */
export function createConfigFactory<T extends BaseConfig>(
  defaultConfig: T,
  environmentOverrides: EnvironmentOverrides<T> = {}
) {
  return (userConfig: Partial<T> = {}): T => {
    return buildConfig(defaultConfig, environmentOverrides, userConfig)
  }
}

/**
 * Configuration builder for timeout values with environment scaling
 */
export function buildTimeoutConfig(
  baseTimeouts: Record<string, number>,
  environment?: string
): Record<string, number> {
  const env = environment || Environment.current
  
  // Scale timeouts based on environment
  const scaleFactor = env === ENVIRONMENTS.TEST ? 0.5 : 
                     env === ENVIRONMENTS.PRODUCTION ? 1.5 : 1.0
  
  const scaledTimeouts: Record<string, number> = {}
  
  for (const [key, value] of Object.entries(baseTimeouts)) {
    scaledTimeouts[key] = Math.round(value * scaleFactor)
  }
  
  return scaledTimeouts
}

/**
 * Configuration builder for size limits with environment scaling
 */
export function buildSizeLimitsConfig(
  baseLimits: Record<string, number>,
  environment?: string
): Record<string, number> {
  const env = environment || Environment.current
  
  // Scale limits based on environment
  const scaleFactor = env === ENVIRONMENTS.TEST ? 5.0 :     // More generous for testing
                     env === ENVIRONMENTS.PRODUCTION ? 1.0 : // Standard for production
                     2.0                                      // Moderate for development
  
  const scaledLimits: Record<string, number> = {}
  
  for (const [key, value] of Object.entries(baseLimits)) {
    scaledLimits[key] = Math.round(value * scaleFactor)
  }
  
  return scaledLimits
}
