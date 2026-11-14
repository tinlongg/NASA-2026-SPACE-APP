"""All tests run against tests/fixtures, which is clearly artificial text, never the real corpus."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import DISCLAIMER, Settings
from app.main import create_app
from app.retrieval import Index, tokenize

BACKEND = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="session")
def sources(tmp_path_factory) -> Path:
    target = tmp_path_factory.mktemp("sources")
    shutil.copytree(FIXTURES, target, dirs_exist_ok=True)
    subprocess.run([sys.executable, str(BACKEND / "scripts" / "build_index.py"), "--sources", str(target)], check=True)
    return target


def settings_for(sources: Path) -> Settings:
    return Settings(sources_dir=sources, min_score=1.0, top_k=4, llm_model="unused", llm_enabled=False)


@pytest.fixture()
def client(sources) -> TestClient:
    return TestClient(create_app(settings_for(sources)))


def manifest_pairs() -> set[tuple[str, str]]:
    return {(e["title"], e["url"]) for e in json.loads((FIXTURES / "manifest.json").read_text())}


def test_index_build_keeps_sections_and_skips_html_chrome(sources):
    rows = [json.loads(line) for line in (sources / "chunks.jsonl").read_text().splitlines()]
    assert {r["sectionOrPage"] for r in rows} == {
        "Fixture section on exercise", "Fixture section on sleep", "Fixture section on isolation"}
    assert not any("menu links" in r["text"] for r in rows)


def test_health(client):
    body = client.get("/health").json()
    assert body == {"status": "ok", "documents": 2, "chunks": 3, "llm": "extractive_only"}


def test_relevant_question_returns_citations_from_the_manifest(client):
    response = client.post("/chat", json={"question": "How do crew members exercise?", "context": "general_wellness"})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"answer", "citations", "disclaimer", "grounded", "answerMode"}
    assert body["grounded"] is True and body["answerMode"] == "extractive"
    assert body["disclaimer"] == DISCLAIMER
    assert body["citations"], "expected at least one citation"
    for citation in body["citations"]:
        assert (citation["title"], citation["url"]) in manifest_pairs()
    assert body["citations"][0]["sectionOrPage"] == "Fixture section on exercise"
    assert "treadmill" in body["answer"]


def test_irrelevant_question_is_ungrounded_with_no_citations(client):
    body = client.post("/chat", json={"question": "What is the capital of France?"}).json()
    assert body["grounded"] is False
    assert body["citations"] == []
    assert "do not contain" in body["answer"]


def test_unknown_context_is_accepted(client):
    assert client.post("/chat", json={"question": "sleep schedule", "context": "something_else"}).status_code == 200


@pytest.mark.parametrize("payload", [{"question": ""}, {"question": "   "}, {"question": "x" * 501}, {}, {"question": 5}])
def test_invalid_questions_return_400_with_error_body(client, payload):
    response = client.post("/chat", json=payload)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_question"


def test_500_character_question_is_accepted(client):
    assert client.post("/chat", json={"question": "sleep " * 83 + "ab"}).status_code == 200


def test_retrieval_failure_returns_503(sources):
    app = create_app(settings_for(sources))

    class Broken:
        def search(self, *args, **kwargs):
            raise RuntimeError("boom")

    app.state.index = Broken()
    response = TestClient(app).post("/chat", json={"question": "exercise"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


def test_generated_mode_uses_generator_but_citations_come_from_metadata(sources):
    def fake(question, hits):
        return "Generated text that mentions https://invented.example and a made-up title."

    body = TestClient(create_app(settings_for(sources), generator=fake)).post(
        "/chat", json={"question": "isolation and family calls"}).json()
    assert body["answerMode"] == "generated"
    assert body["answer"].startswith("Generated text")
    for citation in body["citations"]:
        assert (citation["title"], citation["url"]) in manifest_pairs()


def test_generator_failure_falls_back_to_extractive(sources):
    def failing(question, hits):
        raise RuntimeError("model unavailable")

    response = TestClient(create_app(settings_for(sources), generator=failing)).post(
        "/chat", json={"question": "sleep schedule lighting"})
    assert response.status_code == 200
    body = response.json()
    assert body["answerMode"] == "extractive" and body["grounded"] is True


def test_generator_is_not_called_when_nothing_is_retrieved(sources):
    def exploding(question, hits):
        raise AssertionError("must not be called")

    body = TestClient(create_app(settings_for(sources), generator=exploding)).post(
        "/chat", json={"question": "quantum chromodynamics"}).json()
    assert body["grounded"] is False


def test_empty_corpus_is_always_ungrounded(tmp_path):
    (tmp_path / "manifest.json").write_text("[]")
    client = TestClient(create_app(settings_for(tmp_path)))
    assert client.get("/health").json()["chunks"] == 0
    assert client.post("/chat", json={"question": "exercise"}).json()["grounded"] is False


def test_chunks_without_a_manifest_entry_are_never_served(tmp_path):
    (tmp_path / "manifest.json").write_text("[]")
    (tmp_path / "chunks.jsonl").write_text(json.dumps(
        {"chunkId": "x-1", "sourceId": "ghost", "sectionOrPage": None, "text": "exercise treadmill exercise"}) + "\n")
    assert Index.load(tmp_path / "manifest.json", tmp_path / "chunks.jsonl").search("exercise", 4, 0.0) == []


def test_tokenizer_drops_stopwords_and_stems():
    assert tokenize("What does NASA recommend about exercising?") == ["exercis"]
    assert tokenize("exercise") == ["exercis"]


def test_committed_corpus_state_is_consistent():
    """Every indexed source must have a local document and a source URL."""
    manifest = json.loads((BACKEND / "sources" / "manifest.json").read_text())
    for entry in manifest:
        assert (BACKEND / "sources" / entry["file"]).exists(), entry["id"]
        assert entry["url"].startswith("http")
