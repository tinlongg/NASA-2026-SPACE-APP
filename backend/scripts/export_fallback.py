#!/usr/bin/env python3
"""Export real answers from the running service into the app's bundled demo-mode file.

Usage:  python scripts/export_fallback.py --questions questions.txt [--url http://localhost:8000]

questions.txt has one line per question:   keyword1,keyword2 | The question text
Only grounded answers are exported. Nothing is written by hand, so every bundled answer and
citation is something the service actually returned from the verified corpus.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_OUT = (Path(__file__).resolve().parents[2] / "ios" / "CrewSafety" / "Resources" / "MuseFallbackAnswers.json")


def ask(base_url: str, question: str) -> dict:
    request = urllib.request.Request(
        base_url.rstrip("/") + "/chat",
        data=json.dumps({"question": question, "context": "general_wellness"}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--questions", required=True)
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    entries = []
    for number, line in enumerate(Path(args.questions).read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if "|" not in line:
            sys.exit(f"line {number}: expected 'keywords | question'")
        keywords, question = (part.strip() for part in line.split("|", 1))
        try:
            result = ask(args.url, question)
        except (urllib.error.URLError, OSError) as error:
            sys.exit(f"line {number}: request failed: {error}")
        if not result.get("grounded") or not result.get("citations"):
            print(f"skipped (not grounded): {question}")
            continue
        entries.append({"id": f"q{number:02d}", "question": question,
                        "keywords": [k.strip().lower() for k in keywords.split(",") if k.strip()],
                        "answer": result["answer"], "citations": result["citations"],
                        "disclaimer": result["disclaimer"]})
        print(f"exported: {question}")
    Path(args.out).write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} answers to {args.out}")


if __name__ == "__main__":
    main()
