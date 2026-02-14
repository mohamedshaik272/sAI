# sAI - Supportive AI

Holographic AI companion for mental wellness. Uses body tracking to follow you around.

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
