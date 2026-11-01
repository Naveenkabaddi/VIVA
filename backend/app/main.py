"""FastAPI entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RateLimitMiddleware, RequestLoggingMiddleware
from app.db.init_db import init_db
from app.services.embeddings import backend_info
from app.services.llm import gemini
from app.services.voice_service import capabilities

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_directories()
    init_db()
    logger.info("Starting %s (%s)", settings.app_name, settings.environment)
    logger.info("LLM mode: %s", "Gemini" if gemini.enabled else "offline heuristic")
    logger.info("Embeddings: %s", backend_info())
    yield
    logger.info("Shutting down")


app = FastAPI(
    title=settings.app_name,
    description=(
        "REST API for an AI-powered project viva platform: document intelligence, "
        "RAG question generation, adaptive mock vivas, answer evaluation, analytics, "
        "recommendations and voice interaction."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["X-Process-Time-Ms"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)
install_error_handlers(app)

app.include_router(api_router, prefix=settings.api_prefix)


from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

@app.get("/api/health", tags=["system"])
def health() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.environment,
        "llm": gemini.status(),
        "embeddings": backend_info(),
        "voice": capabilities(),
        "scoring_weights": settings.score_weights,
        "weights_valid": settings.weights_valid,
    }


if (FRONTEND_DIST / "index.html").exists():
    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "status": "running",
            "docs": "/api/docs",
            "health": "/api/health",
        }
