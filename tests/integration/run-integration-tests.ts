#!/usr/bin/env bun

/**
 * Enhanced Integration Test Runner
 * Comprehensive integration testing with detailed reporting and error analysis
 */

import { spawn } from "child_process"
import path from "path"
import fs from "fs/promises"

interface IntegrationTestResult {
  file: string
  category: string
  passed: number
  failed: number
  duration: number
  errors: string[]
  warnings: string[]
}

interface IntegrationTestSummary {
  totalTests: number
  totalPassed: number
  totalFailed: number
  totalDuration: number
  results: IntegrationTestResult[]
  success: boolean
  coverage: {
    endpoints: number
    errorScenarios: number
    streamingTests: number
    authTests: number
  }
}

async function runIntegrationTests(): Promise<IntegrationTestSummary> {
  console.log("🔗 Running Enhanced Integration Test Suite")
  console.log("=" .repeat(60))
  
  const testDir = path.join(process.cwd(), "tests", "integration")
  let testFiles: string[] = []
  
  try {
    const files = await fs.readdir(testDir)
    testFiles = files.filter(file => file.endsWith(".test.ts"))
  } catch (error) {
    // Fallback to original integration tests if new directory doesn't exist
    testFiles = ["../integration.test.ts", "../streaming-error.test.ts"]
  }
  
  const testFilePaths = testFiles.map(file => 
    file.startsWith("../") ? path.join(process.cwd(), "tests", file.slice(3)) : path.join(testDir, file)
  )
  
  console.log(`🧪 Found ${testFilePaths.length} integration test files:`)
  testFilePaths.forEach(file => {
    const category = path.basename(file, ".test.ts").replace("-", " ").toUpperCase()
    console.log(`   • ${category}`)
  })
  console.log()
  
  const results: IntegrationTestResult[] = []
  let totalPassed = 0
  let totalFailed = 0
  let totalDuration = 0
  
  for (const testFile of testFilePaths) {
    const fileName = path.basename(testFile)
    const category = fileName.replace(".test.ts", "").replace("-", " ").toUpperCase()
    
    console.log(`🔍 Running ${category} tests...`)
    
    const startTime = Date.now()
    const result = await runSingleIntegrationTest(testFile)
    const duration = Date.now() - startTime
    
    const testResult: IntegrationTestResult = {
      file: fileName,
      category,
      passed: result.passed,
      failed: result.failed,
      duration,
      errors: result.errors,
      warnings: result.warnings
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
        result.errors.slice(0, 3).forEach(error => { // Show first 3 errors
          console.log(`      • ${error}`)
        })
        if (result.errors.length > 3) {
          console.log(`      • ... and ${result.errors.length - 3} more errors`)
        }
      }
    }
    console.log()
  }
  
  const coverage = calculateCoverage(results)
  
  const summary: IntegrationTestSummary = {
    totalTests: totalPassed + totalFailed,
    totalPassed,
    totalFailed,
    totalDuration,
    results,
    success: totalFailed === 0,
    coverage
  }
  
  printIntegrationSummary(summary)
  return summary
}

async function runSingleIntegrationTest(testFile: string): Promise<{
  passed: number
  failed: number
  errors: string[]
  warnings: string[]
}> {
  return new Promise((resolve) => {
    const bunProcess = spawn("bun", ["test", testFile, "--verbose"], {
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
      const result = parseIntegrationTestOutput(stdout, stderr)
      resolve(result)
    })
    
    bunProcess.on("error", (error) => {
      resolve({
        passed: 0,
        failed: 1,
        errors: [`Process error: ${error.message}`],
        warnings: []
      })
    })
  })
}

function parseIntegrationTestOutput(stdout: string, stderr: string): {
  passed: number
  failed: number
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  let passed = 0
  let failed = 0
  
  // Parse Bun test output - look for summary
  const summaryMatch = stdout.match(/(\d+) pass/)
  if (summaryMatch) {
    passed = parseInt(summaryMatch[1])
  }
  
  const failMatch = stdout.match(/(\d+) fail/)
  if (failMatch) {
    failed = parseInt(failMatch[1])
  }
  
  // Parse lines for actual failures
  const lines = stdout.split('\n')
  let inFailureSection = false
  
  for (const line of lines) {
    // Detect actual test failures
    if (line.includes('✗')) {
      errors.push(`FAILED: ${line.trim()}`)
      inFailureSection = true
    } else if (line.includes('error:') && inFailureSection) {
      errors.push(`ERROR: ${line.trim()}`)
    } else if (line.includes('Expected:') && inFailureSection) {
      errors.push(`EXPECTED: ${line.trim()}`)
    } else if (line.includes('Received:') && inFailureSection) {
      errors.push(`RECEIVED: ${line.trim()}`)
    } else if (line.includes('at <anonymous>') && inFailureSection) {
      inFailureSection = false
    }
    
    // Look for warnings
    if (line.includes('warn') || line.includes('Warning')) {
      warnings.push(line.trim())
    }
  }
  
  // Add stderr errors if they contain actual errors
  if (stderr.trim() && !stderr.includes('bun test')) {
    const stderrLines = stderr.split('\n').filter(line => 
      line.trim() && 
      !line.includes('bun test') &&
      line.includes('error')
    )
    errors.push(...stderrLines)
  }
  
  return { passed, failed, errors, warnings }
}

function calculateCoverage(results: IntegrationTestResult[]): {
  endpoints: number
  errorScenarios: number
  streamingTests: number
  authTests: number
} {
  let endpoints = 0
  let errorScenarios = 0
  let streamingTests = 0
  let authTests = 0
  
  results.forEach(result => {
    const category = result.category.toLowerCase()
    
    if (category.includes('integration') || category.includes('enhanced')) {
      endpoints += result.passed
    }
    
    if (category.includes('error') || category.includes('scenarios')) {
      errorScenarios += result.passed
    }
    
    if (category.includes('streaming')) {
      streamingTests += result.passed
    }
    
    if (category.includes('auth') || category.includes('security')) {
      authTests += result.passed
    }
  })
  
  return { endpoints, errorScenarios, streamingTests, authTests }
}

function printIntegrationSummary(summary: IntegrationTestSummary): void {
  console.log("🔗 Integration Test Summary")
  console.log("=" .repeat(60))
  
  if (summary.success) {
    console.log(`🎉 All integration tests passed!`)
  } else {
    console.log(`❌ Some integration tests failed`)
  }
  
  console.log(`📊 Total Tests: ${summary.totalTests}`)
  console.log(`✅ Passed: ${summary.totalPassed}`)
  console.log(`❌ Failed: ${summary.totalFailed}`)
  console.log(`⏱️  Total Duration: ${summary.totalDuration}ms`)
  console.log(`📈 Success Rate: ${((summary.totalPassed / summary.totalTests) * 100).toFixed(1)}%`)
  
  console.log("\n📋 Test Coverage:")
  console.log(`   🔗 API Endpoints: ${summary.coverage.endpoints} tests`)
  console.log(`   🚨 Error Scenarios: ${summary.coverage.errorScenarios} tests`)
  console.log(`   📡 Streaming Tests: ${summary.coverage.streamingTests} tests`)
  console.log(`   🔐 Auth Tests: ${summary.coverage.authTests} tests`)
  
  console.log("\n📋 Test Categories:")
  summary.results.forEach(result => {
    const status = result.failed === 0 ? "✅" : "❌"
    const rate = result.passed + result.failed > 0 
      ? `${((result.passed / (result.passed + result.failed)) * 100).toFixed(1)}%`
      : "0%"
    
    console.log(`   ${status} ${result.category}: ${result.passed}/${result.passed + result.failed} (${rate}) - ${result.duration}ms`)
  })
  
  if (summary.totalFailed > 0) {
    console.log("\n🔍 Failed Tests Details:")
    summary.results.forEach(result => {
      if (result.failed > 0 && result.errors.length > 0) {
        console.log(`\n   📁 ${result.category}:`)
        result.errors.slice(0, 5).forEach(error => { // Show first 5 errors
          console.log(`      • ${error}`)
        })
        if (result.errors.length > 5) {
          console.log(`      • ... and ${result.errors.length - 5} more errors`)
        }
      }
    })
  }
  
  console.log("\n" + "=" .repeat(60))
  
  if (summary.success) {
    console.log("🚀 Integration tests completed successfully!")
    console.log("✨ All API endpoints and error scenarios working correctly")
  } else {
    console.log("⚠️  Integration tests completed with failures")
    console.log("🔧 Please review and fix the failing tests")
  }
  
  // Integration test recommendations
  console.log("\n🔗 Integration Test Recommendations:")
  if (summary.coverage.endpoints < 10) {
    console.log("   • Add more API endpoint coverage tests")
  }
  if (summary.coverage.errorScenarios < 15) {
    console.log("   • Add more error scenario tests")
  }
  if (summary.coverage.streamingTests < 10) {
    console.log("   • Add more streaming functionality tests")
  }
  console.log("   • Run integration tests before each deployment")
  console.log("   • Monitor test performance and add timeout handling")
  console.log("   • Test with realistic data volumes and concurrent users")
}

// Run tests if this file is executed directly
if (import.meta.main) {
  runIntegrationTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1)
    })
    .catch(error => {
      console.error("💥 Integration test runner error:", error)
      process.exit(1)
    })
}

export { runIntegrationTests, type IntegrationTestSummary, type IntegrationTestResult }
