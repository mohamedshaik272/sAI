from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from backend.api.tts import router as tts_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=10.0),
    )

    yield

    await app.state.client.aclose()

app = FastAPI(lifespan=lifespan)

app.include_router(tts_router, prefix="/api")