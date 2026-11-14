# Handoff — CrewSafety

Written 2026-11-14. Read this first if you are picking the project up, whether you are a teammate or
an AI coding agent. It says what exists, what was actually checked, and what to do next.

## Where things stand

The full MVP is on branch **`app/full-mvp`** (not yet merged into `main`). It contains the iOS app with
all five screens and the MUSE backend.

| Piece | State | How it was checked |
| --- | --- | --- |
| Dashboard, navigation, settings | Working | Simulator + unit tests |
| Alerts banner, timeline, acknowledge | Working | Simulator + unit tests |
| Fall detector (pure logic) | Working on generated data | 13 unit tests |
| Replay of a pose sequence → alert | Working | Simulator |
| Live camera + Apple Vision pose | **Compiles, never run** | Needs a real iPhone |
| Simulated heart-rate chart | Working, labelled Simulated | Simulator + unit tests |
| MUSE chat, Live mode | Working against a local backend | Simulator, artificial test corpus |
| MUSE chat, Demo mode | Works but has **no answers bundled** | Unit tests |
| Journal + on-device summary | Working | Simulator + unit tests |
| Backend `/chat`, `/health`, retrieval | Working in extractive mode | 19 pytest tests |
| Backend LLM-generated answers | **Written, never called** | No API key was available |
| NASA source corpus | **Empty** | Team must supply documents |

Test totals at handoff: 40 iOS tests and 19 backend tests, all passing.

## Get it running

**App.** Open `ios/CrewSafety.xcodeproj` in Xcode 16+. Under Signing & Capabilities set your team and
change the bundle identifier (currently the placeholder `org.crewsafety.hackathon.CrewSafety`). Run on
an iPhone with iOS 17+. In the Simulator everything works except the live camera.

```bash
cd ios && xcodebuild test -project CrewSafety.xcodeproj -scheme CrewSafety -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

**Backend.**

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest -q
```

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then in the app: Dashboard → gear → MUSE mode **Live** → backend address `http://<laptop IP>:8000`
(or `http://localhost:8000` in the Simulator).

## What to do next, in priority order

1. **Run live fall detection on a real iPhone.** This is the core of the demo and the least proven
   part. Phone upright on a stand, 2–4 m away, whole body in frame. Expect to tune the thresholds in
   `FallDetectorConfig` (`ios/CrewSafety/Core/Models/PoseTypes.swift`); the current numbers are
   untested starting values. If Vision joint names or orientation are wrong, the fix is in
   `Features/Camera/PoseEstimator.swift` and `CameraService.swift`.
2. **Add real NASA documents.** Follow `backend/README.md` → "Add the source documents". Until this is
   done MUSE correctly answers "no supporting material". Record each source in `docs/SOURCES.md` and
   have a second person verify the title and URL.
3. **Export demo-mode answers** once the corpus exists: `backend/scripts/export_fallback.py`. This
   fills `ios/CrewSafety/Resources/MuseFallbackAnswers.json`, the offline fallback for the demo.
4. **Decide on LLM answers.** Set `ANTHROPIC_API_KEY` in the backend's environment to turn on
   generated answers, then test that path; it has never been called. Without a key the backend quotes
   retrieved passages, which is already demo-able. The provider was my choice, not the brief's; swap
   `backend/app/llm.py` if the team prefers another.
5. **Record real pose fixtures** so Replay shows a person's movement instead of a generated stick
   figure. There is no recorder yet; adding one in `CameraMonitorViewModel` that saves the live
   `PoseFrame` stream as JSON (format in `docs/EXECUTION_PLAN.md` section 5.5) is a small task. Any
   JSON fixture dropped in `ios/CrewSafety/Resources/PoseFixtures/` appears in the Replay menu
   automatically.
6. **Work through `docs/INTEGRATION_CHECKLIST.md` on the demo phone**, then rehearse
   `docs/DEMO_SCRIPT.md`.

## Things that will surprise you

- **The app launches with one unacknowledged sample alert** on Crew Member B, so the banner is orange
  from the start. It comes from `Core/Mocks/SampleData.swift`; remove that event before the demo if you
  want a clean start.
- **Demo mode looks broken but is not.** With an empty fallback file every question returns "No
  precomputed answer". That is deliberate: the app never invents an answer.
- **Xcode folders are synchronised.** Add a Swift file inside `ios/CrewSafety/` and it joins the build
  with no project-file change. If your diff touches `project.pbxproj`, something went wrong.
- **`ios/CrewSafety-Info.plist` sits outside the synced folder on purpose**, so it is not copied twice.
  It holds the default backend URL and the local-network exception.
- **The plan's "one developer per folder" rule was not followed for this pass.** One session wrote all
  five workstreams. The ownership table in `docs/EXECUTION_PLAN.md` section 4 still describes who
  should own what from here on.
- **Screenshots from the Simulator tooling lag by a few seconds**; if you automate it, take a second
  screenshot before concluding a tap did nothing.

## Rules to keep

These come from the brief and are enforced in code and tests; do not relax them.

- Never show simulated, replayed or precomputed content without its badge.
- Never write a NASA title, URL or quotation that did not come from a document the team supplied.
- Detections are "Possible fall". No diagnosis or injury wording anywhere.
- Journal text stays on the device and is never sent to the backend.
- No API keys in the repository or the app.

## Map of the code

| Where | What |
| --- | --- |
| `ios/CrewSafety/Core/` | Shared models, stores, protocols, design system. Change with care; everything depends on it. |
| `ios/CrewSafety/App/` | App entry, tab view, settings, `ServiceFactory.swift` (the one place services are chosen) |
| `ios/CrewSafety/Features/Camera/` | Capture, Vision pose, `HeuristicFallDetector`, replay, monitor screen |
| `ios/CrewSafety/Features/Alerts/` | Banner, timeline, detail |
| `ios/CrewSafety/Features/Telemetry/` | Simulated provider and chart card |
| `ios/CrewSafety/Features/MuseChat/` | Chat screen, `RemoteMuseService`, `DemoMuseService` |
| `ios/CrewSafety/Features/Journal/` | Journal screen, `JournalStore`, `OnDeviceJournalAnalyzer` |
| `ios/CrewSafetyTests/` | Unit tests, one file per area |
| `backend/app/` | `main.py` (endpoints), `retrieval.py` (BM25), `llm.py` (optional Claude call), `schemas.py`, `config.py` |
| `backend/scripts/` | `build_index.py`, `export_fallback.py` |
| `backend/tests/` | pytest suite on an artificial fixture corpus |

## Other documents

- `docs/BUILD_BRIEF.md` — the original brief.
- `docs/EXECUTION_PLAN.md` — architecture, contracts (section 5), per-developer prompts (section 7),
  master agent prompt (section 10). Paste section 10 into a new AI session before asking it to change code.
- `docs/INTEGRATION_CHECKLIST.md`, `docs/DEMO_SCRIPT.md`, `docs/SOURCES.md`, `backend/README.md`.
