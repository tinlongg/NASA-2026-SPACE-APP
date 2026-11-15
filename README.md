# CrewSafety — NASA Space Apps 2026

A native SwiftUI iPhone prototype for a **simulated** space crew: a crew dashboard,
camera-based possible-unresponsive alerts with an "Are you OK?" check-in, a research assistant (MUSE) that answers from curated NASA
documents and shows its sources, and an on-device wellness journal.

**Not a medical device.** Detections mean a crew member *stopped moving*, from a simple heuristic. Heart-rate values
are simulated and labelled. Journal summaries list themes you wrote about; they are not assessments.

## Setting and detection

The crew is aboard a space station, in microgravity. Nobody falls there, so the camera does not look for
falls. It looks for a crew member who **stops moving** while in view:

- Pose tracking (Apple Vision on iPhone, MediaPipe in the browser) gives head, shoulder, elbow, wrist,
  hip, knee and ankle positions.
- Each joint is measured relative to the torso centre, rotated so the torso points up and scaled by
  torso length. Drifting across the frame or a limp body slowly tumbling is therefore *not* movement.
- If no joint moves more than 0.25 torso lengths for **15 seconds** while shoulders and hips are
  tracked, the app raises one *possible unresponsive* event and asks "Are you OK?" (60 s to answer by
  button or voice, then a critical alert). The crew member must move again before another event.
- Leaving the view for more than 2 seconds restarts the timer: out of view is not unresponsive.
- Known limits: sleep, focused reading or holding still on purpose will trigger it; one person; a fixed
  camera; arms hidden from the camera show little movement. Thresholds are starting values, not validated
  on people. All replays are synthetic.

The same rules run in `ios/CrewSafety/Features/Camera/InactivityDetector.swift` and
`web/dist/detector.js`. The synced event type is `possibleUnresponsive`.

## What is here

| Path | What |
| --- | --- |
| `ios/` | Xcode project `CrewSafety.xcodeproj`, app sources, unit tests |
| `backend/` | FastAPI service for MUSE (`POST /chat`, `GET /health`) |
| `web/` | Browser companion for Windows/Mac: webcam pose detection, replay, alerts, paired crew status, accounts and a journal with MUSE reflections; see `web/README.md` |
| `docs/PASSDOWN.md` | **Start here**: current state, verified results, remaining checks and run commands |
| `docs/HANDOFF.md` | Historical status before the station-detector/account changes |
| `docs/BUILD_BRIEF.md` | Original project brief |
| `docs/EXECUTION_PLAN.md` | Architecture, shared contracts, team plan |
| `docs/INTEGRATION_CHECKLIST.md` | What to check on the demo iPhone |
| `docs/DEMO_SCRIPT.md` | 2–3 minute demo with fallbacks |
| `docs/SOURCES.md` | NASA source list, provenance, and review status |

## Run the app

For iPhone-to-website crew status, events, telemetry and shared acknowledgements, follow [the local connection guide](docs/IOS_WEB_CONNECTION.md). The backend serves the connected dashboard at `http://COMPUTER-IP:8000/dashboard/`.

Open `ios/CrewSafety.xcodeproj` in Xcode 16 or later, set your development team and a bundle
identifier under Signing & Capabilities, and run on an iPhone (iOS 17+). The Simulator works for
everything except the live camera; use **Monitor → Test → Synthetic Stops Moving** there.

```bash
cd ios && xcodebuild test -project CrewSafety.xcodeproj -scheme CrewSafety -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

The shipping `CrewSafety` scheme embeds the Apple Watch app, so it requires the watchOS simulator
runtime. For iPhone-only unit tests that skip the Watch app entirely:

```bash
ios/scripts/test-ios-only.sh
```

or directly:

```bash
cd ios && xcodebuild test -project CrewSafetyIOSOnly.xcodeproj -scheme CrewSafety-iOSOnly \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' CODE_SIGNING_ALLOWED=NO
```

`CrewSafetyIOSOnly.xcodeproj` is generated from `ios/project-ios-only.yml`. Regenerate it after adding
Swift files:

```bash
cd ios && xcodegen generate --spec project-ios-only.yml --project . --project-root .
```

## Run the backend

See `backend/README.md`. Short version:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In the app: Dashboard → gear → MUSE mode **Live**, and set the backend address.

## Status

The station detector, browser accounts and journal recall were merged in PR #4 (`19906a1`). SwiftUI
remains primary; the browser companion uses MediaPipe for Windows/Mac testing. Xcode 26.6 and an iOS
26.5 simulator now run on this Mac. Current test results and interactive QA are in
[PASSDOWN.md](docs/PASSDOWN.md).

NASA-grounded MUSE Research remains in iOS, backed by FastAPI `/chat` and six bundled cited demo answers.
It was removed from the website and hosted Worker. The browser has Camera Coach, an optional MUSE
journal reflection, and accounts with server-side journal storage and lexical vector recall. Guest
entries and the native journal stay local unless a browser user explicitly sends or moves an entry.
Optional related account entries can accompany a MUSE reflection when selected. Keys stay server-side.
The five-source NASA corpus still needs independent human review.

Remaining acceptance work:

- Live camera/permission/orientation and sustained monitoring tests on a real iPhone and Windows webcam.
- Physical-device offline tests. The browser caches its shell and offers an explicit camera-model
  download; browser cache storage is not guaranteed to persist.
- Record and review real pose fixtures. All current replay sequences are synthetic.
- Complete independent source verification in `docs/SOURCES.md` and rehearse `docs/DEMO_SCRIPT.md`.

See `docs/PASSDOWN.md` for exact scope, verification, and known limits.
