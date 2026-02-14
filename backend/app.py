import os
import base64
import tempfile

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import whisper
import elevenlabs

app = FastAPI()

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
