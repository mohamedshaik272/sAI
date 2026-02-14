from pydantic import BaseModel

class TTSRequest(BaseModel):
    text: str

    stability: float = 0.5
    similarity_boost: float = 0.75
    style: float | None = None
    use_speaker_boost: bool = True
