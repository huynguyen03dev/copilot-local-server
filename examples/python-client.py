#!/usr/bin/env python3

"""
Example Python client using the OpenAI library with the local Copilot API server

Requirements:
    pip install openai

Usage:
    python examples/python-client.py
    python examples/python-client.py --port 8080
    python examples/python-client.py --message "Explain Python decorators"
"""

import argparse
import sys
import time
from typing import List, Dict, Any

try:
    import openai
except ImportError:
    print("❌ OpenAI library not found. Install with: pip install openai")
    sys.exit(1)


class CopilotAPIClient:
    def __init__(self, base_url: str = "http://localhost:8069"):
        self.client = openai.OpenAI(
            api_key="dummy-key",  # Not used, but required by library
            base_url=f"{base_url}/v1"
        )
        self.base_url = base_url

    def check_server_status(self) -> Dict[str, Any]:
        """Check if the server is running"""
        import urllib.request
        import json
        
        try:
            with urllib.request.urlopen(self.base_url) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            raise Exception(f"Server not responding: {e}")

    def check_auth_status(self) -> Dict[str, Any]:
        """Check authentication status"""
        import urllib.request
        import json
        
        try:
            with urllib.request.urlopen(f"{self.base_url}/auth/status") as response:
                return json.loads(response.read().decode())
        except Exception as e:
            raise Exception(f"Auth check failed: {e}")

    def list_models(self) -> List[Dict[str, Any]]:
        """List available models"""
        try:
            models = self.client.models.list()
            return [model.dict() for model in models.data]
        except Exception as e:
            raise Exception(f"Failed to list models: {e}")

    def chat_completion(self, messages: List[Dict[str, str]], model: str = "gpt-4", **kwargs) -> str:
        """Send a chat completion request"""
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs
            )
            return response.choices[0].message.content
        except Exception as e:
            raise Exception(f"Chat completion failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Test GitHub Copilot API Server with Python")
    parser.add_argument("--port", type=int, default=8069, help="Server port (default: 8069)")
    parser.add_argument("--message", type=str, help="Custom message to send")
    args = parser.parse_args()

    client = CopilotAPIClient(f"http://localhost:{args.port}")

    print("🐍 Testing GitHub Copilot API Server with Python")
    print(f"📡 Server: http://localhost:{args.port}")
    print()

    try:
        # 1. Check server status
        print("1️⃣ Checking server status...")
        status = client.check_server_status()
        print(f"   ✅ {status['message']} (v{status['version']})")
        print()

        # 2. Check authentication
        print("2️⃣ Checking authentication...")
        auth = client.check_auth_status()
        if auth['authenticated']:
            print("   ✅ Authenticated with GitHub Copilot")
        else:
            print("   ❌ Not authenticated")
            print("   💡 Run: bun run src/index.ts --auth")
            return
        print()

        # 3. List models
        print("3️⃣ Listing available models...")
        models = client.list_models()
        print(f"   📋 Found {len(models)} models:")
        for model in models:
            print(f"      - {model['id']}")
        print()

        # 4. Test chat completion
        print("4️⃣ Testing chat completion...")
        test_message = args.message or "Hello! Can you explain what Python is in one paragraph?"
        
        messages = [
            {"role": "system", "content": "You are a helpful AI assistant. Be concise and friendly."},
            {"role": "user", "content": test_message}
        ]

        print(f"   💬 Sending message: \"{test_message}\"")
        print("   ⏳ Waiting for response...")
        
        start_time = time.time()
        response = client.chat_completion(
            messages=messages,
            temperature=0.7,
            max_tokens=150
        )
        duration = (time.time() - start_time) * 1000
        
        print(f"   ✅ Response received in {duration:.0f}ms")
        print()
        print("📝 Response:")
        print("─" * 50)
        print(response)
        print("─" * 50)
        print()
        print("🎉 All tests passed!")

    except Exception as error:
        print(f"❌ Test failed: {error}")
        print()
        print("🔧 Troubleshooting:")
        print("   1. Make sure the server is running: bun run src/index.ts")
        print("   2. Check authentication: bun run src/index.ts --auth")
        print("   3. Verify your GitHub Copilot subscription is active")
        print("   4. Install OpenAI library: pip install openai")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Test interrupted")
        sys.exit(0)
    except Exception as e:
        print(f"💥 Fatal error: {e}")
        sys.exit(1)
