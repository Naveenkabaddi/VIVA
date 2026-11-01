"""Voice API tests: validation, browser fallback, capability reporting."""
from __future__ import annotations


def test_voice_capabilities(client, user_headers):
    response = client.get("/api/voice/capabilities", headers=user_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["speech_to_text"]["browser_fallback"] is True
    assert data["text_to_speech"]["browser_fallback"] is True


def test_empty_audio_rejected(client, user_headers):
    response = client.post(
        "/api/voice/transcribe",
        headers=user_headers,
        files={"file": ("answer.webm", b"", "audio/webm")},
        data={"language": "en"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "empty_audio"


def test_unsupported_audio_rejected(client, user_headers):
    response = client.post(
        "/api/voice/transcribe",
        headers=user_headers,
        files={"file": ("answer.exe", b"abc", "application/octet-stream")},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "unsupported_audio"


def test_transcribe_graceful_when_no_provider(client, user_headers):
    capabilities = client.get("/api/voice/capabilities", headers=user_headers).json()
    provider = capabilities["speech_to_text"]["provider"]
    response = client.post(
        "/api/voice/transcribe",
        headers=user_headers,
        files={"file": ("answer.webm", b"\x1a\x45\xdf\xa3fake-webm-audio", "audio/webm")},
    )
    if provider == "browser":
        assert response.status_code == 503
        assert response.json()["code"] == "stt_unavailable"
        assert "fallback" in response.json()["detail"].lower()
    else:
        assert response.status_code in {200, 503}


def test_synthesize_browser_fallback(client, user_headers):
    response = client.post(
        "/api/voice/synthesize",
        headers=user_headers,
        json={"text": "Explain your system architecture.", "lang": "en"},
    )
    assert response.status_code == 200
    assert response.headers["x-tts-provider"] in {"browser", "gtts"}
    if response.headers["content-type"].startswith("application/json"):
        assert response.json()["text"] == "Explain your system architecture."


def test_synthesize_empty_text(client, user_headers):
    response = client.post("/api/voice/synthesize", headers=user_headers, json={"text": ""})
    assert response.status_code == 422
