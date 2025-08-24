/**
 * Authentication Service
 * Handles GitHub Copilot authentication operations and token management
 */

import { logger } from '../utils/logger'
import { createAPIErrorResponse } from '../types/errors'
import { GitHubCopilotAuth } from '../auth'
import { 
  ERROR_CODES,
  HTTP_STATUS,
  TIMEOUT_CONSTANTS 
} from '../constants'
import { createContextualLogger } from '../utils/contextualLogger'

export interface AuthResult {
  success: boolean
  error?: string
  errorDescription?: string
  data?: any
}

export interface AuthFlowData {
  device: string
  user: string
  verification: string
  interval: number
  expiry: number
}

export interface AuthStatus {
  authenticated: boolean
  hasToken: boolean
  tokenExpiry?: number
}

/**
 * Service for handling authentication operations
 */
export class AuthService {
  private contextLogger = createContextualLogger(logger, { service: 'AuthService' })

  /**
   * Check authentication status
   */
  async getAuthStatus(): Promise<AuthStatus> {
    try {
      const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
      const token = await GitHubCopilotAuth.getAccessToken()
      
      this.contextLogger.debug('AUTH_STATUS', 'Authentication status checked', {
        authenticated: isAuthenticated,
        hasToken: !!token
      })

      return {
        authenticated: isAuthenticated,
        hasToken: !!token,
        // Add token expiry if available
      }
    } catch (error) {
      this.contextLogger.error('AUTH_STATUS', 'Failed to check authentication status', error as Error)
      
      return {
        authenticated: false,
        hasToken: false
      }
    }
  }

  /**
   * Start authentication flow
   */
  async startAuthFlow(): Promise<AuthResult> {
    try {
      this.contextLogger.info('AUTH_FLOW', 'Starting authentication flow')
      
      const authData = await GitHubCopilotAuth.authorize()
      
      this.contextLogger.info('AUTH_FLOW', 'Authentication flow started successfully', {
        userCode: authData.user,
        verificationUri: authData.verification,
        expiresIn: authData.expiry
      })

      return {
        success: true,
        data: {
          device_code: authData.device,
          user_code: authData.user,
          verification_uri: authData.verification,
          interval: authData.interval,
          expires_in: authData.expiry,
          message: `Please visit ${authData.verification} and enter code: ${authData.user}`
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Authentication failed"
      
      this.contextLogger.error('AUTH_FLOW', 'Failed to start authentication flow', error as Error)

      return {
        success: false,
        error: ERROR_CODES.AUTHENTICATION_FAILED,
        errorDescription: errorMessage
      }
    }
  }

  /**
   * Poll for authentication completion
   */
  async pollAuthCompletion(deviceCode: string): Promise<AuthResult> {
    if (!deviceCode) {
      this.contextLogger.warn('AUTH_POLL', 'Missing device code in poll request')
      
      return {
        success: false,
        error: ERROR_CODES.VALIDATION_ERROR,
        errorDescription: "device_code is required"
      }
    }

    try {
      this.contextLogger.debug('AUTH_POLL', 'Polling for authentication completion', {
        deviceCode: deviceCode.substring(0, 8) + '...' // Log partial code for security
      })

      const result = await GitHubCopilotAuth.poll(deviceCode)
      
      this.contextLogger.debug('AUTH_POLL', 'Poll result received', {
        status: result.status,
        hasError: !!result.error
      })

      return {
        success: true,
        data: {
          status: result.status,
          error: result.error,
          error_description: result.errorDescription
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Polling failed"
      
      this.contextLogger.error('AUTH_POLL', 'Authentication polling failed', error as Error, {
        deviceCode: deviceCode.substring(0, 8) + '...'
      })

      return {
        success: false,
        error: "POLLING_FAILED",
        errorDescription: errorMessage
      }
    }
  }

  /**
   * Clear authentication
   */
  async clearAuth(): Promise<AuthResult> {
    try {
      this.contextLogger.info('AUTH_CLEAR', 'Clearing authentication')
      
      await GitHubCopilotAuth.clearAuth()
      
      this.contextLogger.info('AUTH_CLEAR', 'Authentication cleared successfully')

      return {
        success: true,
        data: { message: "Authentication cleared" }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to clear authentication"
      
      this.contextLogger.error('AUTH_CLEAR', 'Failed to clear authentication', error as Error)

      return {
        success: false,
        error: "CLEAR_AUTH_FAILED",
        errorDescription: errorMessage
      }
    }
  }

  /**
   * Complete authentication flow (alternative to manual polling)
   */
  async completeAuthFlow(): Promise<AuthResult> {
    try {
      this.contextLogger.info('AUTH_COMPLETE', 'Starting complete authentication flow')
      
      const result = await GitHubCopilotAuth.authenticateWithFlow()

      if (result.success) {
        this.contextLogger.info('AUTH_COMPLETE', 'Authentication flow completed successfully')
        
        return {
          success: true,
          data: {
            success: true,
            message: "Authentication completed successfully"
          }
        }
      } else {
        this.contextLogger.warn('AUTH_COMPLETE', 'Authentication flow failed', {
          error: result.error,
          errorDescription: result.errorDescription
        })

        return {
          success: false,
          error: result.error || "AUTHENTICATION_FLOW_FAILED",
          errorDescription: result.errorDescription || "Authentication failed"
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Authentication flow failed"
      
      this.contextLogger.error('AUTH_COMPLETE', 'Authentication flow error', error as Error)

      return {
        success: false,
        error: "AUTHENTICATION_FLOW_FAILED",
        errorDescription: errorMessage
      }
    }
  }

  /**
   * Get access token for API requests
   */
  async getAccessToken(): Promise<string | null> {
    try {
      const token = await GitHubCopilotAuth.getAccessToken()
      
      if (token) {
        this.contextLogger.debug('AUTH_TOKEN', 'Access token retrieved successfully')
      } else {
        this.contextLogger.warn('AUTH_TOKEN', 'No access token available')
      }

      return token
    } catch (error) {
      this.contextLogger.error('AUTH_TOKEN', 'Failed to get access token', error as Error)
      return null
    }
  }

  /**
   * Validate authentication for API requests
   */
  async validateAuthentication(): Promise<{ valid: boolean; token?: string; error?: any }> {
    try {
      const token = await this.getAccessToken()
      
      if (!token) {
        const errorResponse = createAPIErrorResponse(
          "Not authenticated with GitHub Copilot. Please authenticate first.",
          "authentication_error",
          ERROR_CODES.UNAUTHENTICATED
        )

        this.contextLogger.warn('AUTH_VALIDATE', 'Authentication validation failed - no token')

        return {
          valid: false,
          error: errorResponse
        }
      }

      this.contextLogger.debug('AUTH_VALIDATE', 'Authentication validation successful')

      return {
        valid: true,
        token
      }
    } catch (error) {
      const errorResponse = createAPIErrorResponse(
        "Authentication validation failed",
        "authentication_error",
        ERROR_CODES.AUTH_FAILED
      )

      this.contextLogger.error('AUTH_VALIDATE', 'Authentication validation error', error as Error)

      return {
        valid: false,
        error: errorResponse
      }
    }
  }

  /**
   * Get Copilot endpoint for API requests
   */
  async getCopilotEndpoint(): Promise<string> {
    try {
      const endpoint = await GitHubCopilotAuth.getCopilotEndpoint()
      
      this.contextLogger.debug('AUTH_ENDPOINT', 'Copilot endpoint retrieved', {
        endpoint: endpoint.replace(/\/+$/, '') // Log without trailing slashes for security
      })

      return endpoint
    } catch (error) {
      this.contextLogger.error('AUTH_ENDPOINT', 'Failed to get Copilot endpoint', error as Error)
      throw error
    }
  }

  /**
   * Refresh authentication if needed
   */
  async refreshAuthIfNeeded(): Promise<boolean> {
    try {
      // Check if current authentication is still valid
      const isAuthenticated = await GitHubCopilotAuth.isAuthenticated()
      
      if (isAuthenticated) {
        this.contextLogger.debug('AUTH_REFRESH', 'Authentication still valid, no refresh needed')
        return true
      }

      this.contextLogger.info('AUTH_REFRESH', 'Authentication expired, attempting refresh')
      
      // Attempt to refresh (implementation depends on GitHubCopilotAuth capabilities)
      // For now, just return false to indicate re-authentication is needed
      return false
      
    } catch (error) {
      this.contextLogger.error('AUTH_REFRESH', 'Failed to refresh authentication', error as Error)
      return false
    }
  }

  /**
   * Create error response for authentication failures
   */
  createAuthErrorResponse(error: string, description?: string, statusCode: number = HTTP_STATUS.UNAUTHORIZED): any {
    return createAPIErrorResponse(
      description || "Authentication failed",
      "authentication_error",
      error
    )
  }
}
