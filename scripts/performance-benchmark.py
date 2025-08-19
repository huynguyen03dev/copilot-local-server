#!/usr/bin/env python3
"""
Performance Benchmark Script
Measures performance improvements after optimizations
"""

import asyncio
import aiohttp
import time
import json
import statistics
from typing import List, Dict
from dataclasses import dataclass

@dataclass
class BenchmarkResult:
    test_name: str
    requests_per_second: float
    average_response_time: float
    p95_response_time: float
    success_rate: float
    total_requests: int
    failed_requests: int

class PerformanceBenchmark:
    def __init__(self, base_url: str = "http://localhost:8069"):
        self.base_url = base_url
        
    async def benchmark_endpoint_caching(self, iterations: int = 100) -> BenchmarkResult:
        """Benchmark endpoint discovery caching performance"""
        print(f"🔍 Benchmarking endpoint caching ({iterations} requests)...")
        
        request_data = {
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "Hello, test message"}],
            "stream": False,
            "max_tokens": 50
        }
        
        response_times = []
        failed_requests = 0
        start_time = time.time()
        
        async with aiohttp.ClientSession() as session:
            for i in range(iterations):
                request_start = time.time()
                try:
                    async with session.post(
                        f"{self.base_url}/v1/chat/completions",
                        json=request_data,
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        await response.text()
                        if response.status == 200:
                            response_times.append(time.time() - request_start)
                        else:
                            failed_requests += 1
                except Exception:
                    failed_requests += 1
                
                # Small delay to avoid overwhelming the server
                if i % 10 == 0:
                    await asyncio.sleep(0.1)
        
        total_time = time.time() - start_time
        successful_requests = len(response_times)
        
        return BenchmarkResult(
            test_name="Endpoint Caching",
            requests_per_second=successful_requests / total_time,
            average_response_time=statistics.mean(response_times) if response_times else 0,
            p95_response_time=statistics.quantiles(response_times, n=20)[18] if len(response_times) >= 20 else 0,
            success_rate=(successful_requests / iterations) * 100,
            total_requests=iterations,
            failed_requests=failed_requests
        )
    
    async def benchmark_concurrent_requests(self, concurrent: int = 20, requests_per_client: int = 10) -> BenchmarkResult:
        """Benchmark concurrent request handling"""
        print(f"🚀 Benchmarking concurrent requests ({concurrent} clients, {requests_per_client} requests each)...")
        
        request_data = {
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "Concurrent test message"}],
            "stream": False,
            "max_tokens": 30
        }
        
        async def client_requests(session: aiohttp.ClientSession, client_id: int) -> List[float]:
            response_times = []
            for i in range(requests_per_client):
                request_start = time.time()
                try:
                    async with session.post(
                        f"{self.base_url}/v1/chat/completions",
                        json=request_data,
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        await response.text()
                        if response.status == 200:
                            response_times.append(time.time() - request_start)
                except Exception:
                    pass
            return response_times
        
        start_time = time.time()
        async with aiohttp.ClientSession() as session:
            tasks = [client_requests(session, i) for i in range(concurrent)]
            results = await asyncio.gather(*tasks)
        
        total_time = time.time() - start_time
        all_response_times = [rt for client_times in results for rt in client_times]
        total_requests = concurrent * requests_per_client
        successful_requests = len(all_response_times)
        
        return BenchmarkResult(
            test_name="Concurrent Requests",
            requests_per_second=successful_requests / total_time,
            average_response_time=statistics.mean(all_response_times) if all_response_times else 0,
            p95_response_time=statistics.quantiles(all_response_times, n=20)[18] if len(all_response_times) >= 20 else 0,
            success_rate=(successful_requests / total_requests) * 100,
            total_requests=total_requests,
            failed_requests=total_requests - successful_requests
        )
    
    async def benchmark_streaming_performance(self, iterations: int = 50) -> BenchmarkResult:
        """Benchmark streaming request performance"""
        print(f"📡 Benchmarking streaming performance ({iterations} streams)...")
        
        request_data = {
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "Stream a short response"}],
            "stream": True,
            "max_tokens": 100
        }
        
        response_times = []
        failed_requests = 0
        start_time = time.time()
        
        async with aiohttp.ClientSession() as session:
            for i in range(iterations):
                request_start = time.time()
                try:
                    async with session.post(
                        f"{self.base_url}/v1/chat/completions",
                        json=request_data,
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        if response.status == 200:
                            # Read the entire stream
                            async for line in response.content:
                                line_str = line.decode('utf-8').strip()
                                if line_str.startswith('data: [DONE]'):
                                    break
                            response_times.append(time.time() - request_start)
                        else:
                            failed_requests += 1
                except Exception:
                    failed_requests += 1
        
        total_time = time.time() - start_time
        successful_requests = len(response_times)
        
        return BenchmarkResult(
            test_name="Streaming Performance",
            requests_per_second=successful_requests / total_time,
            average_response_time=statistics.mean(response_times) if response_times else 0,
            p95_response_time=statistics.quantiles(response_times, n=20)[18] if len(response_times) >= 20 else 0,
            success_rate=(successful_requests / iterations) * 100,
            total_requests=iterations,
            failed_requests=failed_requests
        )
    
    async def get_server_metrics(self) -> Dict:
        """Get current server metrics"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/metrics") as response:
                    if response.status == 200:
                        return await response.json()
        except Exception:
            pass
        return {}
    
    def print_results(self, results: List[BenchmarkResult]):
        """Print benchmark results"""
        print("\n" + "="*80)
        print("📊 PERFORMANCE BENCHMARK RESULTS")
        print("="*80)
        
        for result in results:
            print(f"\n🎯 {result.test_name}:")
            print(f"   Requests/sec:     {result.requests_per_second:.2f}")
            print(f"   Avg Response:     {result.average_response_time*1000:.1f}ms")
            print(f"   P95 Response:     {result.p95_response_time*1000:.1f}ms")
            print(f"   Success Rate:     {result.success_rate:.1f}%")
            print(f"   Total Requests:   {result.total_requests}")
            print(f"   Failed Requests:  {result.failed_requests}")
        
        # Overall performance rating
        avg_rps = statistics.mean([r.requests_per_second for r in results])
        avg_response_time = statistics.mean([r.average_response_time for r in results])
        avg_success_rate = statistics.mean([r.success_rate for r in results])
        
        print(f"\n🏆 OVERALL PERFORMANCE:")
        print(f"   Average RPS:      {avg_rps:.2f}")
        print(f"   Average Response: {avg_response_time*1000:.1f}ms")
        print(f"   Average Success:  {avg_success_rate:.1f}%")
        
        if avg_rps >= 50 and avg_response_time < 1.0 and avg_success_rate >= 95:
            rating = "🟢 EXCELLENT"
        elif avg_rps >= 25 and avg_response_time < 2.0 and avg_success_rate >= 90:
            rating = "🟡 GOOD"
        else:
            rating = "🔴 NEEDS IMPROVEMENT"
        
        print(f"   Performance:      {rating}")

async def main():
    benchmark = PerformanceBenchmark()
    
    print("🚀 Starting Performance Benchmark Suite")
    print("⏳ This may take several minutes...")
    
    # Get initial metrics
    initial_metrics = await benchmark.get_server_metrics()
    print(f"📊 Initial server metrics: {json.dumps(initial_metrics, indent=2)}")
    
    results = []
    
    # Run benchmarks
    results.append(await benchmark.benchmark_endpoint_caching(100))
    results.append(await benchmark.benchmark_concurrent_requests(20, 10))
    results.append(await benchmark.benchmark_streaming_performance(50))
    
    # Get final metrics
    final_metrics = await benchmark.get_server_metrics()
    
    # Print results
    benchmark.print_results(results)
    
    print(f"\n📊 Final server metrics: {json.dumps(final_metrics, indent=2)}")

if __name__ == "__main__":
    asyncio.run(main())
