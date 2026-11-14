"""Wire types. Must match docs/EXECUTION_PLAN.md section 5.3 and the Swift DTOs exactly."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    question: str
    context: str = "general_wellness"


class Citation(BaseModel):
    title: str
    url: str
    sectionOrPage: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    disclaimer: str
    grounded: bool
    answerMode: Literal["generated", "extractive"]


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class HealthResponse(BaseModel):
    status: Literal["ok"]
    documents: int
    chunks: int
    llm: Literal["configured", "extractive_only"]
