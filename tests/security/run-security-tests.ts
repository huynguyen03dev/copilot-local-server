#!/usr/bin/env bun

/**
 * Security Test Runner
 * Comprehensive security testing suite with detailed reporting
 */

import { spawn } from "child_process"
import path from "path"
import fs from "fs/promises"

interface SecurityTestResult {
  file: string
  category: string
  passed: number
  failed: number
  duration: number
  vulnerabilities: string[]
  warnings: string[]
}

interface SecurityTestSummary {
  totalTests: number
  totalPassed: number
  totalFailed: number
  totalDuration: number
  vulnerabilitiesFound: number
  warningsFound: number
  results: SecurityTestResult[]
  success: boolean
  securityScore: number
}

async function runSecurityTests(): Promise<SecurityTestSummary> {
  console.log("🔒 Running Security Test Suite")
  console.log("=" .repeat(60))
  
  const testDir = path.join(process.cwd(), "tests", "security")
  const testFiles = await fs.readdir(testDir)
  const testFilePaths = testFiles
    .filter(file => file.endsWith(".test.ts"))
    .map(file => path.join(testDir, file))
  
  console.log(`🛡️  Found ${testFilePaths.length} security test files:`)
  testFilePaths.forEach(file => {
    const category = path.basename(file, ".test.ts").replace("-", " ").toUpperCase()
    console.log(`   • ${category}`)
  })
  console.log()
  
  const results: SecurityTestResult[] = []
  let totalPassed = 0
  let totalFailed = 0
  let totalDuration = 0
  let vulnerabilitiesFound = 0
  let warningsFound = 0
  
  for (const testFile of testFilePaths) {
    const fileName = path.basename(testFile)
    const category = fileName.replace(".test.ts", "").replace("-", " ").toUpperCase()
    
    console.log(`🔍 Running ${category} tests...`)
    
    const startTime = Date.now()
    const result = await runSingleSecurityTest(testFile)
    const duration = Date.now() - startTime
    
    const testResult: SecurityTestResult = {
      file: fileName,
      category,
      passed: result.passed,
      failed: result.failed,
      duration,
      vulnerabilities: result.vulnerabilities,
      warnings: result.warnings
    }
    
    results.push(testResult)
    totalPassed += result.passed
    totalFailed += result.failed
    totalDuration += duration
    vulnerabilitiesFound += result.vulnerabilities.length
    warningsFound += result.warnings.length
    
    if (result.failed === 0 && result.vulnerabilities.length === 0) {
      console.log(`   ✅ ${result.passed} tests passed, no vulnerabilities found (${duration}ms)`)
    } else {
      console.log(`   ⚠️  ${result.failed} tests failed, ${result.vulnerabilities.length} vulnerabilities found (${duration}ms)`)
      if (result.vulnerabilities.length > 0) {
        result.vulnerabilities.forEach(vuln => {
          console.log(`      🚨 VULNERABILITY: ${vuln}`)
        })
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach(warning => {
          console.log(`      ⚠️  WARNING: ${warning}`)
        })
      }
    }
    console.log()
  }
  
  const securityScore = calculateSecurityScore(totalPassed, totalFailed, vulnerabilitiesFound, warningsFound)
  
  const summary: SecurityTestSummary = {
    totalTests: totalPassed + totalFailed,
    totalPassed,
    totalFailed,
    totalDuration,
    vulnerabilitiesFound,
    warningsFound,
    results,
    success: totalFailed === 0 && vulnerabilitiesFound === 0,
    securityScore
  }
  
  printSecuritySummary(summary)
  return summary
}

async function runSingleSecurityTest(testFile: string): Promise<{
  passed: number
  failed: number
  vulnerabilities: string[]
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
      const result = parseSecurityTestOutput(stdout, stderr)
      resolve(result)
    })
    
    bunProcess.on("error", (error) => {
      resolve({
        passed: 0,
        failed: 1,
        vulnerabilities: [`Process error: ${error.message}`],
        warnings: []
      })
    })
  })
}

function parseSecurityTestOutput(stdout: string, stderr: string): {
  passed: number
  failed: number
  vulnerabilities: string[]
  warnings: string[]
} {
  const vulnerabilities: string[] = []
  const warnings: string[] = []
  let passed = 0
  let failed = 0

  // Parse Bun test output - look for summary first
  const summaryMatch = stdout.match(/(\d+) pass/)
  if (summaryMatch) {
    passed = parseInt(summaryMatch[1])
  }

  const failMatch = stdout.match(/(\d+) fail/)
  if (failMatch) {
    failed = parseInt(failMatch[1])
  }

  // Parse lines for actual failures only
  const lines = stdout.split('\n')
  let inFailureSection = false

  for (const line of lines) {
    // Detect actual test failures (✗ symbol indicates failure)
    if (line.includes('✗')) {
      vulnerabilities.push(`FAILED TEST: ${line.trim()}`)
      inFailureSection = true
    } else if (line.includes('error:') && inFailureSection) {
      vulnerabilities.push(`ERROR: ${line.trim()}`)
    } else if (line.includes('Expected:') && inFailureSection) {
      vulnerabilities.push(`ASSERTION: ${line.trim()}`)
    } else if (line.includes('Received:') && inFailureSection) {
      vulnerabilities.push(`ACTUAL: ${line.trim()}`)
    } else if (line.includes('at <anonymous>') && inFailureSection) {
      // End of failure section
      inFailureSection = false
    }

    // Look for actual security warnings from console.warn (but not test descriptions)
    if (!line.includes('✓') && !line.includes('✗') && !line.includes('pass') && !line.includes('fail')) {
      if (line.includes('Suspicious') ||
          line.includes('Dangerous') ||
          line.includes('Wildcard CORS') ||
          line.includes('Memory usage high') ||
          line.includes('IPv6 with invalid') ||
          line.includes('IP with invalid') ||
          line.includes('Binary content detected')) {
        warnings.push(line.trim())
      }
    }
  }

  // Only add stderr if it contains actual errors
  if (stderr.trim() && !stderr.includes('bun test')) {
    const stderrLines = stderr.split('\n').filter(line =>
      line.trim() &&
      !line.includes('bun test') &&
      line.includes('error')
    )
    vulnerabilities.push(...stderrLines)
  }

  return { passed, failed, vulnerabilities, warnings }
}

function calculateSecurityScore(passed: number, failed: number, vulnerabilities: number, warnings: number): number {
  const totalTests = passed + failed
  if (totalTests === 0) return 0
  
  const baseScore = (passed / totalTests) * 100
  const vulnerabilityPenalty = vulnerabilities * 10
  const warningPenalty = warnings * 2
  
  const finalScore = Math.max(0, baseScore - vulnerabilityPenalty - warningPenalty)
  return Math.round(finalScore * 10) / 10
}

function printSecuritySummary(summary: SecurityTestSummary): void {
  console.log("🔒 Security Test Summary")
  console.log("=" .repeat(60))
  
  if (summary.success) {
    console.log(`🎉 All security tests passed!`)
  } else {
    console.log(`⚠️  Security issues detected`)
  }
  
  console.log(`📊 Total Tests: ${summary.totalTests}`)
  console.log(`✅ Passed: ${summary.totalPassed}`)
  console.log(`❌ Failed: ${summary.totalFailed}`)
  console.log(`🚨 Vulnerabilities: ${summary.vulnerabilitiesFound}`)
  console.log(`⚠️  Warnings: ${summary.warningsFound}`)
  console.log(`⏱️  Total Duration: ${summary.totalDuration}ms`)
  console.log(`🛡️  Security Score: ${summary.securityScore}/100`)
  
  // Security score interpretation
  if (summary.securityScore >= 90) {
    console.log(`🟢 Security Status: EXCELLENT`)
  } else if (summary.securityScore >= 75) {
    console.log(`🟡 Security Status: GOOD`)
  } else if (summary.securityScore >= 60) {
    console.log(`🟠 Security Status: NEEDS IMPROVEMENT`)
  } else {
    console.log(`🔴 Security Status: CRITICAL ISSUES`)
  }
  
  console.log("\n📋 Security Test Categories:")
  summary.results.forEach(result => {
    const status = result.failed === 0 && result.vulnerabilities.length === 0 ? "✅" : "⚠️"
    const score = result.passed + result.failed > 0 
      ? `${((result.passed / (result.passed + result.failed)) * 100).toFixed(1)}%`
      : "0%"
    
    console.log(`   ${status} ${result.category}: ${result.passed}/${result.passed + result.failed} (${score}) - ${result.duration}ms`)
    
    if (result.vulnerabilities.length > 0) {
      console.log(`      🚨 ${result.vulnerabilities.length} vulnerabilities`)
    }
    if (result.warnings.length > 0) {
      console.log(`      ⚠️  ${result.warnings.length} warnings`)
    }
  })
  
  if (summary.vulnerabilitiesFound > 0) {
    console.log("\n🚨 Critical Security Issues:")
    summary.results.forEach(result => {
      if (result.vulnerabilities.length > 0) {
        console.log(`\n   📁 ${result.category}:`)
        result.vulnerabilities.forEach(vuln => {
          console.log(`      • ${vuln}`)
        })
      }
    })
  }
  
  if (summary.warningsFound > 0) {
    console.log("\n⚠️  Security Warnings:")
    summary.results.forEach(result => {
      if (result.warnings.length > 0) {
        console.log(`\n   📁 ${result.category}:`)
        result.warnings.forEach(warning => {
          console.log(`      • ${warning}`)
        })
      }
    })
  }
  
  console.log("\n" + "=" .repeat(60))
  
  if (summary.success) {
    console.log("🚀 Security tests completed successfully!")
    console.log("✨ No security vulnerabilities detected")
  } else {
    console.log("⚠️  Security tests completed with issues")
    console.log("🔧 Please review and address the security concerns above")
  }
  
  // Security recommendations
  console.log("\n🛡️  Security Recommendations:")
  if (summary.securityScore < 100) {
    console.log("   • Review failed tests and address vulnerabilities")
    console.log("   • Implement additional security controls where needed")
    console.log("   • Consider security code review for critical components")
  }
  console.log("   • Run security tests regularly in CI/CD pipeline")
  console.log("   • Keep dependencies updated for security patches")
  console.log("   • Monitor for new security vulnerabilities")
}

// Run tests if this file is executed directly
if (import.meta.main) {
  runSecurityTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1)
    })
    .catch(error => {
      console.error("💥 Security test runner error:", error)
      process.exit(1)
    })
}

export { runSecurityTests, type SecurityTestSummary, type SecurityTestResult }
