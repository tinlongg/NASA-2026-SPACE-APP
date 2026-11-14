"""MUSE research service: POST /chat and GET /health."""
from __future__ import annotations

import logging
from typing import Callable, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import llm
from .config import DISCLAIMER, MAX_QUESTION_LENGTH, Settings, load_settings
from .retrieval import Hit, Index
from .schemas import ChatRequest, ChatResponse, Citation, HealthResponse

logger = logging.getLogger("muse")

NO_SUPPORT_ANSWER = (
    "The curated research documents available to MUSE do not contain material that answers this question, "
    "so no answer is given."
)

Generator = Callable[[str, list[Hit]], str]


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def citations_for(hits: list[Hit]) -> list[Citation]:
    """One citation per distinct (source, section), built only from manifest and chunk metadata."""
    seen: set[tuple[str, Optional[str]]] = set()
    citations: list[Citation] = []
    for hit in hits:
        key = (hit.source.id, hit.chunk.section_or_page)
        if key in seen:
            continue
        seen.add(key)
        citations.append(Citation(title=hit.source.title, url=hit.source.url,
                                  sectionOrPage=hit.chunk.section_or_page))
    return citations


def extractive_answer(hits: list[Hit]) -> str:
    quoted = "\n\n".join(f"“{hit.chunk.text}” — {hit.source.title}" for hit in hits[:2])
    return "The most relevant passages from the curated documents are quoted below, unedited.\n\n" + quoted


def create_app(settings: Optional[Settings] = None, generator: Optional[Generator] = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="MUSE research service", version="0.1.0")
    app.state.settings = settings
    app.state.index = Index.load(settings.manifest_path, settings.chunks_path)

    if generator is None and settings.llm_configured:
        def generator(question: str, hits: list[Hit]) -> str:  # noqa: F811
            return llm.generate(question, hits, model=settings.llm_model, provider=settings.llm_provider)
    app.state.generator = generator

    @app.exception_handler(RequestValidationError)
    async def invalid_body(_: Request, __: RequestValidationError) -> JSONResponse:
        return error_response(400, "invalid_question", "Send JSON with a 'question' string.")

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        index: Index = app.state.index
        return HealthResponse(status="ok", documents=index.document_count, chunks=len(index.chunks),
                              llm="configured" if app.state.generator else "extractive_only")

    @app.post("/chat", response_model=ChatResponse)
    def chat(body: ChatRequest):
        question = body.question.strip()
        if not question:
            return error_response(400, "invalid_question", "The question is empty.")
        if len(question) > MAX_QUESTION_LENGTH:
            return error_response(400, "invalid_question",
                                  f"The question is longer than {MAX_QUESTION_LENGTH} characters.")
        try:
            hits = app.state.index.search(question, top_k=settings.top_k, min_score=settings.min_score)
        except Exception:
            logger.exception("retrieval failed")
            return error_response(503, "service_unavailable", "The research index is unavailable.")

        if not hits:
            return ChatResponse(answer=NO_SUPPORT_ANSWER, citations=[], disclaimer=DISCLAIMER,
                                grounded=False, answerMode="extractive")

        answer, mode = extractive_answer(hits), "extractive"
        if app.state.generator is not None:
            try:
                generated = app.state.generator(question, hits)
                if not isinstance(generated, str) or not generated.strip():
                    raise llm.LLMError("empty response")
                answer, mode = generated.strip(), "generated"
            except Exception as error:  # any generation problem falls back to quoting the passages
                logger.warning("generation failed, using extractive answer (%s)", type(error).__name__)
        return ChatResponse(answer=answer, citations=citations_for(hits), disclaimer=DISCLAIMER,
                            grounded=True, answerMode=mode)

    return app


app = create_app()
