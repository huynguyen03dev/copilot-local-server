from openai import OpenAI

client = OpenAI(
    api_key="dummy-key",
    base_url="http://localhost:8069/v1"
)

response = client.chat.completions.create(
    model="gpt-4.1",
    messages=[{"role": "user", "content": "Tìm cho tôi 5 bộ phim ma hay mới nhất 2025"}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="", flush=True)