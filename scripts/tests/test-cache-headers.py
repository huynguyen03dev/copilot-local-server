#!/usr/bin/env python3
"""
Test script to verify cache headers are working
"""

import requests
import json
import time

def test_cache_headers():
    """Test cache headers with different endpoints"""
    
    base_url = "http://127.0.0.1:8069"
    
    # Test endpoints
    endpoints = [
        "/v1/models",
        "/auth/status", 
        "/metrics"
    ]
    
    print("📦 Testing Cache Headers")
    print("=" * 50)
    
    for endpoint in endpoints:
        print(f"\n📍 Testing endpoint: {endpoint}")
        
        try:
            response = requests.get(
                f"{base_url}{endpoint}",
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate"
                },
                timeout=10
            )
            
            # Extract cache-related headers
            cache_control = response.headers.get('cache-control', 'none')
            etag = response.headers.get('etag', 'none')
            last_modified = response.headers.get('last-modified', 'none')
            vary = response.headers.get('vary', 'none')
            content_encoding = response.headers.get('content-encoding', 'none')
            
            print(f"   Status: {response.status_code}")
            print(f"   Cache-Control: {cache_control}")
            print(f"   ETag: {etag}")
            print(f"   Last-Modified: {last_modified}")
            print(f"   Vary: {vary}")
            print(f"   Content-Encoding: {content_encoding}")
            
            # Check if caching is applied appropriately
            if cache_control != 'none':
                print(f"   ✅ Cache headers applied")
                
                # Parse cache control
                if 'max-age' in cache_control:
                    max_age = cache_control.split('max-age=')[1].split(',')[0]
                    print(f"   📅 Cache duration: {max_age} seconds")
                    
            else:
                print(f"   ℹ️  No cache headers (expected for auth/metrics endpoints)")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
            continue
    
    # Test conditional requests
    print(f"\n📍 Testing conditional requests (If-None-Match)")
    
    try:
        # First request to get ETag
        first_response = requests.get(
            f"{base_url}/v1/models",
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate"
            },
            timeout=10
        )
        
        etag = first_response.headers.get('etag')
        print(f"   First request ETag: {etag}")
        
        if etag:
            # Second request with If-None-Match
            second_response = requests.get(
                f"{base_url}/v1/models",
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "If-None-Match": etag
                },
                timeout=10
            )
            
            print(f"   Conditional request status: {second_response.status_code}")
            
            if second_response.status_code == 304:
                print(f"   ✅ 304 Not Modified - Cache working!")
            elif second_response.status_code == 200:
                print(f"   ℹ️  200 OK - Content changed or cache not implemented")
            else:
                print(f"   ⚠️  Unexpected status: {second_response.status_code}")
        else:
            print(f"   ⚠️  No ETag received from first request")
            
    except Exception as e:
        print(f"   ❌ Error testing conditional requests: {e}")

    # Test cache with different content
    print(f"\n📍 Testing cache consistency")
    
    try:
        # Make multiple requests to the same endpoint
        responses = []
        for i in range(3):
            response = requests.get(
                f"{base_url}/v1/models",
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate"
                },
                timeout=10
            )
            responses.append(response)
            time.sleep(0.1)  # Small delay
        
        # Check if ETags are consistent
        etags = [r.headers.get('etag', 'none') for r in responses]
        print(f"   ETags from 3 requests: {etags}")
        
        if len(set(etags)) == 1 and etags[0] != 'none':
            print(f"   ✅ Consistent ETags - Cache working correctly")
        else:
            print(f"   ⚠️  Inconsistent ETags or no ETags")
            
    except Exception as e:
        print(f"   ❌ Error testing cache consistency: {e}")

if __name__ == "__main__":
    test_cache_headers()
