import path from "path"
import fs from "fs/promises"
import { z } from "zod"
import type { 
  DeviceCodeResponse, 
  AccessTokenResponse, 
  CopilotTokenResponse, 
  OAuthInfo 
} from "./types"

export class GitHubCopilotAuth {
  private static readonly CLIENT_ID = "Iv1.b507a08c87ecfe98"
  private static readonly DEVICE_CODE_URL = "https://github.com/login/device/code"
  private static readonly ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
  private static readonly COPILOT_API_KEY_URL = "https://api.github.com/copilot_internal/v2/token"
  private static readonly AUTH_FILE = path.join(process.cwd(), ".auth.json")

  /**
   * Start the OAuth device flow
   */
  static async authorize(): Promise<{
    device: string
    user: string
    verification: string
    interval: number
    expiry: number
  }> {
    const deviceResponse = await fetch(this.DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "GitHubCopilotChat/0.26.7",
      },
      body: JSON.stringify({
        client_id: this.CLIENT_ID,
        scope: "read:user",
      }),
    })

    if (!deviceResponse.ok) {
      throw new Error(`Failed to get device code: ${deviceResponse.statusText}`)
    }

    const deviceData: DeviceCodeResponse = await deviceResponse.json()
    
    return {
      device: deviceData.device_code,
      user: deviceData.user_code,
      verification: deviceData.verification_uri,
      interval: deviceData.interval || 5,
      expiry: deviceData.expires_in,
    }
  }

  /**
   * Poll for access token with detailed error handling
   */
  static async poll(deviceCode: string): Promise<{
    status: "complete" | "pending" | "failed" | "expired" | "access_denied"
    error?: string
    errorDescription?: string
  }> {
    try {
      const response = await fetch(this.ACCESS_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "GitHubCopilotChat/0.26.7",
        },
        body: JSON.stringify({
          client_id: this.CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error")
        return {
          status: "failed",
          error: `HTTP ${response.status}: ${response.statusText}`,
          errorDescription: errorText
        }
      }

      const data: AccessTokenResponse = await response.json()

      if (data.access_token) {
        // Store the GitHub OAuth token
        await this.setAuth({
          type: "oauth",
          refresh: data.access_token,
          access: "",
          expires: 0,
        })
        return { status: "complete" }
      }

      // Handle specific OAuth errors
      if (data.error) {
        switch (data.error) {
          case "authorization_pending":
            return { status: "pending" }
          case "slow_down":
            return {
              status: "pending",
              error: "slow_down",
              errorDescription: "Polling too frequently. Will slow down automatically."
            }
          case "expired_token":
            return {
              status: "expired",
              error: data.error,
              errorDescription: data.error_description || "The device code has expired"
            }
          case "access_denied":
            return {
              status: "access_denied",
              error: data.error,
              errorDescription: data.error_description || "User denied access"
            }
          default:
            return {
              status: "failed",
              error: data.error,
              errorDescription: data.error_description || "Unknown OAuth error"
            }
        }
      }

      return { status: "pending" }
    } catch (error) {
      return {
        status: "failed",
        error: "Network error",
        errorDescription: error instanceof Error ? error.message : "Unknown network error"
      }
    }
  }

  /**
   * Get valid Copilot access token and endpoint
   */
  static async getAccessToken(): Promise<string | null> {
    const info = await this.getAuth()
    if (!info || info.type !== "oauth") return null
    if (info.access && info.expires > Date.now()) return info.access

    // Get new Copilot API token
    const response = await fetch(this.COPILOT_API_KEY_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${info.refresh}`,
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "Editor-Version": "vscode/1.99.3",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
      },
    })

    if (!response.ok) {
      console.error(`Failed to get Copilot token: ${response.status} ${response.statusText}`)
      return null
    }

    const tokenData: CopilotTokenResponse = await response.json()
    console.log("Copilot token response:", JSON.stringify(tokenData, null, 2))

    // Store the Copilot API token and endpoint
    await this.setAuth({
      type: "oauth",
      refresh: info.refresh,
      access: tokenData.token,
      expires: tokenData.expires_at * 1000,
      endpoint: tokenData.endpoints?.api, // Store the API endpoint
    })

    return tokenData.token
  }

  /**
   * Get the Copilot API endpoint from stored auth info
   */
  static async getCopilotEndpoint(): Promise<string> {
    const info = await this.getAuth()
    if (!info || info.type !== "oauth") {
      console.log("No auth info found, using fallback endpoint")
      return "https://api.githubcopilot.com" // fallback
    }

    // First try to use the stored endpoint from token response
    if (info.endpoint) {
      console.log(`Using stored Copilot endpoint: ${info.endpoint}`)
      return info.endpoint
    }

    // Fallback: Parse the token to extract the proxy endpoint
    if (info.access) {
      try {
        const tokenParts = info.access.split(';')
        console.log("Token parts:", tokenParts)

        for (const part of tokenParts) {
          if (part.startsWith('proxy-ep=')) {
            const endpoint = part.split('=')[1]
            const fullEndpoint = `https://${endpoint}`
            console.log(`Found Copilot endpoint from token: ${fullEndpoint}`)
            return fullEndpoint
          }
        }
      } catch (error) {
        console.warn("Failed to parse Copilot endpoint from token, using fallback:", error)
      }
    }

    console.log("No endpoint found, using fallback")
    return "https://api.githubcopilot.com" // fallback
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken()
    return token !== null
  }

  /**
   * Complete authentication flow with improved UX
   */
  static async authenticateWithFlow(): Promise<{
    success: boolean
    error?: string
    errorDescription?: string
  }> {
    try {
      console.log("🔐 Starting GitHub Copilot authentication...")

      // Step 1: Get device code
      const authData = await this.authorize()

      console.log("\n📋 Authentication Instructions:")
      console.log(`1. Visit: ${authData.verification}`)
      console.log(`2. Enter code: ${authData.user}`)
      console.log(`3. Authorize the application`)
      console.log(`4. Return here and wait for confirmation\n`)

      // Step 2: Poll with improved timing and UX
      const startTime = Date.now()
      const expiryTime = startTime + (authData.expiry * 1000)
      let attempts = 0
      let currentInterval = authData.interval

      console.log(`⏳ Waiting for authorization (expires in ${Math.floor(authData.expiry / 60)} minutes)...`)

      return new Promise((resolve) => {
        const poll = async () => {
          attempts++
          const now = Date.now()
          const remainingTime = Math.max(0, expiryTime - now)
          const remainingMinutes = Math.floor(remainingTime / 60000)
          const remainingSeconds = Math.floor((remainingTime % 60000) / 1000)

          // Check if expired
          if (remainingTime <= 0) {
            console.log("\n⏰ Authentication timed out")
            console.log("💡 Please run the authentication command again to get a new code")
            resolve({
              success: false,
              error: "expired",
              errorDescription: "Authentication session expired"
            })
            return
          }

          try {
            const result = await this.poll(authData.device)

            // Update progress display
            process.stdout.write(`\r⏳ Waiting... ${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')} remaining (attempt ${attempts})`)

            if (result.status === "complete") {
              console.log("\n✅ Authentication successful!")
              console.log("🎉 You can now start the server with: bun run start")
              resolve({ success: true })
              return
            } else if (result.status === "failed") {
              console.log(`\n❌ Authentication failed: ${result.error}`)
              if (result.errorDescription) {
                console.log(`   Details: ${result.errorDescription}`)
              }
              resolve({
                success: false,
                error: result.error,
                errorDescription: result.errorDescription
              })
              return
            } else if (result.status === "expired") {
              console.log(`\n⏰ Device code expired: ${result.errorDescription}`)
              console.log("💡 Please run the authentication command again")
              resolve({
                success: false,
                error: result.error,
                errorDescription: result.errorDescription
              })
              return
            } else if (result.status === "access_denied") {
              console.log(`\n🚫 Access denied: ${result.errorDescription}`)
              console.log("💡 Please run the authentication command again and approve the request")
              resolve({
                success: false,
                error: result.error,
                errorDescription: result.errorDescription
              })
              return
            } else if (result.status === "pending") {
              // Handle slow_down error by increasing interval
              if (result.error === "slow_down") {
                currentInterval = Math.min(currentInterval * 2, 30) // Cap at 30 seconds
                console.log(`\n⚠️  Slowing down polling to ${currentInterval} seconds`)
              }

              // Continue polling
              setTimeout(poll, currentInterval * 1000)
            }
          } catch (error) {
            console.log(`\n❌ Authentication error: ${error}`)
            resolve({
              success: false,
              error: "network_error",
              errorDescription: error instanceof Error ? error.message : "Unknown error"
            })
          }
        }

        // Start polling after initial interval
        setTimeout(poll, currentInterval * 1000)
      })
    } catch (error) {
      return {
        success: false,
        error: "initialization_error",
        errorDescription: error instanceof Error ? error.message : "Failed to start authentication"
      }
    }
  }

  /**
   * Clear stored authentication
   */
  static async clearAuth(): Promise<void> {
    try {
      await fs.unlink(this.AUTH_FILE)
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }

  private static async getAuth(): Promise<OAuthInfo | null> {
    try {
      const data = await fs.readFile(this.AUTH_FILE, "utf-8")
      const parsed = JSON.parse(data)
      return parsed["github-copilot"] || null
    } catch (error) {
      return null
    }
  }

  private static async setAuth(info: OAuthInfo): Promise<void> {
    let data: Record<string, any> = {}
    
    try {
      const existing = await fs.readFile(this.AUTH_FILE, "utf-8")
      data = JSON.parse(existing)
    } catch (error) {
      // File doesn't exist, start with empty object
    }

    data["github-copilot"] = info
    
    await fs.writeFile(this.AUTH_FILE, JSON.stringify(data, null, 2))
    await fs.chmod(this.AUTH_FILE, 0o600) // Secure file permissions
  }
}
