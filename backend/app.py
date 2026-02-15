import os
import io
import re
import json
import base64
import tempfile
import asyncio
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai

import stt
import tts
import llm
import config
from gemini import GeminiRequest, GEMINI_CONFIG


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.GEMINI_API_KEY and config.LLM_PROVIDER == "gemini":
        app.state.gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)
    else:
        app.state.gemini_client = None
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

EMOTION_PATTERN = re.compile(r'^\[?(happy|sad|angry|surprised|concerned|neutral)\]?\s*', re.IGNORECASE)


def extract_amplitude_envelope(mp3_bytes: bytes, bucket_ms: int = 50) -> list[float]:
    """Extract normalized amplitude envelope from MP3 bytes."""
    from pydub import AudioSegment
    audio_seg = AudioSegment.from_mp3(io.BytesIO(mp3_bytes))
    samples = np.array(audio_seg.get_array_of_samples(), dtype=np.float32)
    if audio_seg.channels == 2:
        samples = samples[::2]
    bucket_size = int(audio_seg.frame_rate * bucket_ms / 1000)
    amplitudes = []
    for i in range(0, len(samples), bucket_size):
        chunk = samples[i:i + bucket_size]
        rms = float(np.sqrt(np.mean(chunk ** 2)))
        amplitudes.append(rms)
    if amplitudes:
        max_amp = max(amplitudes)
        if max_amp > 0:
            amplitudes = [a / max_amp for a in amplitudes]
    return amplitudes


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
    print("[WS] Connection accepted", flush=True)

    loop = asyncio.get_event_loop()

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

            if msg_type == "audio_data":
                # Audio captured by the browser and sent as base64
                audio_b64 = data.get("audio")
                if not audio_b64:
                    await websocket.send_json({"type": "error", "message": "no audio data"})
                    continue

                await websocket.send_json({"type": "processing"})

                audio_bytes = base64.b64decode(audio_b64)
                audio_format = data.get("format", "webm")
                voice_id = data.get("voiceId")
                print(f"[AUDIO] Received {len(audio_bytes)} bytes ({audio_format}) from browser, voice={voice_id}")

                # Convert browser audio to WAV using pydub (requires ffmpeg)
                from pydub import AudioSegment
                audio_seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=audio_format)
                audio_seg = audio_seg.set_channels(CHANNELS).set_frame_rate(SAMPLE_RATE).set_sample_width(2)

                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    audio_seg.export(tmp.name, format="wav")
                    tmp_path = tmp.name

                duration = len(audio_seg) / 1000.0
                print(f"[AUDIO] Converted to WAV: {duration:.2f}s")

                try:
                    import time as _time

                    # Transcribe
                    t0 = _time.time()
                    user_text = await loop.run_in_executor(None, stt.transcribe, tmp_path)
                    print(f"[STT] ({_time.time()-t0:.2f}s) Result: '{user_text}'")
                    await websocket.send_json({"type": "transcript", "text": user_text})

                    if not user_text.strip():
                        print("[STT] Empty transcription, skipping TTS")
                        await websocket.send_json({"type": "error", "message": "could not understand audio"})
                        continue

                    # Get response from LLM
                    t0 = _time.time()
                    response_text = await loop.run_in_executor(
                        None,
                        lambda: llm.generate(user_text, websocket.app.state.gemini_client)
                    )
                    print(f"[LLM] ({_time.time()-t0:.2f}s) Response: '{response_text}'")

                    # Parse emotion tag
                    emotion = 'neutral'
                    emotion_match = EMOTION_PATTERN.match(response_text)
                    if emotion_match:
                        emotion = emotion_match.group(1)
                        response_text = response_text[emotion_match.end():]

                    # Synthesize speech
                    t0 = _time.time()
                    audio = await loop.run_in_executor(
                        None, lambda: tts.synthesize(response_text, voice_id=voice_id)
                    )
                    print(f"[TTS] ({_time.time()-t0:.2f}s) Got {len(audio)} bytes")

                    # Extract amplitude envelope for lip sync
                    t0 = _time.time()
                    amplitudes = await loop.run_in_executor(
                        None, extract_amplitude_envelope, audio
                    )
                    print(f"[LIPSYNC] ({_time.time()-t0:.2f}s) {len(amplitudes)} buckets")

                    audio_b64 = base64.b64encode(audio).decode()
                    await websocket.send_json({
                        "type": "audio",
                        "audio": audio_b64,
                        "emotion": emotion,
                        "amplitudes": amplitudes,
                        "amplitudeBucketMs": 50,
                    })
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

    print("[WS] Connection closed")
