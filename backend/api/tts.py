from fastapi import APIRouter, Request
from fastapi.responses import Response

from backend.schemas.tts import TTSRequest
from backend.clients.elevenlabs import ElevenLabsClient
from backend.services.tts_service import TTSService

router = APIRouter()

@router.post("/tts")
async def tts(tts_req: TTSRequest, request: Request):
    eleven = ElevenLabsClient(request.app.state.client)
    tts_service = TTSService(eleven)

    audio = await tts_service.get_audio(tts_req)
    response = Response(content=audio, media_type="audio/mpeg")

    return response