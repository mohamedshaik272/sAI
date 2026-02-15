import ollama
import config
from gemini import SYSTEM_INSTRUCTIONS, GEMINI_CONFIG

_ollama_client = None


def _get_ollama_client():
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = ollama.Client(host=config.OLLAMA_URL)
    return _ollama_client


def generate(user_text: str, gemini_client=None) -> str:
    """Generate a response using the configured LLM provider."""
    if config.LLM_PROVIDER == "ollama":
        return _ollama_generate(user_text)
    else:
        return _gemini_generate(user_text, gemini_client)


def _ollama_generate(user_text: str) -> str:
    client = _get_ollama_client()
    response = client.chat(
        model=config.OLLAMA_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTIONS},
            {"role": "user", "content": user_text},
        ],
    )
    return response["message"]["content"]


def _gemini_generate(user_text: str, client) -> str:
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=user_text,
        config=GEMINI_CONFIG,
    )
    return response.text
