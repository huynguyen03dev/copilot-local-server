#!/usr/bin/env bun

/**
 * Example client to test the GitHub Copilot API Server
 * 
 * Usage:
 *   bun run examples/test-client.ts
 *   bun run examples/test-client.ts --port=8080
 *   bun run examples/test-client.ts --message="Explain TypeScript"
 */

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
}

interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: ChatMessage
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Helper function to get user input
function askUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim())
    })
  })
}

class CopilotAPIClient {
  private baseUrl: string

  constructor(baseUrl: string = "http://localhost:8069") {
    this.baseUrl = baseUrl
  }

  async checkStatus(): Promise<{ status: string; message: string; version: string }> {
    const response = await fetch(`${this.baseUrl}/`)
    if (!response.ok) {
      throw new Error(`Server not responding: ${response.status}`)
    }
    return response.json()
  }

  async checkAuth(): Promise<{ authenticated: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/status`)
    if (!response.ok) {
      throw new Error(`Auth check failed: ${response.status}`)
    }
    return response.json()
  }

  async startAuth(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/auth/start`, {
      method: "POST"
    })
    if (!response.ok) {
      throw new Error(`Failed to start auth: ${response.status}`)
    }
    return response.json()
  }

  async pollAuth(deviceCode: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/auth/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device_code: deviceCode }),
    })
    if (!response.ok) {
      throw new Error(`Auth polling failed: ${response.status}`)
    }
    return response.json()
  }

  async listModels(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/models`)
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`)
    }
    return response.json()
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Chat completion failed: ${response.status} - ${errorText}`)
    }

    return response.json()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const portArg = args.find(arg => arg.startsWith("--port="))
  const messageArg = args.find(arg => arg.startsWith("--message="))
  
  const port = portArg ? portArg.split("=")[1] : "8069"
  const customMessage = messageArg ? messageArg.split("=")[1] : null
  
  const client = new CopilotAPIClient(`http://localhost:${port}`)

  console.log("🧪 Testing GitHub Copilot API Server")
  console.log(`📡 Server: http://localhost:${port}`)
  console.log()

  try {
    // 1. Check server status
    console.log("1️⃣ Checking server status...")
    const status = await client.checkStatus()
    console.log(`   ✅ ${status.message} (v${status.version})`)
    console.log()

    // 2. Check authentication
    console.log("2️⃣ Checking authentication...")
    const auth = await client.checkAuth()
    if (auth.authenticated) {
      console.log("   ✅ Authenticated with GitHub Copilot")
    } else {
      console.log("   ❌ Not authenticated")
      console.log("   💡 You can authenticate interactively or run: bun run auth")

      // Ask if user wants to authenticate now
      const shouldAuth = await askUser("Would you like to authenticate now? (y/N): ")
      if (shouldAuth.toLowerCase() === 'y' || shouldAuth.toLowerCase() === 'yes') {
        console.log("\n🔐 Starting authentication flow...")

        try {
          const authData = await client.startAuth()
          console.log(`\n📋 Please visit: ${authData.verification_uri}`)
          console.log(`🔑 Enter code: ${authData.user_code}`)
          console.log(`⏰ Code expires in ${Math.floor(authData.expires_in / 60)} minutes\n`)

          // Poll for completion
          let attempts = 0
          const maxAttempts = Math.floor(authData.expires_in / authData.interval)

          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, authData.interval * 1000))
            attempts++

            const pollResult = await client.pollAuth(authData.device_code)
            process.stdout.write(`\r⏳ Waiting for authorization... (${attempts}/${maxAttempts})`)

            if (pollResult.status === "complete") {
              console.log("\n✅ Authentication successful!")
              break
            } else if (pollResult.status === "failed" || pollResult.status === "expired" || pollResult.status === "access_denied") {
              console.log(`\n❌ Authentication ${pollResult.status}: ${pollResult.error_description || pollResult.error}`)
              return
            }
          }

          if (attempts >= maxAttempts) {
            console.log("\n⏰ Authentication timed out")
            return
          }
        } catch (error) {
          console.log(`\n❌ Authentication failed: ${error}`)
          return
        }
      } else {
        return
      }
    }
    console.log()

    // 3. List models
    console.log("3️⃣ Listing available models...")
    const models = await client.listModels()
    console.log(`   📋 Found ${models.data.length} models:`)
    models.data.forEach((model: any) => {
      console.log(`      - ${model.id}`)
    })
    console.log()

    // 4. Test chat completion
    console.log("4️⃣ Testing chat completion...")
    const testMessage = customMessage || "Hello! Can you help me understand what GitHub Copilot is?"
    
    const request: ChatCompletionRequest = {
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant. Be concise and friendly."
        },
        {
          role: "user",
          content: testMessage
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    }

    console.log(`   💬 Sending message: "${testMessage}"`)
    console.log("   ⏳ Waiting for response...")
    
    const startTime = Date.now()
    const response = await client.chatCompletion(request)
    const duration = Date.now() - startTime
    
    console.log(`   ✅ Response received in ${duration}ms`)
    console.log()
    console.log("📝 Response:")
    console.log("─".repeat(50))
    console.log(response.choices[0].message.content)
    console.log("─".repeat(50))
    
    if (response.usage) {
      console.log()
      console.log("📊 Usage Statistics:")
      console.log(`   Input tokens:  ${response.usage.prompt_tokens}`)
      console.log(`   Output tokens: ${response.usage.completion_tokens}`)
      console.log(`   Total tokens:  ${response.usage.total_tokens}`)
    }

    console.log()
    console.log("🎉 All tests passed!")

  } catch (error) {
    console.error("❌ Test failed:", error)
    console.log()
    console.log("🔧 Troubleshooting:")
    console.log("   1. Make sure the server is running: bun run src/index.ts")
    console.log("   2. Check authentication: bun run src/index.ts --auth")
    console.log("   3. Verify your GitHub Copilot subscription is active")
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Test interrupted")
  process.exit(0)
})

main().catch((error) => {
  console.error("💥 Fatal error:", error)
  process.exit(1)
})
