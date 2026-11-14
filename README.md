# CrewSafety — NASA Space Apps 2026

A native SwiftUI iPhone prototype for a **simulated** space crew: a crew dashboard, camera-based
possible-fall detection with in-app alerts, a research assistant (MUSE) that answers from curated NASA
documents and shows its sources, and an on-device wellness journal.

**Not a medical device.** Detections are *possible* falls from a simple heuristic. Heart-rate values
are simulated and labelled. Journal summaries list themes you wrote about; they are not assessments.

## What is here

| Path | What |
| --- | --- |
| `ios/` | Xcode project `CrewSafety.xcodeproj`, app sources, unit tests |
| `backend/` | FastAPI service for MUSE (`POST /chat`, `GET /health`) |
| `web/` | Browser testing companion for Windows/Mac: webcam pose detection, replay, alerts, journal; see `web/README.md` |
| `docs/HANDOFF.md` | **Start here**: current state, what is untested, what to do next |
| `docs/BUILD_BRIEF.md` | Original project brief |
| `docs/EXECUTION_PLAN.md` | Architecture, shared contracts, team plan |
| `docs/INTEGRATION_CHECKLIST.md` | What to check on the demo iPhone |
| `docs/DEMO_SCRIPT.md` | 2–3 minute demo with fallbacks |
| `docs/SOURCES.md` | NASA source list (empty until the team adds documents) |

## Run the app

For iPhone-to-website crew status, events, telemetry and shared acknowledgements, follow [the local connection guide](docs/IOS_WEB_CONNECTION.md). The backend serves the connected dashboard at `http://COMPUTER-IP:8000/dashboard/`.

Open `ios/CrewSafety.xcodeproj` in Xcode 16 or later, set your development team and a bundle
identifier under Signing & Capabilities, and run on an iPhone (iOS 17+). The Simulator works for
everything except the live camera; use **Monitor → Replay** there.

```bash
cd ios && xcodebuild test -project CrewSafety.xcodeproj -scheme CrewSafety -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

## Run the backend

See `backend/README.md`. Short version:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In the app: Dashboard → gear → MUSE mode **Live**, and set the backend address.

## Status

Built and verified in the iOS Simulator and by unit tests: dashboard, alerts, replayed possible-fall
detection, simulated telemetry chart, MUSE chat against a local backend, journal with on-device summary.

Not yet done or not yet verified:

- **Live camera detection has never been run on a real iPhone.** The capture and Vision code compiles
  but the Simulator has no camera. The fall thresholds are untuned starting values.
- **No NASA documents are included.** `backend/sources/manifest.json` is empty, so MUSE answers
  "no supporting material" until the team adds verified sources and runs `scripts/build_index.py`.
- **Demo mode has no answers** until `scripts/export_fallback.py` is run against the real corpus.
- **LLM-generated answers are untested.** Without `ANTHROPIC_API_KEY` the backend quotes retrieved
  passages instead (extractive mode), which is what was tested.
- The Replay menu only has generated stick-figure sequences, not recordings of a person.
