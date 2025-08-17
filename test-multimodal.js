#!/usr/bin/env bun

/**
 * Quick test to verify multi-modal content support
 * This tests the new array-based content format that Cline uses
 */

const BASE_URL = "http://localhost:8069"

// Test data - this is the format that Cline sends
const testRequests = [
  {
    name: "Legacy string content (backward compatibility)",
    request: {
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: "Hello, this is a simple string message"
        }
      ],
      max_tokens: 50
    }
  },
  {
    name: "New array content with text only",
    request: {
      model: "gpt-4", 
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Hello, this is an array-based text message"
            }
          ]
        }
      ],
      max_tokens: 50
    }
  },
  {
    name: "Array content with text and image (image should be dropped)",
    request: {
      model: "gpt-4",
      messages: [
        {
          role: "user", 
          content: [
            {
              type: "text",
              text: "What's in this image?"
            },
            {
              type: "image_url",
              image_url: {
                url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
              }
            }
          ]
        }
      ],
      max_tokens: 50
    }
  },
  {
    name: "Multiple text blocks in array",
    request: {
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant."
        },
        {
          role: "user",
          content: [
            {
              type: "text", 
              text: "First part of the message."
            },
            {
              type: "text",
              text: "Second part of the message."
            }
          ]
        }
      ],
      max_tokens: 50
    }
  }
]

async function testRequest(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`)
  console.log(`📝 Request:`, JSON.stringify(testCase.request, null, 2))
  
  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(testCase.request)
    })
    
    console.log(`📊 Status: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log(`✅ Success! Response:`, JSON.stringify(data, null, 2))
    } else {
      const errorData = await response.json()
      console.log(`❌ Error:`, JSON.stringify(errorData, null, 2))
    }
  } catch (error) {
    console.log(`💥 Network error:`, error.message)
  }
}

async function main() {
  console.log("🚀 Testing Multi-Modal Content Support")
  console.log(`📡 Server: ${BASE_URL}`)
  
  // Check if server is running
  try {
    const healthCheck = await fetch(`${BASE_URL}/`)
    if (!healthCheck.ok) {
      console.log("❌ Server is not running or not healthy")
      console.log("💡 Start the server with: bun run start")
      return
    }
    console.log("✅ Server is running")
  } catch (error) {
    console.log("❌ Cannot connect to server")
    console.log("💡 Start the server with: bun run start")
    return
  }
  
  // Run all test cases
  for (const testCase of testRequests) {
    await testRequest(testCase)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second between tests
  }
  
  console.log("\n🎉 Multi-modal content testing complete!")
  console.log("💡 Check the server logs to see content transformation messages")
}

main().catch(console.error)
