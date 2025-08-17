#!/usr/bin/env python3

"""
Performance monitoring script for streaming functionality
Demonstrates the enhanced error handling and connection management
"""

import requests
import time
import json
import threading
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

class StreamingMonitor:
    def __init__(self, base_url: str = "http://localhost:8069"):
        self.base_url = base_url

    def test_streaming_request(self, request_id: int, content: str) -> Dict[str, Any]:
        """Test a single streaming request"""
        start_time = time.time()
        
        request_data = {
            "model": "gpt-4",
            "messages": [{"role": "user", "content": content}],
            "stream": True,
            "max_tokens": 50
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/v1/chat/completions",
                json=request_data,
                headers={"Content-Type": "application/json"},
                stream=True
            )
                
            result = {
                "request_id": request_id,
                "status": response.status_code,
                "headers": dict(response.headers),
                "start_time": start_time,
                "chunks": 0,
                "content": "",
                "error": None
            }

            if response.status_code == 200:
                # Process streaming response
                for line in response.iter_lines():
                    if line:
                        line_str = line.decode('utf-8').strip()
                        if line_str.startswith('data: '):
                            data = line_str[6:].strip()
                            if data == '[DONE]':
                                break
                            try:
                                chunk = json.loads(data)
                                result["chunks"] += 1
                                if chunk.get("choices") and len(chunk["choices"]) > 0:
                                    delta_content = chunk["choices"][0].get("delta", {}).get("content")
                                    if delta_content:
                                        result["content"] += delta_content
                            except json.JSONDecodeError:
                                pass  # Skip malformed chunks
            else:
                # Handle error response
                try:
                    error_data = response.json()
                    result["error"] = error_data
                except:
                    result["error"] = {"message": f"HTTP {response.status_code}"}

            result["duration"] = time.time() - start_time
            return result
                
        except Exception as e:
            return {
                "request_id": request_id,
                "status": 0,
                "error": {"message": str(e)},
                "duration": time.time() - start_time,
                "chunks": 0,
                "content": ""
            }

    def test_rate_limiting(self) -> None:
        """Test rate limiting functionality"""
        print("🧪 Testing Rate Limiting...")
        
        # Make rapid requests to trigger rate limiting
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = []
            for i in range(3):
                future = executor.submit(self.test_streaming_request, i, f"Quick test {i}")
                futures.append(future)

            results = [future.result() for future in as_completed(futures)]
        
        success_count = sum(1 for r in results if r["status"] == 200)
        rate_limited_count = sum(1 for r in results if r["status"] == 429)
        
        print(f"   ✅ Successful requests: {success_count}")
        print(f"   🚫 Rate limited requests: {rate_limited_count}")
        print(f"   📊 Total requests: {len(results)}")
        
        for result in results:
            if result["status"] == 429:
                print(f"   ⏰ Request {result['request_id']} rate limited: {result['error']}")
    
    def test_concurrent_streams(self) -> None:
        """Test concurrent streaming handling"""
        print("🧪 Testing Concurrent Streams...")

        # Create multiple concurrent streaming requests
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for i in range(5):
                content = f"Count to {i+3} slowly"
                future = executor.submit(self.test_streaming_request, i, content)
                futures.append(future)

            start_time = time.time()
            results = [future.result() for future in as_completed(futures)]
            total_duration = time.time() - start_time
        
        successful_streams = [r for r in results if r["status"] == 200]
        
        print(f"   ⏱️  Total time: {total_duration:.2f}s")
        print(f"   ✅ Successful streams: {len(successful_streams)}")
        print(f"   📊 Average chunks per stream: {sum(r['chunks'] for r in successful_streams) / len(successful_streams) if successful_streams else 0:.1f}")
        
        for result in successful_streams:
            print(f"   🔄 Stream {result['request_id']}: {result['chunks']} chunks in {result['duration']:.2f}s")
    
    def test_error_scenarios(self) -> None:
        """Test various error scenarios"""
        print("🧪 Testing Error Scenarios...")

        # Test malformed request
        try:
            response = requests.post(
                f"{self.base_url}/v1/chat/completions",
                json={"model": "", "messages": [], "stream": True},
                headers={"Content-Type": "application/json"}
            )
            print(f"   🔧 Malformed request status: {response.status_code}")
        except Exception as e:
            print(f"   ⚠️  Malformed request error: {e}")

        # Test server capacity
        print("   📈 Testing server capacity...")
        try:
            health_response = requests.get(f"{self.base_url}/")
            if health_response.status_code == 200:
                print("   ✅ Server is healthy and responsive")
            else:
                print(f"   ⚠️  Server health check failed: {health_response.status_code}")
        except Exception as e:
            print(f"   ⚠️  Server health check error: {e}")

def main():
    print("🚀 Streaming Performance Monitor")
    print("=" * 50)

    monitor = StreamingMonitor()

    # Test rate limiting
    monitor.test_rate_limiting()
    print()

    # Wait a bit to reset rate limits
    print("⏳ Waiting for rate limit reset...")
    time.sleep(2)
    print()

    # Test concurrent streams
    monitor.test_concurrent_streams()
    print()

    # Test error scenarios
    monitor.test_error_scenarios()

    print("\n🎉 Performance monitoring completed!")

if __name__ == "__main__":
    main()
