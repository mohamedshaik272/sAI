import torch
from faster_whisper import WhisperModel

_model = None


def _load():
    global _model
    if _model is None:
        if torch.cuda.is_available():
            _model = WhisperModel("large-v3", device="cuda", compute_type="float16")
        else:
            _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model


def transcribe(audio_path: str) -> str:
    model = _load()
    segments, _ = model.transcribe(audio_path)
    return " ".join(seg.text for seg in segments).strip()
