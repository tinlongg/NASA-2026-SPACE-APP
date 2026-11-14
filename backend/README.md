# MUSE research service

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

The user-selected corpus now contains five NASA source records and eight passages, including OSDR study OSD-946. Opened sources, included sections, and independent-review status are recorded in `docs/SOURCES.md`. New sources must still come from the team and be opened and checked; never invent metadata. A second human reviewer has not yet signed off this initial set.

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
- **Generated:** set server-side `META_API_KEY` (see `.env.example`). The user-selected default is
  `MUSE_LLM_PROVIDER=meta`, `MUSE_LLM_MODEL=muse-spark-1.3`. Only the question and retrieved passages go
  to Meta. On model errors, empty/truncated output, or the 12-second timeout, return extractive mode.
  The Meta adapter is covered by request/error mocks; live hosted verification is tracked in HANDOFF.
  `MUSE_LLM_ENABLED=0` disables generation explicitly. The existing optional Anthropic adapter remains
  available with `MUSE_LLM_PROVIDER=anthropic`, `MUSE_LLM_MODEL` and `ANTHROPIC_API_KEY` set explicitly.

Citations always come from `manifest.json` and chunk metadata, never from model output. If nothing
relevant is retrieved the response has `grounded: false` and no citations.

## Demo-mode answers for the app

With the real corpus indexed and the service running:

```bash
.venv/bin/python scripts/export_fallback.py --questions sources/demo-questions.txt
```

`questions.txt` has one `keyword1,keyword2 | Question text` per line. The script writes
`ios/CrewSafety/Resources/MuseFallbackAnswers.json` from the service's real responses.


Six extractive replies are currently bundled. To regenerate after a source change, run these from
`backend/`, restarting the running service after rebuilding the index:

```bash
.venv/bin/python scripts/build_index.py
```

In a second terminal, start a fresh service (`MUSE_LLM_ENABLED=0` for reproducible excerpts), then:

```bash
.venv/bin/python scripts/export_fallback.py --questions sources/demo-questions.txt
.venv/bin/python scripts/export_web.py
.venv/bin/python scripts/export_web.py --check
.venv/bin/python -m pytest -q
```

The exporter copies the same demo file into `web/dist/fallback.json` and writes `web/research-data.json`
with chunks, scoring metadata, tokenizer stopwords, and the generation prompt. No credentials enter
these snapshots. The browser deployment is a JavaScript adapter because Sites runs Workers; Python
remains canonical. The parity test requires Node 20+ and skips with an explicit reason if unavailable.
After regeneration, run the web tests/build and deploy the new snapshot. Do not hand-edit generated
snapshots or demo answers. Export scripts are run locally, never during a visitor's request.

The exact `/chat` response remains `{answer,citations,disclaimer,grounded,answerMode}`. Citation entries
remain `{title,url,sectionOrPage}`. Unknown contexts are treated as `general_wellness`. OSDR ground-study
metadata is not a diagnosis, personal training plan, or evidence validating the camera heuristic.
