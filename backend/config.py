from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ELEVENLABS_API_KEY: str
    ELEVENLABS_VOICE_ID: str

    class Config:
        env_file = ".env"

settings = Settings()