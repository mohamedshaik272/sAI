from elevenlabs import ElevenLabs
import config

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
    return _client


def synthesize(text: str, voice_id: str = None) -> bytes:
    client = _get_client()
    audio = client.text_to_speech.convert(
        voice_id=voice_id or config.ELEVENLABS_VOICE_ID,
        text=text,
        model_id="eleven_flash_v2_5",
        output_format="mp3_22050_32",
        voice_settings={
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.4,
            "use_speaker_boost": True
        }
    )
    return b"".join(audio)
