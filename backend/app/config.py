"""Environment configuration. No secrets live in the repository."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

DISCLAIMER = "General information only; not medical diagnosis or emergency guidance."
MAX_QUESTION_LENGTH = 500


@dataclass(frozen=True)
class Settings:
    sources_dir: Path
    min_score: float
    top_k: int
    llm_model: str
    llm_enabled: bool

    @property
    def manifest_path(self) -> Path:
        return self.sources_dir / "manifest.json"

    @property
    def chunks_path(self) -> Path:
        return self.sources_dir / "chunks.jsonl"

    @property
    def llm_configured(self) -> bool:
        has_credential = bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))
        return self.llm_enabled and has_credential


def load_settings() -> Settings:
    sources = Path(os.environ.get("MUSE_SOURCES_DIR", "sources"))
    if not sources.is_absolute():
        sources = BACKEND_DIR / sources
    return Settings(
        sources_dir=sources,
        min_score=float(os.environ.get("MUSE_MIN_SCORE", "1.0")),
        top_k=int(os.environ.get("MUSE_TOP_K", "4")),
        llm_model=os.environ.get("MUSE_LLM_MODEL", "claude-opus-5-5"),
        llm_enabled=os.environ.get("MUSE_LLM_ENABLED", "1") not in ("0", "false", "False", ""),
    )
