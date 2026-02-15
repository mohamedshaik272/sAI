# sAI - Supportive AI

sAI is a holographic AI companion designed for mental health support as well as other healthcare-related needs.  
It combines real-time voice interaction, 3D avatar animation, and physical motor tracking to create an AI that feels present and responsive.

This project bridges AI software with hardware embodiment — allowing an AI assistant to listen, respond naturally, animate visually, and physically track the user.

## What It Does

- Captures live microphone input
- Transcribes speech to text (STT)
- Sends text to Gemini for intelligent responses
- Converts responses to natural voice using ElevenLabs (TTS)
- Animates a 3D avatar using Three.js
- Uses webcam body tracking to detect user position
- Controls servo motors via Raspberry Pi + Arduino to physically rotate toward the user

The goal is to move beyond static chat interfaces and create a more immersive AI presence.

## Architecture Overview

Frontend (Three.js + Web Audio)  
⬇  
FastAPI Backend (STT → Gemini → TTS)  
⬇  
Audio + Animation Response  
⬇  
Raspberry Pi + Arduino (Camera Tracking + Servo Rotation)

## Technologies Used

### Backend
- **FastAPI** – High-performance Python backend framework for handling WebSockets and real-time communication.
- **Google Gemini API** – LLM used to generate contextual AI responses.
- **ElevenLabs API** – Text-to-Speech engine for natural voice output.
- **Faster-Whisper (Whisper-style processing)** – Speech-to-Text to converts user speech into text for LLM input.

FastAPI was chosen for its speed, async support, and clean architecture for AI service orchestration.

### Frontend
- **Three.js** – Renders and animates the 3D holographic avatar.
- **Web Audio API / MediaRecorder** – Captures microphone input and plays AI responses.
- **VRM Model Support** – For animated avatar representation.

Three.js allows full control over 3D rendering and animation, making it ideal for a holographic AI interface.

### Hardware
- **Raspberry Pi** – Handles webcam tracking and system coordination.
- **Arduino** – Controls servo motors.
- **Servo Motors** – Physically rotate the hologram/camera to track user movement.
- **Webcam** – Detects and tracks user position.

This hardware integration gives the AI a physical presence instead of existing purely on-screen.

## Setup

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # then add your keys
uvicorn app:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Arduino:**
Upload `arduino/servo_control/servo_control.ino` to your board.

---

## TODO

- [ ] get api keys (gemini + elevenlabs)
- [ ] find a good vrm model to use
- [ ] wire up the mic button to actually record audio
- [ ] send audio to backend -> transcribe with whisper
- [ ] hook up gemini for responses
- [ ] generate voice with elevenlabs and send back
- [ ] lip sync the avatar when audio plays
- [ ] webcam body tracking loop
- [ ] arduino serial connection + test servo
- [ ] map person x-position to servo angle
- [ ] build the hologram box thing
- [ ] test everything together
- [ ] make it not look terrible
