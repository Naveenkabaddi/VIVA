"""Document intelligence pipeline tests: PDF, DOCX, TXT, invalid and scanned files."""
from __future__ import annotations

import fitz
import pytest

from app.core.config import settings
from app.services.document_service import DocumentProcessingError, validate_upload
from tests.conftest import SAMPLE_PDF_TEXT, SAMPLE_REPORT, upload_text


def test_txt_upload_and_chunking(client, user_headers, project):
    document = upload_text(client, user_headers, project["id"])
    assert document["processing_status"] in {"pending", "processing", "ready"}

    status = client.get(f"/api/documents/{document['id']}/status", headers=user_headers)
    assert status.status_code == 200
    payload = status.json()
    assert payload["processing_status"] == "ready", payload
    assert payload["chunk_count"] >= 3

    content = client.get(f"/api/documents/{document['id']}/content", headers=user_headers)
    assert content.status_code == 200
    body = content.json()
    assert body["chunk_count"] == payload["chunk_count"]
    assert len(body["sections"]) >= 5
    assert any("decision tree" in chunk["content"].lower() for chunk in body["chunks"])

    project_detail = client.get(f"/api/projects/{project['id']}", headers=user_headers)
    assert project_detail.status_code == 200
    overview = project_detail.json()["overview"]
    assert overview["ready_documents"] == 1
    assert overview["readiness_score"] > 0
    assert any("Machine Learning" in tech or "Python" in tech or "React" in tech for tech in overview["technologies"])


def test_pdf_upload(client, user_headers, project):
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_textbox(fitz.Rect(40, 40, 555, 800), SAMPLE_PDF_TEXT, fontsize=8)
    pdf_bytes = pdf.tobytes()
    pdf.close()

    response = client.post(
        "/api/documents/upload",
        headers=user_headers,
        data={"project_id": str(project["id"])},
        files={"file": ("report.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 202, response.text
    document_id = response.json()["id"]
    status = client.get(f"/api/documents/{document_id}/status", headers=user_headers).json()
    assert status["processing_status"] == "ready", status
    assert status["page_count"] == 1


def test_docx_upload(client, user_headers, project):
    import docx

    document = docx.Document()
    document.add_heading("Project Report", level=0)
    for line in SAMPLE_REPORT.splitlines():
        if not line.strip():
            continue
        if line.strip()[0].isdigit() and "." in line[:3]:
            document.add_heading(line.strip(), level=1)
        else:
            document.add_paragraph(line.strip())
    path = settings.upload_path / "sample.docx"
    document.save(str(path))
    docx_bytes = path.read_bytes()

    response = client.post(
        "/api/documents/upload",
        headers=user_headers,
        data={"project_id": str(project["id"])},
        files={
            "file": (
                "report.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 202, response.text
    document_id = response.json()["id"]
    status = client.get(f"/api/documents/{document_id}/status", headers=user_headers).json()
    assert status["processing_status"] == "ready", status
    assert status["chunk_count"] >= 2


def test_scanned_pdf_fails_gracefully(client, user_headers, project):
    pdf = fitz.open()
    pdf.new_page()
    pdf.new_page()
    blank_pdf = pdf.tobytes()
    pdf.close()

    response = client.post(
        "/api/documents/upload",
        headers=user_headers,
        data={"project_id": str(project["id"])},
        files={"file": ("scanned.pdf", blank_pdf, "application/pdf")},
    )
    assert response.status_code == 202, response.text
    status = client.get(f"/api/documents/{response.json()['id']}/status", headers=user_headers).json()
    assert status["processing_status"] == "failed"
    assert "scanned" in status["error_message"].lower() or "selectable text" in status["error_message"].lower()


def test_invalid_pdf_rejected(client, user_headers, project):
    response = client.post(
        "/api/documents/upload",
        headers=user_headers,
        data={"project_id": str(project["id"])},
        files={"file": ("fake.pdf", b"this is not a pdf", "application/pdf")},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_document"
    # A rejected upload must not leave an orphaned file behind.
    assert not list(settings.upload_path.rglob("*_fake.pdf"))


def test_empty_txt_rejected(client, user_headers, project):
    response = client.post(
        "/api/documents/upload",
        headers=user_headers,
        data={"project_id": str(project["id"])},
        files={"file": ("empty.txt", b"", "text/plain")},
    )
    assert response.status_code == 422
    assert "empty" in response.json()["detail"].lower()


def test_unsupported_extension_rejected(client, user_headers, project):
    response = client.post(
        "/api/documents/upload",
        headers=user_headers,
        data={"project_id": str(project["id"])},
        files={"file": ("script.exe", b"MZ...", "application/octet-stream")},
    )
    assert response.status_code == 422
    assert "PDF" in response.json()["detail"] or "supported" in response.json()["detail"].lower()


def test_size_validation_unit():
    with pytest.raises(DocumentProcessingError):
        validate_upload("large.pdf", settings.max_upload_bytes + 1, b"%PDF-1.4")
    with pytest.raises(DocumentProcessingError):
        validate_upload("report.csv", 100, b"a,b")


def test_delete_project_cascades(client, user_headers, ready_project):
    response = client.delete(f"/api/projects/{ready_project['id']}", headers=user_headers)
    assert response.status_code == 204
    assert (
        client.get(f"/api/projects/{ready_project['id']}", headers=user_headers).status_code
        == 404
    )
    # Documents (and their chunks) must be removed with the project.
    assert (
        client.get(
            f"/api/documents?project_id={ready_project['id']}", headers=user_headers
        ).status_code
        == 404
    )


def test_delete_document_updates_project(client, user_headers, ready_project):
    documents = client.get(
        f"/api/documents?project_id={ready_project['id']}", headers=user_headers
    ).json()
    assert documents
    response = client.delete(f"/api/documents/{documents[0]['id']}", headers=user_headers)
    assert response.status_code == 204
    remaining = client.get(
        f"/api/documents?project_id={ready_project['id']}", headers=user_headers
    ).json()
    assert remaining == []
