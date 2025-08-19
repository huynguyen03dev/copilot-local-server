from openai import OpenAI   

def streaming():
    """Test streaming functionality"""
    print("🧪 Testing streaming response...")
    client = OpenAI(
        api_key="test",
        base_url="http://localhost:8069/v1"
    )

    response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "tell me a horror story"}],
            stream=True,
        )

    print("📡 Streaming response:")
    collected_content = []
    for chunk in response:
        if chunk.choices and len(chunk.choices) > 0:
            if hasattr(chunk.choices[0], 'delta') and chunk.choices[0].delta.content is not None:
                content = chunk.choices[0].delta.content
                collected_content.append(content)
                print(content, end="", flush=True)

streaming()
