"""Voice services: speech-to-text and text-to-speech providers.

Providers are isolated from evaluation. The frontend transcribes audio here and
then submits the reviewed text through the normal viva answer endpoint, so voice
never bypasses the evaluation pipeline.
"""
from __future__ import annotations

import base64
import io
import logging
import mimetypes
import tempfile
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.errors import AppError
from app.services.llm import LLMUnavailableError, gemini

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 15 * 1024 * 1024
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".ogg", ".wav", ".mp3", ".m4a", ".mp4", ".aac", ".flac"}
MIME_OVERRIDES = {
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
}

_whisper_model = None
_whisper_failed = False


def validate_audio(filename: str, size: int, content_type: str | None = None) -> str:
    suffix = Path(filename or "answer.webm").suffix.lower() or ".webm"
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise AppError(
            f"Unsupported audio format '{suffix}'. Use webm, wav, mp3, m4a or ogg.",
            422,
            "unsupported_audio",
        )
    if size <= 0:
        raise AppError("The audio recording is empty. Please record your answer again.", 422, "empty_audio")
    if size > MAX_AUDIO_BYTES:
        raise AppError("Audio is too large (maximum 15 MB). Keep answers under 2 minutes.", 413, "audio_too_large")
    mime = MIME_OVERRIDES.get(suffix)
    if content_type and content_type.startswith("audio/"):
        mime = content_type.split(";")[0]
    return mime or "audio/webm"


def capabilities() -> dict[str, Any]:
    try:
        import faster_whisper  # noqa: F401

        whisper = True
    except Exception:
        whisper = False
    try:
        import gtts  # noqa: F401

        gtts_available = True
    except Exception:
        gtts_available = False
    return {
        "speech_to_text": {
            "local_whisper": whisper,
            "gemini_audio": gemini.enabled,
            "browser_fallback": True,
            "provider": "faster-whisper" if whisper else ("gemini" if gemini.enabled else "browser"),
        },
        "text_to_speech": {
            "gtts": gtts_available,
            "browser_fallback": True,
            "provider": "gtts" if gtts_available else "browser",
        },
    }


def _load_whisper():
    global _whisper_model, _whisper_failed
    if _whisper_model is not None or _whisper_failed:
        return _whisper_model
    try:
        from faster_whisper import WhisperModel  # type: ignore

        logger.info("Loading faster-whisper model '%s'", settings.whisper_model)
        _whisper_model = WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")
    except Exception as exc:  # pragma: no cover - optional dependency
        logger.warning("faster-whisper unavailable: %s", exc)
        _whisper_failed = True
        _whisper_model = None
    return _whisper_model


def transcribe(audio: bytes, filename: str, content_type: str | None = None, language: str = "en") -> dict[str, Any]:
    mime = validate_audio(filename, len(audio), content_type)
    errors: list[str] = []

    model = _load_whisper()
    if model is not None:
        suffix = Path(filename).suffix or ".webm"
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
                handle.write(audio)
                temp_path = handle.name
            segments, info = model.transcribe(temp_path, language=language or None, vad_filter=True)
            text = " ".join(segment.text.strip() for segment in segments).strip()
            if text:
                return {
                    "text": text,
                    "provider": "faster-whisper",
                    "language": getattr(info, "language", language),
                    "duration": getattr(info, "duration", None),
                }
            errors.append("Whisper produced an empty transcript.")
        except Exception as exc:  # pragma: no cover - optional dependency
            logger.warning("Whisper transcription failed: %s", exc)
            errors.append(f"Whisper failed: {exc}")
        finally:
            if temp_path:
                Path(temp_path).unlink(missing_ok=True)

    if gemini.enabled:
        try:
            text = gemini.transcribe_audio(base64.b64encode(audio).decode("ascii"), mime)
            if text:
                return {"text": text, "provider": "gemini", "language": language, "duration": None}
            errors.append("Gemini returned an empty transcript.")
        except LLMUnavailableError as exc:
            logger.warning("Gemini transcription failed: %s", exc)
            errors.append(str(exc))

    raise AppError(
        "Speech-to-text is not available on the server. Install faster-whisper or configure "
        "GEMINI_API_KEY, or use the browser's built-in dictation/text fallback. "
        + (f"Details: {'; '.join(errors[:2])}" if errors else ""),
        503,
        "stt_unavailable",
    )


def synthesize(text: str, lang: str = "en", slow: bool = False) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        raise AppError("Cannot synthesize empty text.", 422, "empty_text")
    if len(text) > 4000:
        text = text[:4000]
    try:
        from gtts import gTTS  # type: ignore

        buffer = io.BytesIO()
        gTTS(text=text, lang=(lang or "en").split("-")[0], slow=slow).write_to_fp(buffer)
        audio = buffer.getvalue()
        if audio:
            return {"audio": audio, "mime_type": "audio/mpeg", "provider": "gtts"}
    except Exception as exc:  # gTTS is optional
        logger.info("Server TTS unavailable (%s); browser speech synthesis will be used.", exc)

    return {
        "audio": None,
        "mime_type": None,
        "provider": "browser",
        "text": text,
        "message": "Use the browser SpeechSynthesis API to speak this text.",
    }


def guess_mime(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return MIME_OVERRIDES.get(suffix) or (mimetypes.guess_type(filename)[0] or "audio/webm")
