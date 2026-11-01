"""End-to-end mock viva flow, analytics, reports and recommendations."""
from __future__ import annotations

import pytest

GOOD_ANSWER = (
    "The project uses an interpretable supervised decision tree classifier with scikit-learn. "
    "Features include CGPA, aptitude, coding score and internships. We limit depth to six to reduce "
    "overfitting and use stratified cross-validation. The architecture separates a React frontend, "
    "a FastAPI REST backend, a PostgreSQL database and the prediction service. Results reached "
    "84 percent accuracy with 0.81 F1 score. A key limitation is the single-college dataset, so "
    "future work includes multi-college data and fairness monitoring."
)


def _start(client, headers, project_id, count=3):
    response = client.post(
        "/api/viva/start",
        headers=headers,
        json={
            "project_id": project_id,
            "difficulty": "mixed",
            "duration_minutes": 30,
            "question_count": count,
            "mode": "text",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _run_viva(client, headers, project_id, answer=GOOD_ANSWER, count=3):
    started = _start(client, headers, project_id, count)
    session_id = started["session"]["id"]
    assert started["question"]["question_text"]
    assert "expected_answer" not in started["question"]  # no answer leakage
    evaluations = []
    current = started["session"]["current_question"]
    completed = False
    for _ in range(15):
        response = client.post(
            f"/api/viva/{session_id}/answer",
            headers=headers,
            json={"answer_text": answer, "input_type": "text"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        if body["evaluation"]:
            evaluations.append(body["evaluation"])
            assert body["evaluation"]["reference_answer"]
        if body["completed"]:
            completed = True
            assert body["report"]
            break
        assert body["next_question"]
    assert completed
    assert len(evaluations) >= count
    return session_id, evaluations, body["report"]


def test_full_mock_viva_flow(client, user_headers, ready_project):
    session_id, evaluations, report = _run_viva(client, user_headers, ready_project["id"])
    assert report["overall_score"] == pytest.approx(
        sum(item["total_score"] for item in evaluations) / len(evaluations), abs=0.2
    )
    assert report["summary"]
    assert report["improvement_plan"]

    report_response = client.get(f"/api/viva/{session_id}/report", headers=user_headers)
    assert report_response.status_code == 200
    assert len(report_response.json()["turns"]) == len(evaluations)

    detail = client.get(f"/api/viva/{session_id}", headers=user_headers)
    assert detail.status_code == 200
    assert detail.json()["status"] == "completed"
    assert detail.json()["answered_count"] == len(evaluations)

    history = client.get("/api/viva/sessions", headers=user_headers)
    assert history.status_code == 200
    assert history.json()["total"] == 1

    # Stored evaluations are retrievable and access-controlled.
    evaluations_list = client.get("/api/evaluation", headers=user_headers)
    assert evaluations_list.status_code == 200
    assert evaluations_list.json()["total"] == len(evaluations)
    answer_id = evaluations_list.json()["items"][0]["answer_id"]
    single = client.get(f"/api/evaluation/{answer_id}", headers=user_headers)
    assert single.status_code == 200
    assert single.json()["question"]["question_text"]


def test_pause_resume_and_report_guard(client, user_headers, ready_project):
    started = _start(client, user_headers, ready_project["id"])
    session_id = started["session"]["id"]

    early_report = client.get(f"/api/viva/{session_id}/report", headers=user_headers)
    assert early_report.status_code == 409

    paused = client.post(f"/api/viva/{session_id}/pause", headers=user_headers)
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"

    blocked = client.post(
        f"/api/viva/{session_id}/answer",
        headers=user_headers,
        json={"answer_text": GOOD_ANSWER},
    )
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "session_paused"

    resumed = client.post(f"/api/viva/{session_id}/resume", headers=user_headers)
    assert resumed.status_code == 200
    assert resumed.json()["status"] == "active"

    ended = client.post(f"/api/viva/{session_id}/end", headers=user_headers)
    assert ended.status_code == 200
    assert ended.json()["summary"]

    report = client.get(f"/api/viva/{session_id}/report", headers=user_headers)
    assert report.status_code == 200


def test_duplicate_active_session_is_blocked(client, user_headers, ready_project):
    _start(client, user_headers, ready_project["id"])
    duplicate = client.post(
        "/api/viva/start",
        headers=user_headers,
        json={"project_id": ready_project["id"], "question_count": 3},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "active_session_exists"


def test_analytics_matches_stored_scores(client, user_headers, ready_project):
    session_id, evaluations, report = _run_viva(
        client, user_headers, ready_project["id"], answer=GOOD_ANSWER, count=4
    )
    dashboard = client.get(
        f"/api/analytics/dashboard?project_id={ready_project['id']}", headers=user_headers
    )
    assert dashboard.status_code == 200
    data = dashboard.json()
    expected_average = round(sum(item["total_score"] for item in evaluations) / len(evaluations), 1)
    assert data["summary"]["total_sessions"] == 1
    assert data["summary"]["total_questions"] == len(evaluations)
    assert data["summary"]["average_score"] == pytest.approx(expected_average, abs=0.1)
    assert data["summary"]["highest_answer_score"] >= data["summary"]["average_score"]
    assert len(data["trend"]) == 1
    assert data["trend"][0]["session_id"] == session_id
    assert data["criteria_scores"]
    assert data["category_scores"]

    topics = client.get("/api/analytics/topics", headers=user_headers)
    assert topics.status_code == 200
    assert "category_scores" in topics.json()

    performance = client.get("/api/analytics/performance", headers=user_headers)
    assert performance.status_code == 200


def test_recommendations_are_generated_from_performance(client, user_headers, ready_project):
    _run_viva(client, user_headers, ready_project["id"], answer="We used a decision tree.", count=3)

    generated = client.post(
        "/api/recommendations/generate",
        headers=user_headers,
        json={"project_id": ready_project["id"]},
    )
    assert generated.status_code == 200, generated.text
    body = generated.json()
    assert body["recommendations"]
    assert body["recommended_difficulty"] in {"basic", "intermediate", "advanced", "mixed"}
    assert body["context"]["attempts"] > 0
    for rec in body["recommendations"]:
        assert rec["topic"]
        assert rec["recommendation"]
        assert rec["source"] in {"heuristic", "gemini"}

    listed = client.get("/api/recommendations", headers=user_headers)
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    rec_id = body["recommendations"][0]["id"]
    updated = client.patch(
        f"/api/recommendations/{rec_id}", headers=user_headers, json={"status": "done"}
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "done"

    done_only = client.get("/api/recommendations?status=done", headers=user_headers)
    assert done_only.status_code == 200
    assert all(item["status"] == "done" for item in done_only.json()["items"])


def test_user_cannot_access_other_users_data(
    client, user_headers, second_user_headers, ready_project
):
    documents = client.get(
        f"/api/documents?project_id={ready_project['id']}", headers=user_headers
    ).json()
    assert documents
    document_id = documents[0]["id"]

    assert client.get(f"/api/projects/{ready_project['id']}", headers=second_user_headers).status_code == 404
    assert client.get(f"/api/documents/{document_id}/status", headers=second_user_headers).status_code == 404
    upload = client.post(
        "/api/documents/upload",
        headers=second_user_headers,
        data={"project_id": str(ready_project["id"])},
        files={"file": ("x.txt", b"hello", "text/plain")},
    )
    assert upload.status_code == 404

    started = _start(client, user_headers, ready_project["id"])
    session_id = started["session"]["id"]
    assert client.get(f"/api/viva/{session_id}", headers=second_user_headers).status_code == 404
    assert (
        client.post(
            f"/api/viva/{session_id}/answer",
            headers=second_user_headers,
            json={"answer_text": GOOD_ANSWER},
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/analytics/dashboard?project_id={ready_project['id']}",
            headers=second_user_headers,
        ).status_code
        == 404
    )
