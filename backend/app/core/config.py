"""Application configuration loaded from environment variables (.env supported)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "AI Viva Preparation Platform"
    environment: str = "development"
    api_prefix: str = "/api"

    secret_key: str = "dev-only-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7
    jwt_algorithm: str = "HS256"

    database_url: str = "sqlite:///./viva.db"
    auto_migrate: bool = True
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    llm_timeout_seconds: int = 45
    llm_max_retries: int = 2

    embedding_backend: str = "auto"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    upload_dir: str = "./storage/uploads"
    vector_dir: str = "./storage/vectors"
    max_upload_mb: int = 20

    rate_limit_per_minute: int = 120

    score_weight_accuracy: float = 0.30
    score_weight_relevance: float = 0.20
    score_weight_completeness: float = 0.20
    score_weight_understanding: float = 0.20
    score_weight_clarity: float = 0.10

    whisper_model: str = "base"

    @field_validator("gemini_model")
    @classmethod
    def _default_model(cls, value: str) -> str:
        return value.strip() or "gemini-2.5-flash"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        return path if path.is_absolute() else (BACKEND_DIR / path).resolve()

    @property
    def vector_path(self) -> Path:
        path = Path(self.vector_dir)
        return path if path.is_absolute() else (BACKEND_DIR / path).resolve()

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def llm_enabled(self) -> bool:
        return bool(self.gemini_api_key.strip())

    @property
    def score_weights(self) -> dict[str, float]:
        return {
            "technical_accuracy": self.score_weight_accuracy,
            "relevance": self.score_weight_relevance,
            "completeness": self.score_weight_completeness,
            "conceptual_understanding": self.score_weight_understanding,
            "clarity": self.score_weight_clarity,
        }

    @property
    def weights_valid(self) -> bool:
        return abs(sum(self.score_weights.values()) - 1.0) < 1e-6

    def ensure_directories(self) -> None:
        self.upload_path.mkdir(parents=True, exist_ok=True)
        self.vector_path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
