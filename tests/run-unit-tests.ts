#!/usr/bin/env bun

/**
 * Unit Test Runner
 * Comprehensive test runner for all unit tests with reporting
 */

import { spawn } from "child_process"
import path from "path"
import fs from "fs/promises"

interface TestResult {
  file: string
  passed: number
  failed: number
  duration: number
  errors: string[]
}

interface TestSummary {
  totalTests: number
  totalPassed: number
  totalFailed: number
  totalDuration: number
  results: TestResult[]
  success: boolean
}

async function runUnitTests(): Promise<TestSummary> {
  console.log("🧪 Running Unit Test Suite")
  console.log("=" .repeat(50))
  
  const testDir = path.join(process.cwd(), "tests", "unit")
  const testFiles = await fs.readdir(testDir)
  const testFilePaths = testFiles
    .filter(file => file.endsWith(".test.ts"))
    .map(file => path.join(testDir, file))
  
  console.log(`📁 Found ${testFilePaths.length} test files:`)
  testFilePaths.forEach(file => {
    console.log(`   • ${path.basename(file)}`)
  })
  console.log()
  
  const results: TestResult[] = []
  let totalPassed = 0
  let totalFailed = 0
  let totalDuration = 0
  
  for (const testFile of testFilePaths) {
    const fileName = path.basename(testFile)
    console.log(`🔍 Running ${fileName}...`)
    
    const startTime = Date.now()
    const result = await runSingleTest(testFile)
    const duration = Date.now() - startTime
    
    const testResult: TestResult = {
      file: fileName,
      passed: result.passed,
      failed: result.failed,
      duration,
      errors: result.errors
    }
    
    results.push(testResult)
    totalPassed += result.passed
    totalFailed += result.failed
    totalDuration += duration
    
    if (result.failed === 0) {
      console.log(`   ✅ ${result.passed} tests passed (${duration}ms)`)
    } else {
      console.log(`   ❌ ${result.failed} tests failed, ${result.passed} passed (${duration}ms)`)
      if (result.errors.length > 0) {
        result.errors.forEach(error => {
          console.log(`      • ${error}`)
        })
      }
    }
    console.log()
  }
  
  const summary: TestSummary = {
    totalTests: totalPassed + totalFailed,
    totalPassed,
    totalFailed,
    totalDuration,
    results,
    success: totalFailed === 0
  }
  
  printSummary(summary)
  return summary
}

async function runSingleTest(testFile: string): Promise<{
  passed: number
  failed: number
  errors: string[]
}> {
  return new Promise((resolve) => {
    const bunProcess = spawn("bun", ["test", testFile], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        LOG_LEVEL: "silent"
      }
    })
    
    let stdout = ""
    let stderr = ""
    
    bunProcess.stdout?.on("data", (data) => {
      stdout += data.toString()
    })
    
    bunProcess.stderr?.on("data", (data) => {
      stderr += data.toString()
    })
    
    bunProcess.on("close", (code) => {
      const result = parseTestOutput(stdout, stderr)
      resolve(result)
    })
    
    bunProcess.on("error", (error) => {
      resolve({
        passed: 0,
        failed: 1,
        errors: [`Process error: ${error.message}`]
      })
    })
  })
}

function parseTestOutput(stdout: string, stderr: string): {
  passed: number
  failed: number
  errors: string[]
} {
  const errors: string[] = []
  let passed = 0
  let failed = 0
  
  // Parse Bun test output
  const lines = stdout.split('\n')
  
  for (const line of lines) {
    // Look for test result patterns
    if (line.includes('✓') || line.includes('PASS')) {
      passed++
    } else if (line.includes('✗') || line.includes('FAIL')) {
      failed++
      errors.push(line.trim())
    }
  }
  
  // If no specific test results found, try to parse summary
  if (passed === 0 && failed === 0) {
    const summaryMatch = stdout.match(/(\d+) pass/)
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1])
    }
    
    const failMatch = stdout.match(/(\d+) fail/)
    if (failMatch) {
      failed = parseInt(failMatch[1])
    }
  }
  
  // Add stderr errors
  if (stderr.trim()) {
    errors.push(...stderr.split('\n').filter(line => line.trim()))
  }
  
  return { passed, failed, errors }
}

function printSummary(summary: TestSummary): void {
  console.log("📊 Test Summary")
  console.log("=" .repeat(50))
  
  if (summary.success) {
    console.log(`🎉 All tests passed!`)
  } else {
    console.log(`❌ Some tests failed`)
  }
  
  console.log(`📈 Total Tests: ${summary.totalTests}`)
  console.log(`✅ Passed: ${summary.totalPassed}`)
  console.log(`❌ Failed: ${summary.totalFailed}`)
  console.log(`⏱️  Total Duration: ${summary.totalDuration}ms`)
  console.log(`📊 Success Rate: ${((summary.totalPassed / summary.totalTests) * 100).toFixed(1)}%`)
  
  console.log("\n📋 Test File Results:")
  summary.results.forEach(result => {
    const status = result.failed === 0 ? "✅" : "❌"
    const rate = result.passed + result.failed > 0 
      ? `${((result.passed / (result.passed + result.failed)) * 100).toFixed(1)}%`
      : "0%"
    
    console.log(`   ${status} ${result.file}: ${result.passed}/${result.passed + result.failed} (${rate}) - ${result.duration}ms`)
  })
  
  if (summary.totalFailed > 0) {
    console.log("\n🔍 Failed Tests Details:")
    summary.results.forEach(result => {
      if (result.failed > 0 && result.errors.length > 0) {
        console.log(`\n   📁 ${result.file}:`)
        result.errors.forEach(error => {
          console.log(`      • ${error}`)
        })
      }
    })
  }
  
  console.log("\n" + "=" .repeat(50))
  
  if (summary.success) {
    console.log("🚀 Unit tests completed successfully!")
    console.log("✨ All core functionality is working correctly")
  } else {
    console.log("⚠️  Unit tests completed with failures")
    console.log("🔧 Please review and fix the failing tests")
  }
}

// Run tests if this file is executed directly
if (import.meta.main) {
  runUnitTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1)
    })
    .catch(error => {
      console.error("💥 Test runner error:", error)
      process.exit(1)
    })
}

export { runUnitTests, type TestSummary, type TestResult }
