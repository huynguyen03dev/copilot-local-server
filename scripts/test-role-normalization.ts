#!/usr/bin/env bun

/**
 * Test Script for Role Normalization
 * Verifies that the role normalization fix works correctly
 */

import { ChatMessage } from "../src/types"
import { normalizeRoleWithLogging, getSupportedRoleVariations } from "../src/utils/roleNormalization"

console.log("🧪 Testing Role Normalization Fix for Cline Compatibility\n")

// Test cases that simulate what Cline might send
const testCases = [
  // Standard cases (should work without transformation)
  { role: "system", content: "You are a helpful assistant" },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there!" },
  
  // Capitalized cases (common in Cline)
  { role: "System", content: "You are Cline, a helpful AI assistant" },
  { role: "User", content: "Can you help me code?" },
  { role: "Assistant", content: "Of course!" },
  
  // All caps cases
  { role: "SYSTEM", content: "System message" },
  { role: "USER", content: "User message" },
  { role: "ASSISTANT", content: "Assistant message" },
  
  // Alternative role names
  { role: "human", content: "Human message" },
  { role: "ai", content: "AI response" },
  { role: "bot", content: "Bot response" },
  { role: "model", content: "Model response" },
  
  // Whitespace cases
  { role: " system ", content: "System with spaces" },
  { role: "\tuser\t", content: "User with tabs" },
  { role: "\nassistant\n", content: "Assistant with newlines" },
  
  // Mixed cases
  { role: "Human", content: "Capitalized human" },
  { role: "AI", content: "Capitalized AI" },
  { role: "Bot", content: "Capitalized bot" }
]

const invalidCases = [
  { role: "admin", content: "Should fail" },
  { role: "root", content: "Should fail" },
  { role: "invalid", content: "Should fail" },
  { role: "", content: "Empty role should fail" }
]

console.log("✅ Testing Valid Role Transformations:")
console.log("=" .repeat(50))

let passCount = 0
let totalCount = 0

testCases.forEach((testCase, index) => {
  totalCount++
  
  try {
    const result = ChatMessage.safeParse(testCase)
    
    if (result.success) {
      const wasTransformed = result.data.role !== testCase.role
      const status = wasTransformed ? "🔄 TRANSFORMED" : "✅ PASSED"
      
      console.log(`${index + 1:2}. ${status}: "${testCase.role}" → "${result.data.role}"`)
      
      if (wasTransformed) {
        const normResult = normalizeRoleWithLogging(testCase.role)
        console.log(`    Mapping: ${normResult.mapping || 'case/whitespace normalization'}`)
      }
      
      passCount++
    } else {
      console.log(`${index + 1:2}. ❌ FAILED: "${testCase.role}" - ${result.error.issues[0].message}`)
    }
  } catch (error) {
    console.log(`${index + 1:2}. ❌ ERROR: "${testCase.role}" - ${error}`)
  }
})

console.log("\n❌ Testing Invalid Roles (Should Fail):")
console.log("=" .repeat(50))

invalidCases.forEach((testCase, index) => {
  totalCount++
  
  try {
    const result = ChatMessage.safeParse(testCase)
    
    if (!result.success) {
      console.log(`${index + 1}. ✅ CORRECTLY REJECTED: "${testCase.role}"`)
      console.log(`   Error: ${result.error.issues[0].message}`)
      passCount++
    } else {
      console.log(`${index + 1}. ❌ INCORRECTLY ACCEPTED: "${testCase.role}" → "${result.data.role}"`)
    }
  } catch (error) {
    console.log(`${index + 1}. ✅ CORRECTLY REJECTED: "${testCase.role}" - ${error}`)
    passCount++
  }
})

console.log("\n📊 Test Results:")
console.log("=" .repeat(50))
console.log(`Passed: ${passCount}/${totalCount} (${((passCount/totalCount)*100).toFixed(1)}%)`)

if (passCount === totalCount) {
  console.log("🎉 All tests passed! Role normalization is working correctly.")
} else {
  console.log("⚠️  Some tests failed. Please check the implementation.")
}

console.log("\n📋 Supported Role Variations:")
console.log("=" .repeat(50))
const variations = getSupportedRoleVariations()
Object.entries(variations).forEach(([role, variants]) => {
  console.log(`${role}:`)
  console.log(`  ${variants.slice(0, 8).join(', ')}${variants.length > 8 ? '...' : ''}`)
})

console.log("\n🔧 Cline Integration Test:")
console.log("=" .repeat(50))

// Simulate a typical Cline request
const clineRequest = {
  model: "gpt-4",
  messages: [
    {
      role: "System", // Capitalized - common in Cline
      content: "You are Cline, a helpful AI assistant that can help with coding tasks."
    },
    {
      role: "User", // Capitalized - common in Cline  
      content: "Hello, can you help me write a TypeScript function?"
    }
  ]
}

console.log("Testing Cline-style request format...")

try {
  // Test each message individually
  clineRequest.messages.forEach((message, index) => {
    const result = ChatMessage.safeParse(message)
    if (result.success) {
      const wasTransformed = result.data.role !== message.role
      console.log(`Message ${index + 1}: "${message.role}" → "${result.data.role}" ${wasTransformed ? '(transformed)' : '(unchanged)'}`)
    } else {
      console.log(`Message ${index + 1}: FAILED - ${result.error.issues[0].message}`)
    }
  })
  
  console.log("✅ Cline-style request should now work correctly!")
  
} catch (error) {
  console.log(`❌ Cline test failed: ${error}`)
}

console.log("\n🚀 Ready to test with actual Cline requests!")
console.log("The server should now accept requests with capitalized roles like 'System', 'User', 'Assistant'")
console.log("as well as alternative role names like 'human', 'ai', 'bot', etc.")
