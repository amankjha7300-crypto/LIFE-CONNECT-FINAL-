import os
import openai

# Ensure OpenAI API key is set via environment variable
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise RuntimeError("OPENAI_API_KEY environment variable not set")
openai.api_key = openai_api_key

async def get_llm_response(user_text: str) -> str:
    """Call OpenAI GPT-4o to get a response for the given user text.
    Returns the assistant's reply as a string.
    """
    try:
        response = await openai.ChatCompletion.acreate(
            model="gpt-4o",
            messages=[{"role": "user", "content": user_text}],
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        raise RuntimeError(f"OpenAI API error: {e}")
