import httpx
from backend.config import settings

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"

class ElevenLabsClient:

    def __init__(self, http: httpx.AsyncClient):
        self.http = http
        self.api_key = settings.ELEVENLABS_API_KEY

    async def text_to_speech_mp3(self, payload: dict) -> httpx.Response:
        headers = {
            "xi-api-key": self.api_key,
            "accept": "audio/mpeg",
            "content-type": "application/json",
        }
        return await (
            self.http.post(
                f"{ELEVENLABS_BASE_URL}/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}",
                headers=headers,
                json=payload
            )
        )
