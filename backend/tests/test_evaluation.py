"""Answer evaluation tests: correctness ordering, weighted scoring and safeguards."""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.text_utils import weighted_total

QUESTION = "Which algorithm did you use for placement prediction and why?"
EXPECTED = (
    "The project uses a supervised decision tree classifier from scikit-learn because it is "
    "interpretable, handles non-linear feature relationships and supports cross-validation. "
    "Tree depth is limited to six to reduce overfitting, and the model achieved 84 percent accuracy."
)
CORRECT = (
    "We used a supervised decision tree classifier implemented with scikit-learn. We selected it "
    "because the model is interpretable and can capture non-linear relationships. We limited tree "
    "depth to six to reduce overfitting and validated it with cross-validation, reaching 84 percent accuracy."
)
PARTIAL = "We used a decision tree from scikit-learn because it is easy to understand."
INCORRECT = (
    "We used blockchain smart contracts and a generative adversarial network to store the "
    "placement records on a distributed ledger with zero knowledge proofs."
)
SHORT = "decision tree"
ALTERNATIVE = (
    "Our approach is a DT model. We chose it since the resulting rules are explainable, and it "
    "captures nonlinear patterns. Five-fold CV was used and the depth cap prevents overfitting, "
    "with 84% accuracy."
)


def _evaluate(client, headers, project_id: int, answer: str) -> dict:
    response = client.post(
        "/api/evaluation/evaluate",
        headers=headers,
        json={
            "project_id": project_id,
            "question": QUESTION,
            "answer": answer,
            "expected_answer": EXPECTED,
            "category": "Algorithms and Models",
            "difficulty": "intermediate",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_correct_answer_scores_highest(client, user_headers, ready_project):
    payload = _evaluate(client, user_headers, ready_project["id"], CORRECT)
    assert payload["total_score"] >= 60
    assert payload["reference_answer"]
    assert payload["source_references"]
    assert payload["engine"] in {"heuristic", "gemini"}
    assert payload["strengths"]


def test_partial_incorrect_short_and_alternative(client, user_headers, ready_project):
    correct = _evaluate(client, user_headers, ready_project["id"], CORRECT)
    partial = _evaluate(client, user_headers, ready_project["id"], PARTIAL)
    incorrect = _evaluate(client, user_headers, ready_project["id"], INCORRECT)
    short = _evaluate(client, user_headers, ready_project["id"], SHORT)
    alternative = _evaluate(client, user_headers, ready_project["id"], ALTERNATIVE)

    assert correct["total_score"] > partial["total_score"]
    assert partial["total_score"] > short["total_score"]
    assert correct["total_score"] > incorrect["total_score"]
    assert short["total_score"] <= 20
    assert alternative["total_score"] >= 45  # synonyms/alternative phrasing accepted
    assert partial["missing_concepts"]
    assert short["mistakes"]


def test_total_matches_weighted_formula(client, user_headers, ready_project):
    payload = _evaluate(client, user_headers, ready_project["id"], CORRECT)
    recomputed = weighted_total(
        {
            "technical_accuracy": payload["technical_accuracy"],
            "relevance": payload["relevance"],
            "completeness": payload["completeness"],
            "conceptual_understanding": payload["conceptual_understanding"],
            "clarity": payload["clarity"],
        },
        settings.score_weights,
    )
    assert payload["total_score"] == pytest.approx(recomputed, abs=0.15)
    assert abs(sum(settings.score_weights.values()) - 1.0) < 1e-9


def test_empty_answer_scores_zero(client, user_headers, ready_project):
    response = client.post(
        "/api/evaluation/evaluate",
        headers=user_headers,
        json={
            "project_id": ready_project["id"],
            "question": QUESTION,
            "answer": "",
            "expected_answer": EXPECTED,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_score"] == 0
    assert payload["technical_accuracy"] == 0
    assert payload["relevance"] == 0


def test_unknown_project_returns_404(client, user_headers):
    response = client.post(
        "/api/evaluation/evaluate",
        headers=user_headers,
        json={
            "project_id": 9999,
            "question": QUESTION,
            "answer": CORRECT,
            "expected_answer": EXPECTED,
        },
    )
    assert response.status_code == 404
