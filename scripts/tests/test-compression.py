#!/usr/bin/env python3
"""
Test script to verify response compression is working
"""

import requests
import json
import time

def test_compression():
    """Test compression with different endpoints"""
    
    base_url = "http://127.0.0.1:8069"
    
    # Test endpoints
    endpoints = [
        "/v1/models",
        "/auth/status", 
        "/metrics"
    ]
    
    print("🗜️ Testing Response Compression")
    print("=" * 50)
    
    for endpoint in endpoints:
        print(f"\n📍 Testing endpoint: {endpoint}")
        
        # Test without compression (skip Accept-Encoding)
        try:
            response_no_compression = requests.get(
                f"{base_url}{endpoint}",
                headers={"Accept": "application/json"},
                timeout=10
            )

            uncompressed_size = len(response_no_compression.content)
            no_compression_encoding = response_no_compression.headers.get('content-encoding', 'none')
            print(f"   Without Accept-Encoding: {uncompressed_size} bytes, encoding: {no_compression_encoding}")

        except Exception as e:
            print(f"   ❌ Error without compression: {e}")
            continue
        
        # Test with compression headers
        try:
            response_with_compression = requests.get(
                f"{base_url}{endpoint}",
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate"
                },
                timeout=10,
                stream=True  # Don't auto-decode to see raw headers
            )

            content_encoding = response_with_compression.headers.get('content-encoding', 'none')
            content_length = response_with_compression.headers.get('content-length', 'unknown')

            print(f"   With Accept-Encoding: Content-Length: {content_length}, Encoding: {content_encoding}")

            if content_encoding != 'none':
                print(f"   ✅ Compression applied: {content_encoding}")
            else:
                print(f"   ℹ️  No compression applied (likely below threshold)")

        except Exception as e:
            print(f"   ❌ Error with compression: {e}")
            continue
    
    # Test with a large request to trigger compression
    print(f"\n📍 Testing large request (chat completion)")
    
    large_request = {
        "model": "gpt-4",
        "messages": [
            {
                "role": "user", 
                "content": "Write a detailed explanation about " + "compression " * 100
            }
        ],
        "stream": False,
        "max_tokens": 100
    }
    
    try:
        response = requests.post(
            f"{base_url}/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate"
            },
            json=large_request,
            timeout=30,
            stream=True  # Don't auto-decode
        )

        content_encoding = response.headers.get('content-encoding', 'none')
        content_length = response.headers.get('content-length', 'unknown')

        print(f"   Status: {response.status_code}")
        print(f"   Content-Length: {content_length}")
        print(f"   Content-Encoding: {content_encoding}")

        if content_encoding != 'none':
            print(f"   ✅ Compression applied: {content_encoding}")
        else:
            print(f"   ℹ️  No compression applied")

    except Exception as e:
        print(f"   ❌ Error with large request: {e}")

if __name__ == "__main__":
    test_compression()
