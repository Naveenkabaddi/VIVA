"""API route aggregation."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    ai,
    analytics,
    auth,
    documents,
    evaluation,
    projects,
    recommendations,
    viva,
    voice,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(documents.router)
api_router.include_router(ai.router)
api_router.include_router(viva.router)
api_router.include_router(evaluation.router)
api_router.include_router(analytics.router)
api_router.include_router(recommendations.router)
api_router.include_router(voice.router)
