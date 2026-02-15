import os
import json
import base64
import tempfile
import asyncio
import wave
from contextlib import asynccontextmanager

import sounddevice as sd
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai

import stt
import tts
import config
from gemini import GeminiRequest, GEMINI_CONFIG


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)
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

SAMPLE_RATE = 16000
CHANNELS = 1


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/test")
async def generate_text(req: GeminiRequest):
    try:
        response = app.state.gemini_client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=req.prompt,
            config=GEMINI_CONFIG
        )
        return {"response": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/conversation")
async def conversation_ws(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Connection accepted")

    recording = False
    audio_frames = []
    stream = None
    loop = asyncio.get_event_loop()

    def audio_callback(indata, frames, time_info, status):
        if status:
            print(f"[MIC] sounddevice status: {status}")
        if recording:
            audio_frames.append(indata.copy())

    while True:
        try:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except Exception:
                continue
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            print(f"[WS] Received: {msg_type}")

            if msg_type == "start_listening":
                audio_frames.clear()
                recording = True
                print(f"[MIC] Opening stream - samplerate={SAMPLE_RATE}, channels={CHANNELS}")
                try:
                    stream = sd.InputStream(
                        samplerate=SAMPLE_RATE,
                        channels=CHANNELS,
                        dtype="int16",
                        callback=audio_callback,
                    )
                    stream.start()
                    print("[MIC] Recording started")
                except Exception as e:
                    print(f"[MIC] ERROR opening stream: {e}")
                    await websocket.send_json({"type": "error", "message": f"mic error: {e}"})
                    continue
                await websocket.send_json({"type": "listening"})

            elif msg_type == "stop_listening":
                recording = False
                if stream:
                    stream.stop()
                    stream.close()
                    stream = None
                print(f"[MIC] Recording stopped - captured {len(audio_frames)} frames")

                if not audio_frames:
                    print("[MIC] WARNING: no audio frames captured!")
                    await websocket.send_json({"type": "error", "message": "no audio captured"})
                    continue

                await websocket.send_json({"type": "processing"})

                # Save captured audio to temp WAV file
                audio_data = np.concatenate(audio_frames)
                duration = len(audio_data) / SAMPLE_RATE
                print(f"[AUDIO] Captured {len(audio_data)} samples ({duration:.2f}s)")

                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    with wave.open(tmp.name, "wb") as wf:
                        wf.setnchannels(CHANNELS)
                        wf.setsampwidth(2)  # 16-bit
                        wf.setframerate(SAMPLE_RATE)
                        wf.writeframes(audio_data.tobytes())
                    tmp_path = tmp.name
                print(f"[AUDIO] Saved WAV to {tmp_path}")

                try:
                    # Transcribe
                    print("[STT] Starting transcription...")
                    user_text = await loop.run_in_executor(None, stt.transcribe, tmp_path)
                    print(f"[STT] Result: '{user_text}'")
                    await websocket.send_json({"type": "transcript", "text": user_text})

                    if not user_text.strip():
                        print("[STT] Empty transcription, skipping TTS")
                        await websocket.send_json({"type": "error", "message": "could not understand audio"})
                        continue

                    # Get response from Gemini
                    print("[LLM] Sending to Gemini...")
                    gemini_response = await loop.run_in_executor(
                        None,
                        lambda: websocket.app.state.gemini_client.models.generate_content(
                            model="gemini-3-flash-preview",
                            contents=user_text,
                            config=GEMINI_CONFIG
                        )
                    )
                    response_text = gemini_response.text
                    print(f"[LLM] Response: '{response_text}'")

                    # Synthesize speech
                    print("[TTS] Starting synthesis...")
                    audio = await loop.run_in_executor(None, tts.synthesize, response_text)
                    print(f"[TTS] Got {len(audio)} bytes of audio")
                    audio_b64 = base64.b64encode(audio).decode()
                    await websocket.send_json({"type": "audio", "audio": audio_b64})
                    print("[WS] Sent audio response to client")
                finally:
                    os.unlink(tmp_path)

        except WebSocketDisconnect:
            print("[WS] Client disconnected")
            break
        except Exception as e:
            print(f"[ERROR] {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            try:
                await websocket.send_json({"type": "error", "message": str(e)})
            except Exception:
                break

    # Cleanup
    if stream:
        stream.stop()
        stream.close()
    print("[WS] Connection closed")
