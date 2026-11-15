# Crew Safety & Wellness — Hackathon Build Brief

> **Journal direction update (2026-11-15):** The user now requires automatic collective MUSE reflection on website and native iPhone saves. Dated text is sent to the server and Meta with clear disclosure; summaries/sentiment are backend-only. [Current journal contract](JOURNAL.md) overrides older optional-MUSE/on-device-only journal guidance below.

> **Audience:** AI coding assistants and a five-person hackathon team  
> **Primary deliverable:** Native iPhone app in **Swift + SwiftUI**  
> **Status:** Project specification and build checklist; not an assertion that features have been implemented

> **Direction change (2026-11-14): fall detection is scrapped.** The product now targets crew aboard a
> space station, where nobody falls. The camera feature is a *possible-unresponsive* check: it alerts
> when a tracked crew member shows no limb movement for 15 seconds (drifting and tumbling are ignored),
> then runs the same "Are you OK?" check-in. Wherever this document says fall, possible fall, low posture
> or hip drop, read the no-movement check described in `README.md` → *Setting and detection*. The
> event type is `possibleUnresponsive` (was `possibleFall`).

## 1. Mission

Build an iOS prototype that helps a simulated space crew monitor potential safety incidents and access evidence-grounded mental and physical wellness information. Combine camera-based pose analysis, a crew status dashboard, a wellness journal, and a research-grounded assistant (“MUSE”).

### Demo story

1. Open the SwiftUI app to see a crew member and their current status.
2. Start a camera monitoring session.
3. Simulate a fall safely (or replay a prepared test clip). Detect a **possible fall**, then raise an alert.
4. Inspect the timestamp, confidence/heuristic explanation, and acknowledge the alert.
5. Ask MUSE a question about stress, isolation, or physical wellness in space.
6. View a grounded answer with citations to retrieved NASA research.
7. Enter a wellness journal note and view a neutral, non-diagnostic summary.

**Definition of success:** A coherent end-to-end iOS demonstration, not production-grade health monitoring or diagnosis.

## 2. Product Scope

### P0 — Must work

- Native SwiftUI dashboard showing crew status, recent events, and navigation.
- Camera screen showing live feed or bundled test video.
- On-device pose estimation or clearly identified prototype detection logic.
- Possible-fall detection → event creation → alert in SwiftUI, with acknowledgement.
- App runs on at least one actual iPhone; simulator support is secondary for camera features.

### P1 — Strongly desired

- MUSE chat screen backed by a small NASA research corpus, using retrieval-augmented generation (RAG).
- Visible citations or document titles/links for retrieved material; do not fabricate sources.
- Wellness journal with entry history and an AI-generated, clearly non-diagnostic summary.
- Optional mock heart rate/activity readings, explicitly labeled as simulated.

### P2 — Stretch only

- Apple Watch / HealthKit data, subject to device availability, permissions, and user consent.
- External infrared/thermal camera (requires appropriate calibrated hardware and SDK).
- Bird-themed wellness mini-game.
- Voice assistant, push notifications, cloud syncing, additional crew management.

**Cut line:** Do not start P2 until the P0 demo works reliably and is rehearsed.

## 3. Core Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| iOS app | **Swift 6, SwiftUI, Xcode** | Native navigation, camera, dashboard, chat, journal |
| Architecture | MVVM or feature-oriented Swift modules | Keep camera, alerts, chat, and journal loosely coupled |
| Camera | AVFoundation | Camera permissions and capture session |
| Pose detection | Apple Vision (`VNDetectHumanBodyPoseRequest`) | Prefer built-in iOS framework; evaluate live performance early |
| Local data | SwiftData or in-memory mock data | Start with mock data; persistence if time permits |
| Charts | Swift Charts | Heart-rate/activity and wellness visualizations |
| HTTP client | URLSession + Codable | Communicate with MUSE backend if needed |
| AI / RAG service | Small Python FastAPI backend | Index research and orchestrate retrieval + LLM calls |
| Research | NASA publications and official resources | Curate a small, verifiable dataset |
| Hosting | Any accessible HTTPS backend | Do not put LLM provider API secrets in the iOS app |
| Version control | GitHub | Branches, PRs, integration checkpoints |

**Architecture choice:** SwiftUI is the *application*. FastAPI, if used, is a supporting RAG service, not a second frontend. Camera processing and alerts should work locally without backend connectivity. If an external model is unavailable, use precomputed cited sample answers and label the demo mode clearly.

## 4. Architecture

```text
                     iPhone / SwiftUI App
  +----------------------------------------------------+
  | Dashboard / Crew Status / Alerts / Journal / MUSE |
  +-------------------------+--------------------------+
                            |
       +--------------------+-------------------+
       |                    |                   |
  AVFoundation          Local Store        URLSession
       |                    |                   |
  Vision body pose      Crew & alerts      HTTPS requests
       |                    |                   |
  Fall heuristic        Journal entries    FastAPI MUSE API
       |                                        |
  Possible-fall event                     Retrieval / RAG
       |                                        |
  In-app warning                           NASA corpus
```

### Suggested Swift domain models

- `CrewMember`: `id`, `displayName`, `status`, `lastUpdated`
- `SafetyEvent`: `id`, `crewMemberID`, `type`, `timestamp`, `severity`, `details`, `acknowledged`
- `TelemetrySample`: `id`, `crewMemberID`, `timestamp`, `heartRateBPM?`, `source` (`simulated`/`healthKit`)
- `JournalEntry`: `id`, `crewMemberID`, `timestamp`, `body`, `summary?`
- `ChatMessage`: `id`, `role`, `content`, `citations`, `timestamp`
- `ResearchCitation`: `title`, `url`, `sectionOrPage?`

### Recommended SwiftUI screens

1. `DashboardView` — overall crew status, active alerts, recent events, and mock telemetry.
2. `CameraMonitorView` — preview, monitoring toggle, possible-fall state, and test-mode control.
3. `AlertsView` — event timeline and acknowledge actions.
4. `MuseChatView` — user question, assistant answer, linked citations, error/loading states.
5. `WellnessJournalView` — entry form, entries, non-diagnostic summaries.

## 5. Five-Person Team Ownership

Every developer owns a vertical slice with a defined interface. Shared model names and API contracts must be agreed upon before parallel work.

| Owner | Workstream | Required deliverable | Dependencies |
| --- | --- | --- | --- |
| **Developer 1** | iOS app lead / SwiftUI | Xcode project, app navigation, dashboard, shared design system, integration build | Models and stub data from team |
| **Developer 2** | Camera / computer vision | AVFoundation + Vision pose pipeline, possible-fall detector, local alert event | Shared `SafetyEvent` contract |
| **Developer 3** | MUSE backend / RAG | Curated NASA sources, retrieval index, `/chat` API, returned citations | Shared JSON API contract |
| **Developer 4** | iOS wellness / data | Journal UI, chat UI, API client, charts, mock telemetry, local persistence | Developer 3's API contract |
| **Developer 5** | Integration / QA / presentation | Integration tests, GitHub coordination, alert QA, demo assets, fallback demo, pitch deck | Deliverables from all streams |

### Handoff requirements

- **Dev 1 → team:** compilable SwiftUI skeleton with routes and shared models.
- **Dev 2 → Dev 1:** reusable detector/service that publishes `SafetyEvent`; an offline sample test scenario.
- **Dev 3 → Dev 4:** stable request/response examples and reachable development URL.
- **Dev 4 → Dev 1:** drop-in chat/journal views plus mock-data mode.
- **Dev 5 → team:** integration checklist, reproducible demo steps, tested device/build, and backup recording.

## 6. Implementation Checklist

### Phase A — Foundation (all teams start here)

- [ ] Create GitHub repository and agree on `main` + short-lived feature branches.
- [ ] Create SwiftUI Xcode project and verify a build on the demo iPhone.
- [ ] Define common Swift models and sample fixtures.
- [ ] Agree on MUSE JSON contract and error-handling behavior.
- [ ] Configure camera usage description in `Info.plist`.
- [ ] Prepare a shared demo script and success criteria.

### Developer 1 — SwiftUI Shell & Dashboard

- [ ] Create app entry point and tab/navigation structure.
- [ ] Implement `DashboardView` with crew cards and status indicators.
- [ ] Implement active-alert banner and event list.
- [ ] Display mock chart data with clear `Simulated` labels.
- [ ] Wire camera, alerts, MUSE, and journal screens to app navigation.
- [ ] Handle empty/loading/error states and basic accessibility.
- [ ] Produce a working integrated build.

### Developer 2 — Camera & Fall Detection

- [ ] Implement AVFoundation preview and camera permission flow.
- [ ] Feed sampled frames into Vision body-pose estimation.
- [ ] Define a transparent fall heuristic (for example, abrupt pose change followed by prolonged low posture); tune with test clips.
- [ ] Publish possible-fall events with timestamps and detection details.
- [ ] Add cooldown/debouncing to prevent repeated alert spam.
- [ ] Test standing, walking, sitting, lying down, and safe simulated falls.
- [ ] Provide a replay/test-mode path for unreliable live-camera conditions.
- [ ] Explicitly label results as `Possible fall`; no automated medical diagnosis.

### Developer 3 — MUSE Agent & NASA RAG

- [ ] Select a small set of official NASA sources on isolation, exercise, crew health, and human performance.
- [ ] Record exact document titles, URLs, and sections/pages where available.
- [ ] Clean and chunk the source documents.
- [ ] Create retrieval using embeddings/vector search or a simpler keyword baseline.
- [ ] Implement FastAPI `POST /chat` endpoint.
- [ ] Return answer text and citations in structured JSON.
- [ ] Instruct the model to avoid diagnoses, invented citations, and unsupported clinical claims.
- [ ] Test queries with relevant, irrelevant, and ambiguous questions.
- [ ] Deploy behind HTTPS or provide a documented local development setup.

### Developer 4 — Journal, MUSE iOS UI & Data

- [ ] Build `MuseChatView` using `URLSession` and `Codable`.
- [ ] Render clickable research citations in each response.
- [ ] Add loading, timeout, offline, and error UI.
- [ ] Build `WellnessJournalView` with text entry and dated history.
- [ ] Display neutral, non-diagnostic semantic summaries; never classify someone as medically ill.
- [ ] Add simulated heart-rate/activity models and Swift Charts.
- [ ] Add local data storage if core functionality is stable.
- [ ] Keep personal journal content on-device unless explicit consent and a defined data policy are in place.

### Developer 5 — Integration, QA & Pitch

- [ ] Define branch/PR conventions and a merge schedule.
- [ ] Maintain an integration checklist for all five screens.
- [ ] Check camera permissions, offline behavior, network failures, and alert acknowledgements.
- [ ] Verify each NASA citation resolves to the claimed source.
- [ ] Ensure simulated telemetry and detection limitations are visible.
- [ ] Prepare a 2–3 minute live demo and fallback screen recording.
- [ ] Build concise slides: problem, users, system, live demo, limitations, next steps.
- [ ] Verify final project builds on the presentation device.

## 7. API Contract (Proposed)

Do not independently change this contract in different branches.

### `POST /chat`

Request:

```json
{
  "question": "What does NASA recommend about exercise during long-duration missions?",
  "context": "general_wellness"
}
```

Response:

```json
{
  "answer": "Evidence-grounded response goes here.",
  "citations": [
    {
      "title": "Verified NASA document title",
      "url": "https://example.org/replace-with-verified-nasa-url",
      "sectionOrPage": "Verified section or page"
    }
  ],
  "disclaimer": "General information only; not medical diagnosis or emergency guidance."
}
```

The example citation above is a **placeholder contract**, not a real citation. Replace it with verified NASA sources before demo.

### Error handling

- `400`: invalid question input.
- `503`: retrieval/model service unavailable.
- UI shows a clear failure state instead of fabricating a response.
- Use a mock mode for offline presentations; clearly identify mocked data/answers.

## 8. Suggested Repository Layout

```text
crew-safety-hackathon/
├── README.md
├── docs/
│   ├── BUILD_BRIEF.md
│   ├── API_CONTRACT.md
│   └── DEMO_SCRIPT.md
├── ios/
│   └── CrewSafety/
│       ├── App/
│       ├── Models/
│       ├── Features/
│       │   ├── Dashboard/
│       │   ├── Camera/
│       │   ├── Alerts/
│       │   ├── MuseChat/
│       │   └── Journal/
│       ├── Services/
│       │   ├── CameraService.swift
│       │   ├── FallDetectionService.swift
│       │   └── MuseAPIClient.swift
│       └── Resources/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── retrieval.py
│   │   └── schemas.py
│   ├── sources/
│   ├── tests/
│   └── requirements.txt
└── demo/
    ├── sample-clips/
    └── slides/
```

Treat this structure as a starting point; follow idiomatic Xcode project structure when creating the actual app.

## 9. Integration & Demo Timeline (24–36 Hours)

| Window | Outcome |
| --- | --- |
| Hours 0–3 | Project compiles; shared models, UI navigation, and API contract finalized |
| Hours 3–10 | Camera spike, initial dashboard, RAG prototype, chat/journal UI |
| Hours 10–18 | Real camera-to-alert path; working chat with sourced answers |
| Hours 18–24 | Merge, integrate, fix reliability and UI issues |
| Additional time (if 36h) | Harden tests, charts, citations, polish, presentation practice |

**Integration rule:** Merge a minimum viable working version of each feature before polishing. Stop adding features during final testing.

## 10. Acceptance Tests

- [ ] App launches on the target iPhone without crashing.
- [ ] Dashboard displays at least one crew member and a current status.
- [ ] Camera permissions can be requested and handled correctly.
- [ ] A recorded or safe simulated fall produces a `Possible fall` event.
- [ ] An alert is visible, timestamped, and acknowledgeable.
- [ ] Ordinary sitting or lying down does not automatically trigger the rehearsed fall scenario.
- [ ] MUSE responds to a question and shows verified research citations.
- [ ] No hardcoded LLM secret ships in the app bundle.
- [ ] Journal can store/display a note or operate in clearly labeled demo mode.
- [ ] Offline backend failure is handled without crashing.
- [ ] Simulated heart-rate/temperature readings are visibly labeled.
- [ ] Demo runs from start to finish, with backup assets ready.

## 11. Safety and Claims

- **Not a medical device.** Fall detection is probabilistic and can produce false positives/negatives.
- A camera cannot identify injury cause, diagnose symptoms, or accurately measure core body temperature without suitable validated hardware.
- Do not infer mental illness from writing style or sentiment. Journal analysis summarizes self-reported themes only.
- Research-grounded advice is informational; urgent concerns require qualified personnel and established safety procedures.
- Avoid continuously recording or transmitting sensitive camera/journal data without explicit permission.
- Never describe simulated data as actual astronaut telemetry.

## 12. Instructions for AI coding assistants

You are an implementation assistant for a **five-person team building a native SwiftUI iOS hackathon app**.

1. Read this complete document before changing code.
2. **SwiftUI is the primary app.** Do not create a React/Next.js frontend or replace the iOS app with a website.
3. Prioritize P0 features and the demo story. Avoid premature abstractions, extra frameworks, and scope creep.
4. Follow the current repository state and existing coding conventions rather than regenerating working modules.
5. Keep camera processing and local alerts functional without network access.
6. Use AVFoundation and Apple Vision first; introduce third-party computer-vision dependencies only when justified.
7. Ensure all user-facing claims distinguish alerts from diagnoses and simulated data from real readings.
8. Keep API keys server-side. Use environment configuration for the backend.
9. Produce small, compilable changes with clear test instructions and file summaries.
10. Do not make up NASA references or claim an integration works without testing it.
11. Before implementing a feature, identify the owning developer, interface dependencies, and acceptance test.
12. If information is unspecified, choose the smallest reversible implementation and document the assumption.

### First coding milestone

Create an Xcode-ready SwiftUI project with `DashboardView`, `CameraMonitorView`, `AlertsView`, `MuseChatView`, and `WellnessJournalView`; shared models; mock data; and working navigation. Confirm the project builds before adding live camera detection or backend integration.
