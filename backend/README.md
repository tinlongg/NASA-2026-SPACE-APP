# CrewSafety backend

The backend also serves the website at `/dashboard/` and pairs it with the iPhone app through `/sync/`. See [Connect iOS and the website locally](../docs/IOS_WEB_CONNECTION.md). Local camera detection remains independent of the server; the sync API shares only opted-in crew data, events and labeled telemetry.

FastAPI service for crew sync (`/sync/*`), the local web dashboard (`/dashboard/`) and `GET /health`.
MUSE is not here: it runs in the web Worker (`web/worker.mjs`) and only does image recognition (journal photos and
station camera frames) and journal-entry analysis. There is no document question-and-answer.

## Setup

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
.venv/bin/python -m pytest -q
```

```bash
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
curl -s localhost:8000/health
```

**From an iPhone:** phone and laptop on the same network, then in the app set the backend address to
`http://<laptop LAN IP>:8000`. Venue Wi-Fi often blocks device-to-device traffic; a phone hotspot is
the usual workaround. The Simulator can use `http://localhost:8000`.
