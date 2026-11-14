#!/usr/bin/env python3
"""Chunk the documents listed in sources/manifest.json into sources/chunks.jsonl.

Usage:  python scripts/build_index.py [--sources sources]

Supports .txt, .md and .html. PDFs need `pip install pypdf`.
Only documents the team has placed in sources/raw/ and listed in the manifest are indexed.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

TARGET_WORDS = 200
Section = tuple[str | None, str]


class _HTMLText(HTMLParser):
    HEADINGS = {"h1", "h2", "h3", "h4"}
    SKIP = {"script", "style", "nav", "footer", "header", "noscript"}
    BLOCK = {"p", "div", "li", "br", "tr", "section", "article"}

    def __init__(self) -> None:
        super().__init__()
        self.sections: list[Section] = []
        self._heading: str | None = None
        self._buffer: list[str] = []
        self._heading_buffer: list[str] | None = None
        self._skip_depth = 0

    def _flush(self) -> None:
        text = re.sub(r"[ \t]+", " ", "".join(self._buffer)).strip()
        if text:
            self.sections.append((self._heading, text))
        self._buffer = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip_depth += 1
        elif tag in self.HEADINGS:
            self._flush()
            self._heading_buffer = []
        elif tag in self.BLOCK:
            self._buffer.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip_depth:
            self._skip_depth -= 1
        elif tag in self.HEADINGS and self._heading_buffer is not None:
            self._heading = " ".join("".join(self._heading_buffer).split()) or None
            self._heading_buffer = None

    def handle_data(self, data):
        if self._skip_depth:
            return
        if self._heading_buffer is not None:
            self._heading_buffer.append(data)
        else:
            self._buffer.append(data)

    def close(self):
        super().close()
        self._flush()


def sections_from_text(text: str) -> list[Section]:
    sections: list[Section] = []
    heading: str | None = None
    lines: list[str] = []

    def flush() -> None:
        body = "\n".join(lines).strip()
        if body:
            sections.append((heading, body))
        lines.clear()

    for line in text.splitlines():
        stripped = line.strip()
        is_markdown_heading = stripped.startswith("#")
        is_caps_heading = 3 < len(stripped) < 80 and stripped.isupper() and not stripped.endswith(".")
        if is_markdown_heading or is_caps_heading:
            flush()
            heading = stripped.lstrip("#").strip() or None
        else:
            lines.append(line)
    flush()
    return sections


def sections_from_file(path: Path) -> list[Section]:
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md"):
        return sections_from_text(path.read_text(encoding="utf-8", errors="replace"))
    if suffix in (".html", ".htm"):
        parser = _HTMLText()
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
        parser.close()
        return parser.sections
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            sys.exit(f"{path.name}: PDF support needs `pip install pypdf`.")
        reader = PdfReader(str(path))
        return [(f"p. {i}", page.extract_text() or "") for i, page in enumerate(reader.pages, start=1)]
    sys.exit(f"{path.name}: unsupported file type {suffix}")


def split_words(text: str, target: int = TARGET_WORDS) -> list[str]:
    paragraphs = [" ".join(p.split()) for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    count = 0
    for paragraph in paragraphs:
        words = paragraph.split()
        if count and count + len(words) > target * 1.25:
            chunks.append(" ".join(current))
            current, count = [], 0
        # A single very long paragraph is split on word count.
        while len(words) > target * 1.5:
            chunks.append(" ".join(words[:target]))
            words = words[target:]
        current.append(" ".join(words))
        count += len(words)
    if current:
        chunks.append(" ".join(current))
    return [c for c in chunks if len(c.split()) >= 8]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", default=str(Path(__file__).resolve().parent.parent / "sources"))
    args = parser.parse_args()
    sources = Path(args.sources)
    manifest = json.loads((sources / "manifest.json").read_text(encoding="utf-8"))
    if not manifest:
        print("manifest.json is empty. Add the team's verified NASA documents to sources/raw/ and list them "
              "in manifest.json (format: docs/EXECUTION_PLAN.md section 5.5).")
    rows = []
    for entry in manifest:
        path = sources / entry["file"]
        if not path.exists():
            sys.exit(f"manifest entry '{entry['id']}' points at a missing file: {path}")
        n = 0
        for heading, body in sections_from_file(path):
            for text in split_words(body):
                n += 1
                rows.append({"chunkId": f"{entry['id']}-{n:04d}", "sourceId": entry["id"],
                             "sectionOrPage": heading, "text": text})
        print(f"{entry['id']}: {n} chunks")
    with (sources / "chunks.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} chunks from {len(manifest)} documents to {sources / 'chunks.jsonl'}")


if __name__ == "__main__":
    main()
