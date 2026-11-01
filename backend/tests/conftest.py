"""Test configuration. Environment must be configured before importing the app."""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

TEST_ROOT = Path(tempfile.mkdtemp(prefix="viva_tests_"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(TEST_ROOT / 'test.db').as_posix()}",
        "SECRET_KEY": "test-secret-key-that-is-long-enough-for-hs256",
        "GEMINI_API_KEY": "",
        "EMBEDDING_BACKEND": "hashing",
        "UPLOAD_DIR": str(TEST_ROOT / "uploads"),
        "VECTOR_DIR": str(TEST_ROOT / "vectors"),
        "RATE_LIMIT_PER_MINUTE": "0",
        "ENVIRONMENT": "test",
        "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
        "MAX_UPLOAD_MB": "20",
    }
)

from fastapi.testclient import TestClient  # noqa: E402

from app.db.models import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402

SAMPLE_REPORT = """
1. Abstract
The Campus Placement Prediction System is a web application that helps students estimate their
placement chances using academic and skill-related data. Existing placement cells rely on manual
spreadsheets and anecdotal advice, which is slow and inconsistent. This project combines a React
frontend, a FastAPI backend and a decision tree classifier to provide transparent predictions and
personalised preparation guidance.

2. Problem Statement
Students often do not know which skills matter for campus placements. Placement officers maintain
placement records in spreadsheets and cannot answer personalised queries at scale. Existing
commercial prediction tools are opaque, expensive and not tailored to a college environment.
The project addresses this gap with an explainable, low-cost prediction platform.

3. Objectives
The primary objective is to build a placement readiness prediction system with at least 80 percent
classification accuracy. Secondary objectives are to provide a dashboard for students, to explain
the factors influencing each prediction, and to recommend improvement areas based on missing skills.
The project also aims to give placement officers aggregated analytics without exposing individual data.

4. Literature Review
Previous work by Sharma et al. used logistic regression on CGPA and aptitude scores and achieved
72 percent accuracy. That study did not consider internships or communication skills. Commercial
platforms such as HackerRank provide assessments but not placement probability. Our project differs
by combining academic, technical and soft-skill features in a transparent decision tree model and
by offering personalised recommendations.

5. Methodology and Algorithms
We use a supervised decision tree classifier implemented with scikit-learn. The dataset contains
1200 anonymised student records with features such as CGPA, aptitude score, coding score, internship
count, communication rating and backlogs. Categorical features are one-hot encoded and numeric
features are standardised. The tree depth is limited to six to reduce overfitting. We compare the
decision tree with logistic regression and random forest using stratified five-fold cross-validation.
The decision tree was selected because it is interpretable: each prediction can be explained as a
sequence of threshold decisions that a student can understand.

6. System Architecture
The system has three layers. The React frontend communicates with the FastAPI backend through a REST
API secured with JWT authentication. The backend contains authentication, prediction, analytics and
recommendation modules. A PostgreSQL database stores users, student profiles, prediction history and
recommendations. The trained model is serialised with joblib and loaded by the prediction service.
The frontend sends a profile payload, the backend validates it with Pydantic, the model returns a
probability and the explainability module returns the most influential features.

7. Database Design
The users table stores id, name, email and password hash. The student_profiles table stores academic
features and has a one-to-one relationship with users. The predictions table stores the model output,
probability and timestamp, with a foreign key to student_profiles. The recommendations table stores
topic, advice and priority. Indexes on user_id and prediction timestamp keep dashboard queries fast.
The schema is normalised to third normal form.

8. Implementation
The backend exposes REST endpoints for registration, login, profile submission and prediction history.
Passwords are hashed with bcrypt and sessions use JWT access tokens. The prediction service validates
feature ranges, handles missing values with median imputation and logs every prediction for auditing.
The frontend uses React, TypeScript and Tailwind CSS. Charts are rendered with Recharts. A difficult
bug involved inconsistent feature ordering between training and inference; it was fixed by exporting
the feature pipeline together with the model and adding a schema version check.

9. Testing
Unit tests cover feature validation, password hashing and score calculation. Integration tests cover
the registration to prediction flow using FastAPI TestClient. User acceptance testing was conducted
with 20 final-year students. The model achieved 84 percent accuracy, 0.81 F1 score and 0.87 ROC AUC
on the held-out test set. A confusion matrix showed that students with internships were occasionally
misclassified as not ready because of sparse training samples.

10. Results
The decision tree achieved 84 percent accuracy, outperforming logistic regression at 76 percent and
matching random forest at 85 percent while remaining interpretable. Prediction latency averaged
38 milliseconds on a local deployment. In the student study, 17 of 20 participants said the
explanation helped them understand which skills to improve.

11. Real-World Applications
The platform can be deployed by college placement cells, training institutes and career counsellors.
It could also support scholarship readiness screening. A production deployment would require consent
management, periodic model retraining, bias monitoring and alignment with data protection policies.

12. Limitations
The dataset is limited to one college and 1200 records, so generalisation is uncertain. Self-reported
communication ratings may be biased. The model predicts readiness but does not establish causality.
The system currently supports only structured features and cannot analyse resumes or interview audio.

13. Future Scope
Future work includes adding resume parsing with NLP, integrating mock interview scoring, collecting
data from multiple colleges, adding fairness-aware retraining and deploying the model behind a
monitoring pipeline. A mobile application and explainable counterfactual suggestions are also planned.

14. Conclusion
The project demonstrates that an interpretable decision tree can support placement readiness
assessment while giving students actionable guidance. The architecture separates prediction,
analytics and recommendation concerns and is ready for further extension.
"""

SAMPLE_PDF_TEXT = """
Project Report: Campus Placement Prediction System

1. Introduction
This project predicts campus placement readiness using machine learning. Students enter academic
and skill data and receive a placement probability with an explanation.

2. Problem Statement
Manual placement guidance is inconsistent and does not scale. Existing tools do not explain results.

3. Methodology
We use a decision tree classifier with scikit-learn. Features include CGPA, aptitude, coding score,
internships and communication. The model is evaluated with five-fold cross validation.

4. System Architecture
The React frontend calls a FastAPI REST API. PostgreSQL stores users and predictions. JWT protects
private endpoints. The trained model is loaded by the prediction service.

5. Results
The model achieved 84 percent accuracy and 0.81 F1 score on the held-out test set.

6. Limitations and Future Scope
The dataset comes from one college. Future work includes multi-college data and resume parsing.
"""


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def clean_database(client):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    for folder in (TEST_ROOT / "uploads", TEST_ROOT / "vectors"):
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)
        folder.mkdir(parents=True, exist_ok=True)
    yield


@pytest.fixture
def user_headers(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Test Student", "email": "student@example.com", "password": "Password123"},
    )
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def second_user_headers(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Other Student", "email": "other@example.com", "password": "Password123"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def project(client, user_headers):
    response = client.post(
        "/api/projects",
        headers=user_headers,
        json={
            "title": "Campus Placement Prediction System",
            "description": "An explainable placement readiness predictor for college students.",
            "domain": "Machine Learning",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_text(client, headers, project_id: int, text: str = SAMPLE_REPORT, filename: str = "report.txt"):
    response = client.post(
        "/api/documents/upload",
        headers=headers,
        data={"project_id": str(project_id)},
        files={"file": (filename, text.encode("utf-8"), "text/plain")},
    )
    assert response.status_code == 202, response.text
    return response.json()


@pytest.fixture
def ready_project(client, user_headers, project):
    document = upload_text(client, user_headers, project["id"])
    status = client.get(f"/api/documents/{document['id']}/status", headers=user_headers)
    assert status.status_code == 200
    assert status.json()["processing_status"] == "ready", status.text
    return project
