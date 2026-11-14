"""Keyword retrieval (BM25) over the chunked source documents. Pure Python, no dependencies."""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

_TOKEN = re.compile(r"[a-z0-9]+")

STOPWORDS = frozenset(
    """a about above after again all also am an and any are as at be because been before being below between both
    but by can could did do does doing down during each few for from further had has have having he her here hers
    him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over
    own same she should so some such than that the their them then there these they this those through to too under
    until up very was we were what when where which while who whom why will with would you your tell say says said
    nasa recommend recommends recommended""".split()
)


def tokenize(text: str) -> list[str]:
    tokens = []
    for token in _TOKEN.findall(text.lower()):
        if token in STOPWORDS or len(token) < 2:
            continue
        # Very light stemming so "exercises"/"exercising" match "exercise".
        for suffix in ("ing", "es", "s"):
            if len(token) > len(suffix) + 3 and token.endswith(suffix):
                token = token[: -len(suffix)]
                break
        if token.endswith("e") and len(token) > 4:
            token = token[:-1]
        tokens.append(token)
    return tokens


@dataclass(frozen=True)
class Source:
    id: str
    title: str
    url: str


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    source_id: str
    section_or_page: str | None
    text: str


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    source: Source
    score: float


class Index:
    """BM25 index. `search` returns nothing when no chunk clears `min_score`."""

    K1 = 1.5
    B = 0.75

    def __init__(self, sources: list[Source], chunks: list[Chunk]):
        self.sources = {s.id: s for s in sources}
        # A chunk whose source is not in the manifest can never be cited, so it is not indexed.
        self.chunks = [c for c in chunks if c.source_id in self.sources]
        self._term_counts = [Counter(tokenize(c.text)) for c in self.chunks]
        self._lengths = [sum(tc.values()) for tc in self._term_counts]
        self._avg_length = (sum(self._lengths) / len(self._lengths)) if self._lengths else 0.0
        document_frequency: Counter[str] = Counter()
        for tc in self._term_counts:
            document_frequency.update(tc.keys())
        n = len(self.chunks)
        self._idf = {t: math.log(1 + (n - df + 0.5) / (df + 0.5)) for t, df in document_frequency.items()}

    @classmethod
    def load(cls, manifest_path: Path, chunks_path: Path) -> "Index":
        sources: list[Source] = []
        chunks: list[Chunk] = []
        if manifest_path.exists():
            for entry in json.loads(manifest_path.read_text(encoding="utf-8")):
                sources.append(Source(id=entry["id"], title=entry["title"], url=entry["url"]))
        if chunks_path.exists():
            for line in chunks_path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                row = json.loads(line)
                chunks.append(Chunk(chunk_id=row["chunkId"], source_id=row["sourceId"],
                                    section_or_page=row.get("sectionOrPage"), text=row["text"]))
        return cls(sources, chunks)

    @property
    def document_count(self) -> int:
        return len({c.source_id for c in self.chunks})

    def search(self, question: str, top_k: int, min_score: float) -> list[Hit]:
        terms = tokenize(question)
        if not terms or not self.chunks:
            return []
        hits: list[Hit] = []
        for i, chunk in enumerate(self.chunks):
            counts = self._term_counts[i]
            score = 0.0
            for term in set(terms):
                tf = counts.get(term, 0)
                if tf == 0:
                    continue
                norm = 1 - self.B + self.B * (self._lengths[i] / self._avg_length if self._avg_length else 1)
                score += self._idf[term] * (tf * (self.K1 + 1)) / (tf + self.K1 * norm)
            if score >= min_score:
                hits.append(Hit(chunk=chunk, source=self.sources[chunk.source_id], score=score))
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:top_k]
