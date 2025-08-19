#!/usr/bin/env python3

"""
Comprehensive performance testing suite for GitHub Copilot API Server
Tests streaming performance, concurrency, memory usage, and error handling
"""

import asyncio
import aiohttp
import time
import json
import statistics
import argparse
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import threading

@dataclass
class TestResult:
    test_name: str
    success: bool
    duration: float
    chunks_received: int
    bytes_received: int
    error_message: str = ""

@dataclass
class PerformanceMetrics:
    total_tests: int
    successful_tests: int
    failed_tests: int
    average_duration: float
    min_duration: float
    max_duration: float
    total_chunks: int
    total_bytes: int
    throughput_chunks_per_sec: float
    throughput_bytes_per_sec: float
    success_rate: float

class PerformanceTester:
    def __init__(self, base_url: str = "http://localhost:8069"):
        self.base_url = base_url
        self.results: List[TestResult] = []
        
    async def test_single_stream(self, session: aiohttp.ClientSession, test_id: int, content: str) -> TestResult:
        """Test a single streaming request"""
        start_time = time.time()
        chunks_received = 0
        bytes_received = 0
        
        request_data = {
            "model": "gpt-4",
            "messages": [{"role": "user", "content": content}],
            "stream": True,
            "max_tokens": 100
        }
        
        try:
            async with session.post(
                f"{self.base_url}/v1/chat/completions",
                json=request_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                
                if response.status != 200:
                    error_text = await response.text()
                    return TestResult(
                        test_name=f"stream_{test_id}",
                        success=False,
                        duration=time.time() - start_time,
                        chunks_received=0,
                        bytes_received=0,
                        error_message=f"HTTP {response.status}: {error_text}"
                    )
                
                async for line in response.content:
                    line_str = line.decode('utf-8').strip()
                    if line_str.startswith('data: '):
                        data = line_str[6:].strip()
                        if data == '[DONE]':
                            break
                        try:
                            chunk = json.loads(data)
                            chunks_received += 1
                            bytes_received += len(data)
                        except json.JSONDecodeError:
                            pass  # Skip malformed chunks
                
                return TestResult(
                    test_name=f"stream_{test_id}",
                    success=True,
                    duration=time.time() - start_time,
                    chunks_received=chunks_received,
                    bytes_received=bytes_received
                )
                
        except Exception as e:
            return TestResult(
                test_name=f"stream_{test_id}",
                success=False,
                duration=time.time() - start_time,
                chunks_received=chunks_received,
                bytes_received=bytes_received,
                error_message=str(e)
            )
    
    async def test_concurrent_streams(self, num_streams: int = 10) -> List[TestResult]:
        """Test multiple concurrent streaming requests"""
        print(f"🔄 Testing {num_streams} concurrent streams...")
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            for i in range(num_streams):
                content = f"Count to {i + 5} slowly with explanations"
                task = self.test_single_stream(session, i, content)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter out exceptions and convert to TestResult
            valid_results = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    valid_results.append(TestResult(
                        test_name=f"stream_{i}",
                        success=False,
                        duration=0,
                        chunks_received=0,
                        bytes_received=0,
                        error_message=str(result)
                    ))
                else:
                    valid_results.append(result)
            
            return valid_results
    
    async def test_rate_limiting(self) -> List[TestResult]:
        """Test rate limiting behavior"""
        print("🚦 Testing rate limiting...")
        
        results = []
        async with aiohttp.ClientSession() as session:
            # Make rapid requests to trigger rate limiting
            for i in range(5):
                result = await self.test_single_stream(session, f"rate_{i}", f"Quick test {i}")
                results.append(result)
                # Small delay to see rate limiting behavior
                await asyncio.sleep(0.1)
        
        return results
    
    async def test_large_responses(self) -> List[TestResult]:
        """Test handling of large streaming responses"""
        print("📊 Testing large response handling...")
        
        large_content_tests = [
            "Write a detailed explanation of machine learning with examples",
            "Create a comprehensive guide to Python programming",
            "Explain the history of computer science in detail"
        ]
        
        results = []
        async with aiohttp.ClientSession() as session:
            for i, content in enumerate(large_content_tests):
                result = await self.test_single_stream(session, f"large_{i}", content)
                results.append(result)
        
        return results
    
    async def test_error_scenarios(self) -> List[TestResult]:
        """Test various error scenarios"""
        print("⚠️ Testing error scenarios...")
        
        error_tests = [
            {"model": "", "messages": [], "stream": True},  # Invalid request
            {"model": "invalid-model", "messages": [{"role": "user", "content": "test"}], "stream": True},  # Invalid model
        ]
        
        results = []
        async with aiohttp.ClientSession() as session:
            for i, test_data in enumerate(error_tests):
                start_time = time.time()
                try:
                    async with session.post(
                        f"{self.base_url}/v1/chat/completions",
                        json=test_data,
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        duration = time.time() - start_time
                        
                        # For error scenarios, we expect non-200 status or proper error handling
                        if response.status == 200:
                            # If it's 200, check if it's a proper error response
                            content = await response.text()
                            success = "error" in content.lower()
                        else:
                            success = True  # Expected error response
                        
                        results.append(TestResult(
                            test_name=f"error_{i}",
                            success=success,
                            duration=duration,
                            chunks_received=0,
                            bytes_received=len(await response.text()) if response.status != 200 else 0,
                            error_message=f"Status: {response.status}" if not success else ""
                        ))
                except Exception as e:
                    results.append(TestResult(
                        test_name=f"error_{i}",
                        success=True,  # Exception is expected for error scenarios
                        duration=time.time() - start_time,
                        chunks_received=0,
                        bytes_received=0,
                        error_message=str(e)
                    ))
        
        return results
    
    def calculate_metrics(self, results: List[TestResult]) -> PerformanceMetrics:
        """Calculate performance metrics from test results"""
        if not results:
            return PerformanceMetrics(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        
        successful_results = [r for r in results if r.success]
        failed_results = [r for r in results if not r.success]
        
        durations = [r.duration for r in results if r.duration > 0]
        total_duration = sum(durations)
        
        total_chunks = sum(r.chunks_received for r in results)
        total_bytes = sum(r.bytes_received for r in results)
        
        return PerformanceMetrics(
            total_tests=len(results),
            successful_tests=len(successful_results),
            failed_tests=len(failed_results),
            average_duration=statistics.mean(durations) if durations else 0,
            min_duration=min(durations) if durations else 0,
            max_duration=max(durations) if durations else 0,
            total_chunks=total_chunks,
            total_bytes=total_bytes,
            throughput_chunks_per_sec=total_chunks / total_duration if total_duration > 0 else 0,
            throughput_bytes_per_sec=total_bytes / total_duration if total_duration > 0 else 0,
            success_rate=(len(successful_results) / len(results)) * 100 if results else 0
        )
    
    def print_results(self, test_name: str, results: List[TestResult]):
        """Print test results"""
        metrics = self.calculate_metrics(results)
        
        print(f"\n📊 {test_name} Results:")
        print(f"   Total Tests: {metrics.total_tests}")
        print(f"   Successful: {metrics.successful_tests}")
        print(f"   Failed: {metrics.failed_tests}")
        print(f"   Success Rate: {metrics.success_rate:.1f}%")
        print(f"   Average Duration: {metrics.average_duration:.2f}s")
        print(f"   Min/Max Duration: {metrics.min_duration:.2f}s / {metrics.max_duration:.2f}s")
        print(f"   Total Chunks: {metrics.total_chunks}")
        print(f"   Total Bytes: {metrics.total_bytes}")
        print(f"   Throughput: {metrics.throughput_chunks_per_sec:.1f} chunks/s, {metrics.throughput_bytes_per_sec:.1f} bytes/s")
        
        # Show failed tests
        failed_tests = [r for r in results if not r.success]
        if failed_tests:
            print(f"   Failed Tests:")
            for test in failed_tests[:5]:  # Show first 5 failures
                print(f"     - {test.test_name}: {test.error_message}")
    
    async def run_all_tests(self, concurrent_streams: int = 10):
        """Run all performance tests"""
        print("🚀 Starting Performance Test Suite")
        print("=" * 50)
        
        all_results = []
        
        # Test 1: Concurrent streams
        concurrent_results = await self.test_concurrent_streams(concurrent_streams)
        all_results.extend(concurrent_results)
        self.print_results("Concurrent Streams", concurrent_results)
        
        # Test 2: Rate limiting
        rate_limit_results = await self.test_rate_limiting()
        all_results.extend(rate_limit_results)
        self.print_results("Rate Limiting", rate_limit_results)
        
        # Test 3: Large responses
        large_response_results = await self.test_large_responses()
        all_results.extend(large_response_results)
        self.print_results("Large Responses", large_response_results)
        
        # Test 4: Error scenarios
        error_results = await self.test_error_scenarios()
        all_results.extend(error_results)
        self.print_results("Error Scenarios", error_results)
        
        # Overall summary
        print("\n🎯 Overall Performance Summary:")
        print("=" * 50)
        overall_metrics = self.calculate_metrics(all_results)
        
        print(f"Total Tests: {overall_metrics.total_tests}")
        print(f"Overall Success Rate: {overall_metrics.success_rate:.1f}%")
        print(f"Average Response Time: {overall_metrics.average_duration:.2f}s")
        print(f"Total Throughput: {overall_metrics.throughput_chunks_per_sec:.1f} chunks/s")
        print(f"Data Processed: {overall_metrics.total_bytes / 1024:.1f} KB")
        
        # Performance rating
        if overall_metrics.success_rate >= 95 and overall_metrics.average_duration < 3:
            rating = "🟢 EXCELLENT"
        elif overall_metrics.success_rate >= 90 and overall_metrics.average_duration < 5:
            rating = "🟡 GOOD"
        else:
            rating = "🔴 NEEDS IMPROVEMENT"
        
        print(f"Performance Rating: {rating}")
        
        return all_results

async def main():
    parser = argparse.ArgumentParser(description="GitHub Copilot API Server Performance Test")
    parser.add_argument("--url", default="http://localhost:8069", help="Server URL")
    parser.add_argument("--concurrent", type=int, default=10, help="Number of concurrent streams to test")
    
    args = parser.parse_args()
    
    tester = PerformanceTester(args.url)
    
    print(f"🎯 Testing server: {args.url}")
    print(f"🔄 Concurrent streams: {args.concurrent}")
    print()
    
    try:
        await tester.run_all_tests(args.concurrent)
    except KeyboardInterrupt:
        print("\n\n👋 Performance testing stopped")
    except Exception as e:
        print(f"\n\n💥 Error during testing: {e}")

if __name__ == "__main__":
    asyncio.run(main())
