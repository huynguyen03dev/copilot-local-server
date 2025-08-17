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

if __name__ == "__main__":
    print("🚀 Testing GitHub Copilot API Server Streaming Support\n")

    # Test non-streaming first (backward compatibility)
    test_non_streaming()
    print("\n" + "="*60 + "\n")

    # Test streaming functionality
    test_streaming()

    print("\n🎉 All tests completed!")