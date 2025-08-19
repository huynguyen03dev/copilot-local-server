from openai import OpenAI

def test_streaming():
    """Test streaming functionality"""
    print("🧪 Testing streaming response...")
    client = OpenAI(
        api_key="dummy-key",
        base_url="http://localhost:8069/v1"
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Count to 10 slowly, with a comma between each number"}],
        stream=True,
        max_tokens=100
    )

    print("📡 Streaming response:")
    collected_content = []
    for chunk in response:
        if chunk.choices and len(chunk.choices) > 0:
            if hasattr(chunk.choices[0], 'delta') and chunk.choices[0].delta.content is not None:
                content = chunk.choices[0].delta.content
                collected_content.append(content)
                print(content, end="", flush=True)

    print(f"\n✅ Full streamed response: {''.join(collected_content)}")

def test_non_streaming():
    """Test non-streaming functionality for backward compatibility"""
    print("🧪 Testing non-streaming response...")
    client = OpenAI(
        api_key="dummy-key",
        base_url="http://localhost:8069/v1"
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Say hello in one sentence"}],
        stream=False
    )

    print(f"📝 Non-streaming response: {response.choices[0].message.content}")

def test_error_handling():
    """Test error handling scenarios"""
    print("🧪 Testing error handling...")
    client = OpenAI(
        api_key="dummy-key",
        base_url="http://localhost:8069/v1"
    )

    # Test rate limiting
    print("   📊 Testing rate limiting...")
    try:
        # Make two rapid streaming requests
        for i in range(2):
            response = client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": f"Quick test {i}"}],
                stream=True,
                max_tokens=5
            )

            # Consume the first response
            if i == 0:
                for chunk in response:
                    if chunk.choices and len(chunk.choices) > 0:
                        if hasattr(chunk.choices[0], 'delta') and chunk.choices[0].delta.content:
                            break  # Just get first chunk

        print("   ✅ Rate limiting test completed")
    except Exception as e:
        print(f"   ⚠️  Rate limiting test: {e}")

    # Test malformed request
    print("   🔧 Testing malformed request handling...")
    try:
        import requests
        response = requests.post(
            "http://localhost:8069/v1/chat/completions",
            json={
                "model": "",  # Empty model
                "messages": [],  # Empty messages
                "stream": True
            },
            headers={"Content-Type": "application/json"}
        )
        print(f"   📊 Malformed request status: {response.status_code}")
        if response.status_code == 400:
            print("   ✅ Properly rejected malformed request")
        else:
            print("   ⚠️  Unexpected response to malformed request")
    except Exception as e:
        print(f"   ⚠️  Malformed request test: {e}")

def test_backward_compatibility():
    """Test that existing functionality still works"""
    print("🧪 Testing backward compatibility...")
    client = OpenAI(
        api_key="dummy-key",
        base_url="http://localhost:8069/v1"
    )

    # Test with no stream parameter (should default to false)
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=20
            # No stream parameter
        )
        print("   ✅ Request without stream parameter works")
        print(f"   📝 Response type: {type(response)}")
    except Exception as e:
        print(f"   ⚠️  Backward compatibility test failed: {e}")

if __name__ == "__main__":
    print("🚀 Testing GitHub Copilot API Server Streaming Support\n")

    # Test non-streaming first (backward compatibility)
    test_non_streaming()
    print("\n" + "="*60 + "\n")

    # Test streaming functionality
    test_streaming()
    print("\n" + "="*60 + "\n")

    # Test error handling
    test_error_handling()
    print("\n" + "="*60 + "\n")

    # Test backward compatibility
    test_backward_compatibility()

    print("\n🎉 All tests completed!")