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
| `docs/SOURCES.md` | NASA source list, provenance, and review status |

## Run the app

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

This revision aligns the native MVP and web companion with the documented research and camera scope.
The SwiftUI app is primary; the web companion is the user-requested
Windows/Mac testing extension. It uses MediaPipe, not Apple's Vision model.

Current verification: 27 backend tests and 29 web tests pass. The backend suite includes ranking parity
between Python and the hosted Worker adapter. Previous handoff reported 40 iOS simulator tests; those
were not rerun during this pass. The current Mac's Xcode installation cannot launch successfully.

MUSE Research now uses five opened NASA sources, including OSDR and study OSD-946, with eight indexed
passages and six exported, cited demo answers. The user selected this source set; independent human
source review is still pending. Optional Camera Coach explains numerical pose summaries through Meta
and is clearly separate from MUSE Research. Secrets remain server-side.

Remaining acceptance work:

- Live camera/permission/orientation and sustained monitoring tests on a real iPhone and Windows webcam.
- Physical-device offline tests. The browser caches its shell and offers an explicit camera-model
  download; browser cache storage is not guaranteed to persist.
- Record and review real pose fixtures. All current replay sequences are synthetic.
- Complete independent source verification in `docs/SOURCES.md` and rehearse `docs/DEMO_SCRIPT.md`.

See `docs/HANDOFF.md` for exact scope, verification, and known limits.
