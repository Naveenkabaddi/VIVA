"""Project management endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession, get_owned_project
from app.db.models import Document, Project, VivaSession
from app.schemas.project import ProjectCreate, ProjectDetailOut, ProjectOut, ProjectUpdate
from app.services.document_service import delete_project_files
from app.services.rag import cached_overview

router = APIRouter(prefix="/projects", tags=["projects"])


def serialize_project(db: Session, project: Project, include_documents: bool = True) -> dict:
    documents = (
        db.query(Document)
        .filter(Document.project_id == project.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    sessions = (
        db.query(VivaSession)
        .filter(VivaSession.project_id == project.id)
        .order_by(VivaSession.started_at.desc())
        .all()
    )
    scored = [session.overall_score for session in sessions if session.overall_score is not None]
    data = {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "domain": project.domain,
        "status": project.status,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
        "document_count": len(documents),
        "ready_documents": sum(1 for doc in documents if doc.processing_status == "ready"),
        "session_count": len(sessions),
        "latest_score": round(max(scored), 1) if scored else None,
        "documents": [
            {
                "id": doc.id,
                "project_id": doc.project_id,
                "filename": doc.filename,
                "file_type": doc.file_type,
                "size_bytes": doc.size_bytes,
                "processing_status": doc.processing_status,
                "error_message": doc.error_message,
                "page_count": doc.page_count,
                "word_count": doc.word_count,
                "chunk_count": doc.chunk_count,
                "created_at": doc.created_at.isoformat(),
                "processed_at": doc.processed_at.isoformat() if doc.processed_at else None,
            }
            for doc in documents
        ]
        if include_documents
        else [],
    }
    return data


@router.get("", response_model=list[ProjectOut])
def list_projects(user: CurrentUser, db: DbSession) -> list[ProjectOut]:
    projects = (
        db.query(Project)
        .filter(Project.user_id == user.id)
        .order_by(Project.updated_at.desc())
        .all()
    )
    return [ProjectOut.model_validate(serialize_project(db, project)) for project in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, user: CurrentUser, db: DbSession) -> ProjectOut:
    project = Project(
        user_id=user.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        domain=payload.domain.strip(),
        status="draft",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(serialize_project(db, project))


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, user: CurrentUser, db: DbSession) -> ProjectDetailOut:
    project = get_owned_project(db, user.id, project_id)
    data = serialize_project(db, project)
    overview = cached_overview(db, project)
    sessions = (
        db.query(VivaSession)
        .filter(VivaSession.project_id == project.id)
        .order_by(VivaSession.started_at.desc())
        .limit(6)
        .all()
    )
    data["overview"] = overview
    data["recent_sessions"] = [
        {
            "id": session.id,
            "status": session.status,
            "difficulty": session.difficulty,
            "overall_score": session.overall_score,
            "started_at": session.started_at.isoformat() if session.started_at else None,
        }
        for session in sessions
    ]
    return ProjectDetailOut.model_validate(data)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int, payload: ProjectUpdate, user: CurrentUser, db: DbSession
) -> ProjectOut:
    project = get_owned_project(db, user.id, project_id)
    if payload.title is not None:
        project.title = payload.title.strip()
    if payload.description is not None:
        project.description = payload.description.strip()
    if payload.domain is not None:
        project.domain = payload.domain.strip()
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(serialize_project(db, project))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_project(project_id: int, user: CurrentUser, db: DbSession) -> Response:
    project = get_owned_project(db, user.id, project_id)
    delete_project_files(project)
    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
