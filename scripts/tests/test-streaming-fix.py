#!/usr/bin/env python3
"""
Quick test to verify the streaming JSON parsing fix
"""

import asyncio
import aiohttp
import json

async def test_streaming_fix():
    """Test that streaming no longer has JSON parsing errors"""
    
    url = "http://localhost:8069/v1/chat/completions"
    
    payload = {
        "model": "gpt-4o",
        "messages": [
            {
                "role": "user", 
                "content": "Write a detailed explanation of how machine learning works, including key concepts like supervised learning, unsupervised learning, neural networks, and deep learning. Make it comprehensive but accessible."
            }
        ],
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 1000
    }
    
    print("🧪 Testing streaming fix...")
    print("📝 Requesting a long response to test chunk processing...")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    print(f"❌ Error: HTTP {response.status}")
                    text = await response.text()
                    print(f"Response: {text}")
                    return
                
                print(f"✅ Connected (HTTP {response.status})")
                
                chunk_count = 0
                total_content = ""
                json_errors = 0
                
                async for line in response.content:
                    line_str = line.decode('utf-8').strip()
                    
                    if line_str.startswith('data: '):
                        data_part = line_str[6:]  # Remove 'data: ' prefix
                        
                        if data_part == '[DONE]':
                            print("🏁 Stream completed with [DONE]")
                            break
                        
                        try:
                            # Try to parse the JSON
                            chunk_data = json.loads(data_part)
                            chunk_count += 1
                            
                            # Extract content if available
                            if 'choices' in chunk_data and len(chunk_data['choices']) > 0:
                                delta = chunk_data['choices'][0].get('delta', {})
                                content = delta.get('content', '')
                                if content:
                                    total_content += content
                            
                            # Log progress every 10 chunks
                            if chunk_count % 10 == 0:
                                print(f"📊 Processed {chunk_count} chunks, {len(total_content)} chars")
                                
                        except json.JSONDecodeError as e:
                            json_errors += 1
                            print(f"❌ JSON Parse Error in chunk {chunk_count}: {e}")
                            print(f"   Problematic data: {data_part[:100]}...")
                
                print(f"\n📈 Final Results:")
                print(f"   Total chunks: {chunk_count}")
                print(f"   JSON errors: {json_errors}")
                print(f"   Content length: {len(total_content)} characters")
                print(f"   Error rate: {(json_errors/max(chunk_count,1)*100):.1f}%")
                
                if json_errors == 0:
                    print("🎉 SUCCESS: No JSON parsing errors!")
                else:
                    print(f"⚠️  Still have {json_errors} JSON errors - needs more investigation")
                
                # Show a sample of the content
                if total_content:
                    print(f"\n📝 Content sample:")
                    print(f"   {total_content[:200]}...")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_streaming_fix())
