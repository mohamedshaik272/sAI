import os
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "s3TPKV1kjDlVtZbl4Ksh")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SERIAL_PORT = os.getenv("SERIAL_PORT", "")
