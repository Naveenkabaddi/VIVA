"""Voice interaction endpoints: speech-to-text and text-to-speech."""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response

from app.api.deps import CurrentUser
from app.core.errors import AppError
from app.schemas.viva import SynthesizeRequest
from app.services.voice_service import (
    MAX_AUDIO_BYTES,
    capabilities,
    synthesize,
    transcribe,
    validate_audio,
)

router = APIRouter(prefix="/voice", tags=["voice"])
logger = logging.getLogger(__name__)


@router.get("/capabilities")
def voice_capabilities(user: CurrentUser) -> dict:
    return capabilities()


@router.post("/transcribe")
async def transcribe_audio(
    user: CurrentUser,
    file: UploadFile = File(...),
    language: str = Form(default="en"),
) -> dict:
    audio = await file.read(MAX_AUDIO_BYTES + 1)
    validate_audio(file.filename or "answer.webm", len(audio), file.content_type)
    result = transcribe(audio, file.filename or "answer.webm", file.content_type, language)
    logger.info("Transcribed voice answer for user %s via %s", user.id, result["provider"])
    return result


@router.post("/synthesize")
def synthesize_speech(payload: SynthesizeRequest, user: CurrentUser):
    result = synthesize(payload.text, lang=payload.lang, slow=payload.slow)
    if result["audio"]:
        return Response(
            content=result["audio"],
            media_type=result["mime_type"],
            headers={
                "X-TTS-Provider": result["provider"],
                "Cache-Control": "no-store",
                "Content-Disposition": "inline; filename=examiner.mp3",
            },
        )
    return JSONResponse(
        content={
            "provider": result["provider"],
            "text": result["text"],
            "message": result["message"],
        },
        headers={"X-TTS-Provider": result["provider"], "Cache-Control": "no-store"},
    )
