from elevenlabs import ElevenLabs
import config

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
    return _client


def synthesize(text: str) -> bytes:
    client = _get_client()
    audio = client.text_to_speech.convert(
        voice_id=config.ELEVENLABS_VOICE_ID,
        text=text,
        model_id="eleven_flash_v2_5",
        output_format="mp3_44100_128"
    )
    return b"".join(audio)
