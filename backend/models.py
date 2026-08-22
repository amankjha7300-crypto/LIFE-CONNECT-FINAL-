import os
import asyncio

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

openai_api_key = os.getenv("OPENAI_API_KEY")

async def get_llm_chat_response(messages: list) -> str:
    """Call OpenAI GPT to get a response for the given chat history.
    If OpenAI is not configured, returns a mock large response.
    """
    if OPENAI_AVAILABLE and openai_api_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai_api_key)
            
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                temperature=0.7,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI error: {e}")
            # Fall through to mock
            
    # Mock Large Response fallback
    await asyncio.sleep(1.5)
    last_msg = messages[-1]["content"] if messages else ""
    return (
        f"That's a very interesting point about '{last_msg}'. "
        "I'm here to listen and share in your experiences. "
        "Did you know that reflecting on these memories can often bring a wonderful sense of peace and joy? "
        "We can explore this further, or if you'd like, we can talk about some of the activities in the Wellness section."
    )

async def get_llm_response(user_text: str) -> str:
    """Legacy endpoint for single text strings (used by voice router)."""
    return await get_llm_chat_response([{"role": "user", "content": user_text}])

