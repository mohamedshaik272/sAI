import os
import base64
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai

import faster_whisper
from google.genai import types

import elevenlabs
from backend.config import GEMINI_API_KEY
from backend.gemini import GeminiRequest, GEMINI_CONFIG, SYSTEM_INSTRUCTIONS


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.gemini_client = genai.Client(api_key=GEMINI_API_KEY)

    yield

    app.state.gemini_client = None

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


"""
Example Usage
"""
@app.post("/api/test")
async def generate_text(req: GeminiRequest):
    try:
        response = app.state.gemini_client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=req.prompt,
            config=GEMINI_CONFIG
        )

        return {
            "response": response.text
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/conversation")
async def conversation_ws(websocket: WebSocket):
    await websocket.accept()

    while True:
        try:
            data = await websocket.receive_json()

            if data.get("type") == "audio":
                audio_bytes = base64.b64decode(data.get("audio"))

                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(audio_bytes)
                    tmp_path = tmp.name

                try:
                    user_text = whisper.transcribe(tmp_path)
                    await websocket.send_json({"type": "transcript", "text": user_text})

                    # TODO: send user_text to gemini, get response
                    response_text = user_text  # echo for now

                    audio = elevenlabs.synthesize(response_text)
                    audio_b64 = base64.b64encode(audio).decode()
                    await websocket.send_json({"type": "audio", "audio": audio_b64})
                finally:
                    os.unlink(tmp_path)

        except WebSocketDisconnect:
            break
        except Exception:
            break
