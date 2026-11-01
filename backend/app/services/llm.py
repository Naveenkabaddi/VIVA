"""Google Gemini client with strict JSON parsing, retries and safe failure.

The platform is designed to work with or without an API key. When Gemini is
unavailable, services fall back to the deterministic offline examiner engine.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class LLMUnavailableError(RuntimeError):
    pass


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise LLMUnavailableError("Model did not return JSON.")
        try:
            parsed = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LLMUnavailableError("Model returned malformed JSON.") from exc
    if not isinstance(parsed, dict):
        raise LLMUnavailableError("Model returned a non-object JSON value.")
    return parsed


class GeminiClient:
    def __init__(self) -> None:
        self._last_error: str | None = None

    @property
    def enabled(self) -> bool:
        return settings.llm_enabled

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "provider": "gemini" if self.enabled else "offline-heuristic",
            "model": settings.gemini_model if self.enabled else None,
            "last_error": self._last_error,
        }

    def generate_json(
        self,
        prompt: str,
        *,
        system: str,
        temperature: float = 0.35,
        max_output_tokens: int = 4096,
        retries: int | None = None,
    ) -> dict[str, Any]:
        if not self.enabled:
            raise LLMUnavailableError("Gemini API key is not configured.")

        attempts = (retries if retries is not None else settings.llm_max_retries) + 1
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "topP": 0.9,
                "maxOutputTokens": max_output_tokens,
                "responseMimeType": "application/json",
            },
        }
        url = GEMINI_ENDPOINT.format(model=settings.gemini_model)
        last_exc: Exception | None = None

        for attempt in range(attempts):
            try:
                with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
                    response = client.post(
                        url,
                        params={"key": settings.gemini_api_key},
                        json=payload,
                    )
                if response.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError(
                        f"Gemini transient error {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                if response.status_code >= 400:
                    detail = response.text[:300]
                    raise LLMUnavailableError(f"Gemini API error {response.status_code}: {detail}")
                data = response.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    feedback = data.get("promptFeedback", {})
                    raise LLMUnavailableError(f"Gemini returned no candidates: {feedback}")
                parts = candidates[0].get("content", {}).get("parts") or []
                text = "".join(part.get("text", "") for part in parts)
                if not text.strip():
                    raise LLMUnavailableError("Gemini returned an empty response.")
                parsed = _extract_json(text)
                self._last_error = None
                return parsed
            except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_exc = exc
                logger.warning("Gemini attempt %s/%s failed: %s", attempt + 1, attempts, exc)
            except LLMUnavailableError as exc:
                last_exc = exc
                logger.warning("Gemini output rejected: %s", exc)
                break
            except Exception as exc:  # pragma: no cover - defensive
                last_exc = exc
                logger.exception("Unexpected Gemini failure")
                break
            if attempt < attempts - 1:
                time.sleep(min(1.5 * (2**attempt), 4.0))

        self._last_error = str(last_exc) if last_exc else "Unknown Gemini failure"
        raise LLMUnavailableError(self._last_error)

    def _request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled:
            raise LLMUnavailableError("Gemini API key is not configured.")
        url = GEMINI_ENDPOINT.format(model=settings.gemini_model)
        last_exc: Exception | None = None
        attempts = settings.llm_max_retries + 1
        for attempt in range(attempts):
            try:
                with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
                    response = client.post(
                        url, params={"key": settings.gemini_api_key}, json=payload
                    )
                if response.status_code >= 400:
                    raise LLMUnavailableError(
                        f"Gemini API error {response.status_code}: {response.text[:200]}"
                    )
                data = response.json()
                if not data.get("candidates"):
                    raise LLMUnavailableError("Gemini returned no candidates.")
                self._last_error = None
                return data
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                logger.warning("Gemini transport attempt %s failed: %s", attempt + 1, exc)
            except LLMUnavailableError as exc:
                last_exc = exc
                break
            if attempt < attempts - 1:
                time.sleep(min(1.5 * (2**attempt), 4.0))
        self._last_error = str(last_exc) if last_exc else "Unknown Gemini failure"
        raise LLMUnavailableError(self._last_error)

    def generate_text(
        self, prompt: str, *, system: str = "", temperature: float = 0.2, max_output_tokens: int = 1024
    ) -> str:
        payload: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens,
            },
        }
        if system:
            payload["system_instruction"] = {"parts": [{"text": system}]}
        data = self._request(payload)
        parts = data["candidates"][0].get("content", {}).get("parts") or []
        return "".join(part.get("text", "") for part in parts).strip()

    def transcribe_audio(
        self, audio_base64: str, mime_type: str, *, prompt: str = ""
    ) -> str:
        instruction = prompt or (
            "Transcribe this viva answer verbatim. Preserve technical terms and numbers. "
            "Return only the transcript text, with no commentary."
        )
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": instruction},
                        {"inlineData": {"mimeType": mime_type, "data": audio_base64}},
                    ],
                }
            ],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2048},
        }
        data = self._request(payload)
        parts = data["candidates"][0].get("content", {}).get("parts") or []
        return "".join(part.get("text", "") for part in parts).strip()


gemini = GeminiClient()
