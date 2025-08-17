#!/usr/bin/env python3

"""
Test script to demonstrate enhanced model logging
Shows the actual model being used in both streaming and non-streaming responses
"""

from openai import OpenAI
import time

def test_model_logging():
    """Test enhanced model logging for both streaming and non-streaming"""
    print("🧪 Testing Enhanced Model Logging")
    print("=" * 50)
    
    client = OpenAI(
        api_key="dummy-key",
        base_url="http://localhost:8069/v1"
    )

    # Test 1: Non-streaming request
    print("\n1️⃣ Testing Non-Streaming Model Logging...")
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "What model are you?"}],
            max_tokens=50,
            stream=False
        )
        print(f"   ✅ Non-streaming response received")
        print(f"   📝 Response: {response.choices[0].message.content}")
        print(f"   🤖 Client-side model: {response.model}")
    except Exception as e:
        print(f"   ❌ Non-streaming test failed: {e}")

    print("\n" + "-" * 50)

    # Test 2: Streaming request
    print("\n2️⃣ Testing Streaming Model Logging...")
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Tell me what model you are in exactly 10 words"}],
            max_tokens=30,
            stream=True
        )
        
        print("   📡 Streaming response:")
        full_response = ""
        chunk_count = 0
        
        for chunk in response:
            if chunk.choices and len(chunk.choices) > 0:
                if hasattr(chunk.choices[0], 'delta') and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    print(content, end='', flush=True)
                    full_response += content
                    chunk_count += 1
        
        print(f"\n   ✅ Streaming completed")
        print(f"   📊 Received {chunk_count} chunks")
        print(f"   📝 Full response: {full_response}")
        
        # Get model from first chunk
        response_fresh = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Quick test"}],
            max_tokens=5,
            stream=True
        )
        
        first_chunk = next(response_fresh)
        if hasattr(first_chunk, 'model'):
            print(f"   🤖 Client-side model: {first_chunk.model}")
        
    except Exception as e:
        print(f"   ❌ Streaming test failed: {e}")

    print("\n" + "-" * 50)

    # Test 3: Multiple rapid requests to see different endpoints
    print("\n3️⃣ Testing Multiple Requests (Check Server Logs)...")
    for i in range(3):
        try:
            response = client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": f"Quick test {i+1}"}],
                max_tokens=10,
                stream=True
            )
            
            # Just consume the first chunk to trigger the logging
            first_chunk = next(response)
            print(f"   ✅ Request {i+1} completed")
            
            # Small delay between requests
            time.sleep(0.5)
            
        except Exception as e:
            print(f"   ❌ Request {i+1} failed: {e}")

    print("\n🎉 Model logging tests completed!")
    print("\n📋 Check the server logs to see:")
    print("   🤖 Model information for streaming responses")
    print("   🤖 Model information for non-streaming responses")
    print("   📡 Endpoint information (which URL was successful)")
    print("   ✅ Success messages with model details")

if __name__ == "__main__":
    test_model_logging()
