"""CrewSafety service: crew sync (/sync), the web dashboard and GET /health."""
from __future__ import annotations

import os
import hashlib
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .sync import make_router


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app() -> FastAPI:
    app = FastAPI(title="CrewSafety service", version="0.2.0")
    app.include_router(make_router(Path(os.environ.get("CREW_SYNC_DB", str(Path(__file__).resolve().parents[1] / "runtime" / "crew-sync.sqlite3")))))
    app.add_middleware(CORSMiddleware,
                       allow_origins=os.environ.get("CREW_WEB_ORIGINS", "http://localhost:4173,http://127.0.0.1:4173").split(","),
                       allow_methods=["GET", "POST", "PUT", "DELETE"],
                       allow_headers=["Authorization", "Content-Type"])
    web_root = Path(__file__).resolve().parents[2] / "web" / "dist"
    if web_root.is_dir():
        app.mount("/dashboard", StaticFiles(directory=web_root, html=True), name="dashboard")

    @app.exception_handler(RequestValidationError)
    async def invalid_body(request: Request, __: RequestValidationError) -> JSONResponse:
        return error_response(422, "invalid_sync_payload", "Invalid crew sync payload.")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    if web_root.is_dir():
        @app.get("/sw.js")
        def service_worker():
            # The Node/Worker build versions this file too. Preserve that guarantee locally.
            assets = sorted(p for p in web_root.rglob("*") if p.is_file() and "server" not in p.relative_to(web_root).parts)
            digest = hashlib.sha256(b"".join(p.read_bytes() for p in assets)).hexdigest()[:16]
            script = (web_root / "sw.js").read_text(encoding="utf-8").replace("__CACHE_VERSION__", f"crewsafety-{digest}")
            return Response(script, media_type="application/javascript", headers={"Cache-Control": "no-cache"})

        # Absolute shell URLs (/fallback.json, /sw.js) remain compatible with the Node website.
        # API routes above always win; /sync data is never in the service-worker asset allowlist.
        app.mount("/", StaticFiles(directory=web_root, html=True), name="web-shell")
    return app


app = create_app()
