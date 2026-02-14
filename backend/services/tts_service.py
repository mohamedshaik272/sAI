from fastapi import HTTPException

from backend.schemas.tts import TTSRequest
from backend.clients.elevenlabs import ElevenLabsClient


ELEVENLABS_MODEL_ID = "eleven_flash_v2_5"

class TTSService:
    def __init__(self, eleven: ElevenLabsClient):
        self.eleven = eleven

    async def get_audio(self, request: TTSRequest) -> bytes:
        payload = {
            "text": request.text,
            "model_id": ELEVENLABS_MODEL_ID,
            "voice_settings": {
                "stability": request.stability,
                "similarity_boost": request.similarity_boost,
                **({"style": request.style} if request.style is not None else {}),
                "use_speaker_boost": request.use_speaker_boost,
            },
        }

        r = await self.eleven.text_to_speech_mp3(payload)

        if r.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail={
                    "error": "ElevenLabs TTS failed",
                    "status_code": r.status_code,
                    "body": r.text,
                },
            )

        return r.content