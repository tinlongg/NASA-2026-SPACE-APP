# Handoff — CrewSafety

Updated 2026-11-14. Read this before continuing. This revision adds the research/camera alignment to
the native MVP and browser companion. Deployment uses a separate Sites source repository; GitHub
commits and pushes are handled independently.

## Scope and ownership

The original `BUILD_BRIEF.md` and `CREW_SAFETY_HACKATHON.md` remain unchanged. SwiftUI on iPhone is the
primary deliverable. The user additionally requested a public browser companion for Windows testing
and chose Meta as the model provider. This extension does not replace the native acceptance criteria.

This session handles Dev 2's browser camera/replay work, Dev 3's research/backend/source/fallback work,
and Dev 5's integration/QA documentation. Dependencies are the frozen pose thresholds, unchanged Core
models and `/chat` contract. No Swift source, Xcode project, or Core contract was changed. The only
native-app change is the documented content file `Resources/MuseFallbackAnswers.json`.

## Upstream integration

The alignment revision incorporates upstream commit `036d470`, which adds archived OSDR data and
historical dashboard charts. Both dashboard initialization and MUSE/Camera Coach are retained.
The Worker asset map and offline shell include the dashboard module, styles and JSON snapshot.
Its five study records are separate from MUSE's five-document corpus; neither affects local alerts.

## What changed

- MUSE Research and optional Camera Coach are separate. Coach receives a manually submitted numeric
  pose snapshot; research receives a question and retrieved passages. Neither sends images or journal
  entries. The model never creates or acknowledges alerts.
- The team selected NASA HRP pages and added OSDR. Five opened sources supply eight passages. OSD-946
  is a ground bed-rest study, not flight footage or validation of the detector. See `SOURCES.md` for
  exact sections, provenance, and the pending independent reviewer.
- FastAPI supports server-side Meta generation. Missing/failed generation falls back to verbatim
  retrieved excerpts. No relevant retrieval returns `grounded:false` and no citations.
- The hosted Worker implements the same `/chat` and `/health` contract with an exported snapshot of
  the Python index and prompt. This deployment adapter exists because Sites executes JavaScript
  Workers, not Python. FastAPI remains the canonical backend. A cross-runtime test checks rankings;
  `backend/scripts/export_web.py --check` detects stale snapshots.
- Six real extractive service responses were exported into native and browser demo files. Browser
  fallback matches prepared questions exactly and visibly displays Demo mode and the original question.
- Seven browser replay scenarios cover stand, walk, sit, slow descent, fall, and falls 5/20 seconds
  apart. They use generated inputs, not recordings or evidence of real-world sensitivity/specificity.
- A versioned service worker caches the shell and saved answers. An explicit button downloads pinned
  MediaPipe/model assets. API responses and user content are excluded from its cache. System fonts
  remove the external font dependency.

## Verification and limits

| Area | Evidence | Remaining |
| --- | --- | --- |
| Backend | 27 pytest tests pass, including Meta request/failure mocks and Python/JS ranking parity; hosted Meta returned a cited OSDR answer | Human relevance/citation review; native HTTPS integration on device |
| Web | 29 Node tests pass: detector fixtures at 10/15/30/60 FPS, privacy filtering, provider failures, retrieval, demo fallback, offline-cache simulation | Real Windows webcam, browser offline and sustained-session tests |
| Native | Earlier handoff reported 40 passing simulator tests; not rerun here | Current Mac Xcode 16.2 fails to launch on macOS 26.6; repair/upgrade Xcode, then run on iPhone |
| Sources | Official NASA pages opened; OSD-946 metadata verified using NASA's API | Second-person source verification (`verifiedBy` remains null) |
| Live camera | No new real-camera evidence | Permissions, orientation, loss/recovery, low light, multiple people, duration and heat |

Local browser QA also confirmed a synthetic fall alert, an extractive OSDR response, a cached shell
reload with the local server stopped, and a labelled saved OSDR answer. The model-download cache
reported complete; this did not exercise camera inference while disconnected.

Do not turn unit tests or synthetic replay into claims about fall detection on people. No recordings,
phone airplane-mode run, backup demo video, or independent source signoff were produced by this pass.

## Run and regenerate

- Native: open `ios/CrewSafety.xcodeproj` in a working Xcode 16+ install, set signing/team, and run on an
  iOS 17+ iPhone. Use Monitor → Replay when no camera is available.
- Backend: follow `backend/README.md`; defaults to Meta if `META_API_KEY` is supplied, otherwise
  extractive. `MUSE_LLM_ENABLED=0` explicitly disables generation. Do not put real keys in Git.
- Web: `cd web`, `npm test`, `npm start`; open `http://localhost:4173`. The hosted link is
  https://crew-safety-web-lab.xron2245.chatgpt.site (public, as requested).
- After source changes: build the index, restart the backend, export real demo responses, then run
  `scripts/export_web.py` from `backend/`. Rebuild/redeploy the web snapshot. See backend README.

Native clients may use the hosted HTTPS origin as their backend address: the `/chat` wire response is
unchanged. This configuration still needs a device test. Journal data and events remain per-device;
there is no shared remote camera feed or durable crew event database.

## Next acceptance work

1. Repair Xcode and run the unchanged iOS tests; complete physical-device checklist items.
2. Have a different teammate open every source/section and record their name in `SOURCES.md` and the
   manifest. Review all six demo answers against their cited passages.
3. Test Chrome/Edge webcam startup, denial, disconnect, tab hiding, and prepared offline use on Windows.
4. Record at least five real pose fixtures under the documented format; label their provenance and
   evaluate the detector's false alerts/misses. Keep synthetic fixtures clearly labelled.
5. Rehearse the honest synthetic-first demo script; record a backup only after a successful run.

## Rules to retain

Never invent sources or clinical conclusions. Preserve Replay/Simulated/Demo labels. Journal text
stays local. Keys stay on the server. Core and shared wire contracts remain frozen. The operational
status here supersedes stale implementation-status claims in the historical plan, not its requirements.


## Published verification

Sites version 3 was published successfully on 2026-11-14 at
https://crew-safety-web-lab.xron2245.chatgpt.site. Its isolated source commit is
`991be5f7d135d970e4324813285fefa8e544b743`; this is not a GitHub-main commit.
Browser QA on the published site returned a **Live · AI-generated** answer for the prepared bed-rest
study question, with OSD-946 citations and correct ground-study scope. The secret was used only in
the server runtime. Original brief copies, Swift Core, and the Xcode project have no diff.
