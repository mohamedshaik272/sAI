import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "s3TPKV1kjDlVtZbl4Ksh")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyACM0")
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
