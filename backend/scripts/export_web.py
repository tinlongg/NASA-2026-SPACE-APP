#!/usr/bin/env python3
"""Export the canonical corpus and real demo answers to the standalone web adapter.

Run after build_index.py and export_fallback.py. --check detects stale web snapshots.
No API key is read; no answers or sources are authored by this script.
"""
import argparse
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
from app.config import DISCLAIMER, load_settings
from app.llm import SYSTEM_PROMPT
from app.main import NO_SUPPORT_ANSWER
from app.retrieval import Index, STOPWORDS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    settings = load_settings()
    index = Index.load(settings.manifest_path, settings.chunks_path)
    data = {"sources": [vars(source) for source in index.sources.values()],
            "chunks": [{"chunkId": c.chunk_id, "sourceId": c.source_id,
                        "sectionOrPage": c.section_or_page, "text": c.text,
                        "terms": dict(index._term_counts[i]), "length": index._lengths[i]}
                       for i, c in enumerate(index.chunks)],
            "idf": index._idf, "averageLength": index._avg_length,
            "stopwords": sorted(STOPWORDS), "minScore": settings.min_score, "topK": settings.top_k,
            "disclaimer": DISCLAIMER, "noSupport": NO_SUPPORT_ANSWER, "prompt": SYSTEM_PROMPT}
    outputs = {
        ROOT / "web/research-data.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        ROOT / "web/dist/fallback.json": (ROOT / "ios/CrewSafety/Resources/MuseFallbackAnswers.json").read_text(),
    }
    for path, content in outputs.items():
        if args.check:
            if not path.exists() or path.read_text() != content:
                sys.exit(f"Stale snapshot: {path.relative_to(ROOT)}; run scripts/export_web.py")
        else:
            path.write_text(content, encoding="utf-8")
            print(f"Exported {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
