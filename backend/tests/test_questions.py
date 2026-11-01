"""Question generation, follow-up adaptation and duplicate prevention."""
from __future__ import annotations

from app.services.question_service import CATEGORIES, is_duplicate, resolve_difficulty, select_categories


def test_select_categories_spreads_evenly():
    selected = select_categories(CATEGORIES, 6)
    assert len(selected) == 6
    assert len(set(selected)) == 6


def test_duplicate_detection():
    existing = ["Explain how the decision tree model works in your project."]
    assert is_duplicate("Explain how your decision tree model works in this project.", existing)
    assert not is_duplicate("Describe your PostgreSQL database schema and indexes.", existing)


def test_difficulty_cycle():
    assert resolve_difficulty("mixed", 0) == "basic"
    assert resolve_difficulty("mixed", 1) == "intermediate"
    assert resolve_difficulty("advanced", 0) == "advanced"


def test_generate_questions_api(client, user_headers, ready_project):
    response = client.post(
        "/api/ai/generate-questions",
        headers=user_headers,
        json={
            "project_id": ready_project["id"],
            "difficulty": "mixed",
            "count": 8,
            "categories": ["Algorithms and Models", "Database Design", "Testing"],
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["questions"]) == 8
    questions = [item["question"] for item in payload["questions"]]
    assert len(set(questions)) == len(questions)
    for item in payload["questions"]:
        assert item["category"] in {"Algorithms and Models", "Database Design", "Testing"}
        assert item["expected_answer"]
        assert item["difficulty"] in {"basic", "intermediate", "advanced"}
        assert "sources" in item["source_reference"]


def test_question_generation_requires_ready_document(client, user_headers, project):
    response = client.post(
        "/api/ai/generate-questions",
        headers=user_headers,
        json={"project_id": project["id"], "count": 4},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "no_ready_documents"


def test_followup_adapts_to_weak_answer(client, user_headers, ready_project):
    response = client.post(
        "/api/ai/generate-followup",
        headers=user_headers,
        json={
            "project_id": ready_project["id"],
            "question": "Which algorithm did you use?",
            "answer": "We used something for prediction.",
            "score": 30,
            "category": "Algorithms and Models",
            "difficulty": "advanced",
            "missing_concepts": ["decision tree", "interpretability"],
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["question"]
    assert payload["difficulty"] == "basic"
    assert "decision tree" in payload["question"].lower() or "step back" in payload["question"].lower()


def test_followup_deepens_strong_answer(client, user_headers, ready_project):
    response = client.post(
        "/api/ai/generate-followup",
        headers=user_headers,
        json={
            "project_id": ready_project["id"],
            "question": "Which algorithm did you use?",
            "answer": (
                "We used an interpretable decision tree with depth six and five-fold cross-validation "
                "because it handles non-linear relationships and supports clear explanations."
            ),
            "score": 92,
            "category": "Algorithms and Models",
            "difficulty": "intermediate",
            "missing_concepts": [],
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["difficulty"] == "advanced"
    assert payload["is_followup"] is True
