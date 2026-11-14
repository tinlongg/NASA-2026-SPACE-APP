# MUSE research service

The backend also serves the website at `/dashboard/` and pairs it with the iPhone app through `/sync/`. See [Connect iOS and the website locally](../docs/IOS_WEB_CONNECTION.md). Local camera detection remains independent of the server; the sync API shares only opted-in crew data, events and labeled telemetry.

FastAPI service that answers wellness questions from a small curated set of NASA documents and
returns citations. Contract: `docs/EXECUTION_PLAN.md` section 5.3.

## Setup

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/python -m pytest -q
```

## Add the source documents

Nothing is bundled. The team supplies the documents; do not add a source nobody has opened and checked.

1. Save each document under `sources/raw/` as `.txt`, `.md` or `.html` (`.pdf` needs `pip install pypdf`).
2. List it in `sources/manifest.json`:
   ```json
   [{"id": "short-id", "title": "Exact document title", "url": "https://…", "publisher": "NASA",
     "file": "raw/filename.html", "retrievedOn": "YYYY-MM-DD", "verifiedBy": null}]
   ```
3. Build the index: `.venv/bin/python scripts/build_index.py`
4. Record the document in `docs/SOURCES.md`.

## Run

```bash
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```bash
curl -s localhost:8000/health
```

```bash
curl -s -X POST localhost:8000/chat -H 'Content-Type: application/json' -d '{"question":"How do crews exercise on long missions?","context":"general_wellness"}'
```

**From an iPhone:** phone and laptop on the same network, then in the app set the backend address to
`http://<laptop LAN IP>:8000`. Venue Wi-Fi often blocks device-to-device traffic; a phone hotspot is
the usual workaround. The Simulator can use `http://localhost:8000`.

## Answer modes

- **Extractive (default, no key needed):** quotes the top retrieved passages verbatim.
- **Generated:** set `ANTHROPIC_API_KEY` in the environment (see `.env.example`). Claude writes a short
  answer from the retrieved passages only. On any model error or timeout the service falls back to
  extractive. This path has not been exercised against the live API yet.

Citations always come from `manifest.json` and chunk metadata, never from model output. If nothing
relevant is retrieved the response has `grounded: false` and no citations.

## Demo-mode answers for the app

With the real corpus indexed and the service running:

```bash
.venv/bin/python scripts/export_fallback.py --questions questions.txt
```

`questions.txt` has one `keyword1,keyword2 | Question text` per line. The script writes
`ios/CrewSafety/Resources/MuseFallbackAnswers.json` from the service's real responses.
