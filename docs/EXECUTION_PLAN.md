# Crew Safety & Wellness — Technical Execution Plan

> **Source of requirements:** `CREW_SAFETY_HACKATHON.md` ("the brief"). Where this plan goes beyond or deviates from the brief, it says so.
> **Status (updated 2026-11-14):** This is the original architecture and acceptance plan. See `docs/PASSDOWN.md` for current results, product changes and remaining checks. Native SwiftUI stays primary. Later work added the browser companion, Meta, the NASA/OSDR sources, paired sync, browser accounts and opt-in journal reflections. PR #4 replaced fall detection and its event type with possible-unresponsive detection. The website no longer serves research `/chat` or consumes an exported Python index; FastAPI still provides the native §5.3 API. The historical Swift snippets below are not the current camera contract: read `Core/Models/PoseTypes.swift` and `Models.swift` before integration. Do not revert merged contracts to the historical snippets.
> **Historical verification done when this plan was written:** the Swift contracts in §5 were type-checked with `swiftc -typecheck` (Apple Swift 6.4.2) in both Swift 5 and Swift 6 language modes and compile cleanly. Nothing else here has been built or run.

> **Direction change (2026-11-14): fall detection is scrapped.** The product now targets crew aboard a
> space station, where nobody falls. The camera feature is a *possible-unresponsive* check: it alerts
> when a tracked crew member shows no limb movement for 15 seconds (drifting and tumbling are ignored),
> then runs the same "Are you OK?" check-in. Wherever this document says fall, possible fall, low posture
> or hip drop, read the no-movement check described in `README.md` → *Setting and detection*. The
> event type is `possibleUnresponsive` (was `possibleFall`).
---

## 1. Improved project specification

### 1.1 Product in one paragraph

A native SwiftUI iPhone app for a **simulated** space crew. A phone on a stand watches one crew member; on-device pose estimation flags a **possible fall**, which becomes a timestamped, explainable, acknowledgeable in-app alert on a crew dashboard. A research assistant, MUSE, answers wellness questions using retrieval over a small curated NASA corpus and shows its citations. A wellness journal stores notes on-device and shows a neutral, non-diagnostic summary of self-reported themes. It is a demonstration, not a medical device.

### 1.2 Extracted requirements

| ID | Requirement | Brief tier | This plan |
| --- | --- | --- | --- |
| F1 | SwiftUI dashboard: crew status, active alerts, recent events, navigation | P0 | MVP |
| F2 | Camera screen with live feed or bundled test input | P0 | MVP |
| F3 | On-device body-pose estimation (Apple Vision) | P0 | MVP |
| F4 | Possible-fall heuristic → `SafetyEvent` → in-app alert → acknowledge | P0 | MVP |
| F5 | Debounce/cooldown; sitting or lying down slowly must not trigger | P0 | MVP |
| F6 | Replay/test mode for unreliable live conditions | P0 | MVP |
| F7 | Runs on a physical iPhone | P0 | MVP |
| F8 | MUSE chat with RAG over a small NASA corpus, visible citations | P1 | MVP (user-defined) |
| F9 | `POST /chat` FastAPI service; LLM keys server-side only | P1 | MVP |
| F10 | Offline/mock MUSE mode with clearly labelled precomputed answers | P1 | MVP |
| F11 | Wellness journal: entry form, dated history, non-diagnostic summary | P1 | MVP (basic) |
| F12 | Simulated heart-rate/activity with Swift Charts, labelled `Simulated` | P1 optional | Should-have |
| F13 | Local persistence | "if time permits" | Journal only; should-have |
| F14 | HealthKit / Apple Watch, thermal camera, bird mini-game, voice, push, cloud sync, crew management | P2 | Out of scope until MVP is rehearsed |

Non-functional requirements from the brief: camera and alerts work with no network; no LLM secret in the app bundle; journal content stays on-device; simulated data and detection limits are always visible; no fabricated NASA citations; no diagnosis language.

Deliverables from the brief: working build on the demo iPhone, FastAPI service (hosted or documented local setup), curated source list with titles/URLs/sections, sample clips, integration checklist, 2–3 minute demo, fallback screen recording, slides.

### 1.3 Assumptions

| # | Assumption | Why |
| --- | --- | --- |
| A1 | Deployment target **iOS 17.0**; Xcode 16 or later | Needed for `@Observable` and file-system-synchronised project folders. The brief names no minimum OS. |
| A2 | **Swift 6 toolchain, Swift 5 language mode** | The brief says "Swift 6". Strict concurrency plus AVFoundation delegate callbacks is a known time sink. The §5 contracts compile in both modes, so the team can flip to Swift 6 mode later if it builds clean. |
| A3 | One monitored crew member, one person in frame, phone stationary in portrait on a stand 2–4 m away with the full body visible | The brief does not state camera placement. If Vision returns several people, use the one with the largest bounding box. |
| A4 | ~~The scenario is an Earth analog habitat or partial-gravity surface~~ Superseded 2026-11-14: the scenario is a space station in microgravity | A fall needs gravity, so fall detection was replaced by a no-movement (possible-unresponsive) check that works while floating. |
| A5 | **LLM provider and model: to be supplied by the team.** The backend isolates the provider behind one function and ships an *extractive* mode that needs no LLM | The brief names none. |
| A6 | **NASA corpus: to be supplied by the team.** The brief lists topics only (isolation, exercise, crew health, human performance) and contains no document titles or URLs. This plan names none. | Hard constraint: do not invent sources. |
| A7 | Journal summary is produced **on-device** with Apple's NaturalLanguage framework (theme extraction, no sentiment score) | The brief asks for an "AI-generated" summary *and* for journal text to stay on-device. On-device analysis satisfies both and needs no backend. |
| A8 | Journal persists as a Codable JSON file in Application Support; events and telemetry are in memory | Smallest reversible choice. The brief allows "SwiftData or in-memory". |
| A9 | Alerts are in-app only: banner, haptic, Alerts tab badge | Push/local notifications are P2 in the brief. |
| A10 | Backend runs on a team laptop on the same network as the iPhone, or any HTTPS host the team has | The brief says "any accessible HTTPS backend". Host: to be supplied by the team. |
| A11 | Simulated skin/core temperature is **not** built | Acceptance test 11 mentions "temperature", but thermal sensing is P2. Only heart rate and activity are simulated. |
| A12 | The heuristic's number is called **"heuristic score"**, not "confidence" | It is not a calibrated probability. The brief says "confidence/heuristic explanation". |
| A13 | A human creates the Xcode project in the Xcode UI; agents add files afterwards | Agents hand-writing `project.pbxproj` is error-prone. |

### 1.4 Gaps, weaknesses and risks found in the brief

| # | Finding | Type | Resolution in this plan |
| --- | --- | --- | --- |
| G1 | No shared event bus: the brief says the detector "publishes" events but not to what | Missing architecture | One `EventStore` in the SwiftUI environment (§5) |
| G2 | Crew status is a stored field with nothing that updates it | Missing requirement | Status is derived from unacknowledged events (`CrewStore.status(for:events:)`) |
| G3 | Developer 4 owns chat UI, API client, journal, summaries, charts, telemetry and persistence; Developer 5 owns no code | Workload imbalance | Alerts and telemetry move to Developer 5; Developer 4 keeps chat and journal |
| G4 | `project.pbxproj` merge conflicts with five people adding files | Integration risk | Synchronised folders (Xcode 16+) so adding a file does not touch the project file |
| G5 | Fall heuristic has no parameters, no input format, no way to unit-test | Underspecified | `PoseFrame` JSON fixtures, `FallDetectorConfig` starting values, pure-logic `FallDetecting` |
| G6 | "Bundled test video" replay depends on Vision running on that input; Vision body pose in the Simulator is not guaranteed | Technical risk | Recorded pose-JSON replay is the required test path; video-clip replay is optional |
| G7 | API contract has no health check, no error body, no input limits, no way to signal "nothing relevant found" | Underspecified | Additive fields and `GET /health` in §5.3; the brief's fields are unchanged |
| G8 | iPhone reaching a laptop backend: ATS blocks plain HTTP, venue Wi-Fi often isolates clients | Demo risk | `NSAllowsLocalNetworking`, test on venue network by hour 10, phone-hotspot fallback, demo mode |
| G9 | "AI-generated summary" conflicts with on-device privacy rule | Contradiction | A7 |
| G10 | Demo depends on a live LLM call | Demo risk | Three-level fallback: generated → extractive → bundled precomputed answers |
| G11 | Phone will dim/lock and heat up during long monitoring | Operational | Disable idle timer while monitoring; process ~10 fps; stop session when leaving the tab |
| G12 | Brief layout (`crew-safety-hackathon/`) differs from the actual repo | Mismatch | §3 uses the existing repo root |
| G13 | SwiftData, vector embeddings, HTTPS hosting each add setup cost for little demo value | Unnecessary complexity | JSON file, BM25 keyword retrieval first, local backend first |

### 1.5 MVP and cut order

**MVP:** dashboard · camera-based possible-fall detection · in-app alerts with acknowledgement · NASA-grounded MUSE · basic journal.

If behind schedule, cut in this order (first item is cut first):

1. Everything P2 — never started.
2. Video-clip replay through Vision (keep pose-JSON replay).
3. Skeleton overlay drawn on the camera preview.
4. Journal persistence to disk (keep in-memory for the session).
5. Simulated telemetry chart (replace with nothing; do not show a fake static number).
6. LLM-generated MUSE answers (fall back to extractive mode: retrieved passages quoted with citations).
7. Live backend at demo time (fall back to bundled precomputed answers, badge "Demo mode").
8. Journal summary (keep entry form and history).
9. Live-camera detection during the demo (drive the demo from pose-JSON replay, labelled "Replay"). Last resort.

Never cut: dashboard, possible-fall → alert → acknowledge, and the `Simulated` / `Replay` / `Demo mode` / "not a diagnosis" labels.

---

## 2. Recommended system architecture

```text
 iPhone (SwiftUI, everything left of the dotted line runs with no network)        :  Laptop / host
                                                                                  :
 CrewSafetyApp ── creates ──> EventStore, CrewStore, AppSettings, AppServices     :
        │                         (injected with .environment)                    :
   RootTabView + AlertBannerView overlay                                          :
        │                                                                         :
  ┌─────┴──────┬──────────────┬──────────────┬───────────────┐                    :
 Dashboard   Camera         Alerts        MuseChat         Journal                :
  (Dev 1)    (Dev 2)        (Dev 5)       (Dev 4)          (Dev 4)                :
     │          │              │             │                │                   :
     │   AVCaptureSession      │       MuseService        JournalStore (JSON file):
     │   └> Vision body pose   │        ├ RemoteMuseService ── URLSession ──────> FastAPI POST /chat
     │      └> PoseFrame       │        └ DemoMuseService (bundled JSON)          :   ├ BM25 retrieval over
     │         └> FallDetector │                               JournalAnalyzer    :   │  backend/sources/
     │            └> EventStore.record(SafetyEvent)            (NaturalLanguage)  :   └ LLM (optional)
     │                         │                                                  :
     └── reads EventStore ─────┘   TelemetryCardView (Dev 5, simulated, Swift Charts)
```

| Concern | Decision |
| --- | --- |
| App structure | One app target, feature folders, no Swift packages, no third-party iOS dependencies. Each feature exposes one root view with a no-argument initialiser. |
| MVVM and state | `@Observable` (Observation framework). Shared state lives in four `@MainActor` objects created once in `CrewSafetyApp` and injected via `.environment(...)`. Each feature has its own `@Observable @MainActor` view model for screen state. No singletons, no Combine, no global `static` state. |
| Camera | `AVCaptureSession` on a private serial queue; `AVCaptureVideoDataOutput` with `alwaysDiscardsLateVideoFrames = true`; preview through a `UIViewRepresentable` wrapping `AVCaptureVideoPreviewLayer`. Frames are analysed in memory and never written or transmitted. |
| Pose | `VNDetectHumanBodyPoseRequest`, sampled to roughly 10 fps. Joints are converted to the neutral `PoseFrame` type so the detector has no Vision dependency. |
| Fall detection | Pure-Swift state machine: *upright* → *rapid drop* (hip centre falls ≥ 20% of frame height within ≤ 1.0 s and torso ≥ 60° from vertical) → *low-posture hold* (≥ 2.0 s) → emit. Cooldown 15 s. Sitting keeps the torso vertical; lying down slowly exceeds the drop-time limit. All thresholds are starting values in `FallDetectorConfig`, to be tuned on recorded fixtures. |
| Alerts | Detector calls `EventStore.record`. A root-level banner shows the newest unacknowledged event; haptic on arrival; Alerts tab shows a badge and the timeline; acknowledging sets `acknowledged` and `acknowledgedAt`. |
| MUSE | `MuseService` protocol with `RemoteMuseService` (URLSession, 15 s timeout) and `DemoMuseService` (bundled `MuseFallbackAnswers.json`). `AppSettings.museMode` picks one. The app never synthesises an answer itself. |
| RAG backend | FastAPI. Sources listed in `backend/sources/manifest.json`, chunked at build time, retrieved with BM25. If an LLM key is configured, the model answers only from retrieved chunks; otherwise extractive mode returns the top passages verbatim. Citations come from chunk metadata, never from model output. |
| Journal | `JournalStore` writes `journal.json` to Application Support with complete file protection. `OnDeviceJournalAnalyzer` uses `NLTagger` and a small theme lexicon to list self-reported themes. No sentiment score, no risk level. |
| Telemetry | `SimulatedTelemetryProvider` generates deterministic heart-rate/activity samples with `source = .simulated`. The chart carries a permanent `Simulated` badge. |
| Networking | `URLSession` + `Codable`. Base URL from `Info.plist` key `MUSE_BASE_URL`, overridable in an in-app settings sheet. `NSAllowsLocalNetworking = YES` for LAN development. |
| Errors | Typed `MuseError`; every screen has explicit empty, loading and error states. Camera permission denied shows a Settings deep link. A failed network call shows the failure and offers demo mode; it never shows invented text. |
| Privacy | No camera frames stored or sent. Journal text never leaves the device. `/chat` receives only the typed question. No analytics. |
| Offline | Dashboard, camera, detection, alerts, journal, journal summary and telemetry all work in airplane mode. MUSE degrades to demo mode with a visible badge. |

---

## 3. Repository and folder structure

```text
<repo root>/
├── README.md
├── .gitignore                         (Dev 5)
├── docs/
│   ├── BUILD_BRIEF.md                 the original brief, committed unchanged
│   ├── EXECUTION_PLAN.md              this file
│   ├── INTEGRATION_CHECKLIST.md       (Dev 5)
│   ├── DEMO_SCRIPT.md                 (Dev 5)
│   └── SOURCES.md                     (Dev 3 writes, Dev 5 verifies)
├── ios/
│   ├── CrewSafety.xcodeproj           (Dev 1 only)
│   ├── CrewSafety/
│   │   ├── App/                       (Dev 1) CrewSafetyApp, RootTabView, AppConfig, SettingsSheet
│   │   ├── Core/                      (Dev 1; frozen after hour 3)
│   │   │   ├── Models/                Models.swift, MuseDTOs.swift, PoseTypes.swift
│   │   │   ├── Services/              ServiceProtocols.swift
│   │   │   ├── Stores/                EventStore, CrewStore, AppSettings, AppServices
│   │   │   ├── Mocks/                 placeholder service implementations, SampleData.swift
│   │   │   └── DesignSystem/          Theme.swift, StatusBadge, SimulatedBadge, EmptyStateView
│   │   ├── Features/
│   │   │   ├── Dashboard/             (Dev 1)
│   │   │   ├── Camera/                (Dev 2)
│   │   │   ├── Alerts/                (Dev 5)
│   │   │   ├── Telemetry/             (Dev 5)
│   │   │   ├── MuseChat/              (Dev 4)
│   │   │   └── Journal/               (Dev 4)
│   │   └── Resources/
│   │       ├── Assets.xcassets        (Dev 1)
│   │       ├── PoseFixtures/          (Dev 2) *.json recorded pose sequences
│   │       ├── Clips/                 (Dev 2) optional short video clips
│   │       └── MuseFallbackAnswers.json  (Dev 3 owns content)
│   └── CrewSafetyTests/               one file per developer, named <Area>Tests.swift
├── backend/                           (Dev 3)
│   ├── app/  main.py, schemas.py, retrieval.py, llm.py, config.py
│   ├── sources/  manifest.json, raw/, chunks.jsonl
│   ├── scripts/  build_index.py, export_fallback.py
│   ├── tests/
│   ├── requirements.txt, .env.example, README.md
└── demo/                              (Dev 5) slides/, recordings/
```

Rules that keep merges clean:

- The Xcode project uses **file-system-synchronised folders**. Adding a Swift file inside your own folder must not change `project.pbxproj`. If your diff touches the project file, stop and ask Developer 1.
- Only Developer 1 edits `App/`, `Core/`, the project file, build settings and `Info.plist` keys. A change to `Core/` after hour 3 needs a message to the whole team first.
- A feature never imports from another feature's folder. Features talk only through `Core/`.

---

## 4. Five-person responsibility matrix

This deviates from the brief's table in one way: Alerts and simulated telemetry move from Developers 1 and 4 to Developer 5 (see G3).

| | Dev 1 — App lead | Dev 2 — Camera / CV | Dev 3 — MUSE backend | Dev 4 — MUSE + Journal iOS | Dev 5 — Alerts, QA, demo |
| --- | --- | --- | --- | --- | --- |
| Owns | `ios/CrewSafety.xcodeproj`, `App/`, `Core/`, `Features/Dashboard/`, `Assets.xcassets` | `Features/Camera/`, `Resources/PoseFixtures/`, `Resources/Clips/` | `backend/`, `docs/SOURCES.md`, content of `MuseFallbackAnswers.json` | `Features/MuseChat/`, `Features/Journal/` | `Features/Alerts/`, `Features/Telemetry/`, `docs/INTEGRATION_CHECKLIST.md`, `docs/DEMO_SCRIPT.md`, `demo/`, `.gitignore` |
| Features | Project, navigation, shared contracts, design system, dashboard, composition root, integration builds | Capture session, permission flow, Vision pose, fall heuristic, replay mode, event emission | Corpus curation, chunking, BM25 retrieval, `/chat`, `/health`, extractive mode, fallback export | Chat UI, remote and demo MUSE services, citations, journal UI, journal store, on-device summary | Alert banner, alerts timeline, acknowledge, simulated telemetry chart, test plan, citation verification, demo and pitch |
| Deliverables | Compiling skeleton by hour 2; integrated build at each checkpoint | `CameraMonitorView()`; `HeuristicFallDetector`; ≥ 5 pose fixtures | Reachable dev URL; verified source manifest; fallback answers file | `MuseChatView()`; `WellnessJournalView()`; `RemoteMuseService`; `DemoMuseService`; `OnDeviceJournalAnalyzer` | `AlertsView()`; `AlertBannerView()`; `TelemetryCardView(crewMemberID:)`; rehearsed demo; backup recording; slides |
| Depends on | Root views from Devs 2, 4, 5 | `Core/` from Dev 1 | Nothing in the iOS code | `Core/` from Dev 1; URL and fallback file from Dev 3 | `Core/` from Dev 1; everyone for QA |
| Shared interfaces used | All | `EventStore`, `CrewStore`, `SafetyEvent`, `PoseFrame`, `FallDetecting` | §5.3 wire schema | `MuseService`, `JournalAnalyzing`, DTOs, `AppSettings`, `AppServices` | `EventStore`, `CrewStore`, `TelemetryProviding`, `TelemetrySample` |
| Acceptance | App launches on device; five tabs; dashboard shows crew, derived status, recent events; settings sheet switches MUSE mode | Recorded fall fixture → exactly one event; sit/lie-down fixtures → none; live fall on device → alert; works in airplane mode | `pytest` passes; relevant question returns ≥ 1 citation from the manifest; irrelevant question returns `grounded: false` and no citations; no key in repo | Answer renders with tappable citations; 503/offline/timeout each show a distinct state; demo answers badge "Demo mode"; journal entry survives relaunch; summary has no diagnostic wording | Banner appears within 1 s of `record`; acknowledge clears it and updates the dashboard; chart shows `Simulated`; every item in §8 checked on the demo device |
| Priority | P0 | P0 | P1 (MVP) | P1 (MVP) | P0 for alerts, then QA |
| Effort (focused hours) | 12–14 | 14–18 | 10–14 | 12–14 | 6 code + 10 QA/demo |

---

## 5. Shared model and API contracts

These are frozen at hour 3. Developer 1 copies the Swift below verbatim into `ios/CrewSafety/Core/`. Type-checked as noted at the top of this document.

### 5.1 Swift models — `Core/Models/Models.swift`

```swift
import Foundation

// MARK: Crew
enum CrewStatus: String, Codable, Sendable, CaseIterable { case nominal, attention, alert }

struct CrewMember: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var displayName: String
    var role: String
    var status: CrewStatus      // base status; the displayed status is derived, see CrewStore
    var lastUpdated: Date
}

// MARK: Safety events
enum SafetyEventType: String, Codable, Sendable { case possibleFall, manualTest }

enum EventSeverity: Int, Codable, Sendable, Comparable {
    case info = 0, warning = 1, critical = 2
    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Shown in the UI so replayed or simulated events are never mistaken for live ones.
enum EventSource: String, Codable, Sendable { case liveCamera, replay, simulated }

struct SafetyEvent: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let crewMemberID: UUID
    let type: SafetyEventType
    let timestamp: Date
    let severity: EventSeverity
    let source: EventSource
    /// 0...1 heuristic score. NOT a calibrated probability; label it "heuristic score".
    let heuristicScore: Double?
    /// Human-readable explanation of why the heuristic fired.
    let details: String
    var acknowledged: Bool
    var acknowledgedAt: Date?

    init(id: UUID = UUID(), crewMemberID: UUID, type: SafetyEventType, timestamp: Date = .now,
         severity: EventSeverity, source: EventSource, heuristicScore: Double? = nil,
         details: String, acknowledged: Bool = false, acknowledgedAt: Date? = nil) {
        self.id = id; self.crewMemberID = crewMemberID; self.type = type; self.timestamp = timestamp
        self.severity = severity; self.source = source; self.heuristicScore = heuristicScore
        self.details = details; self.acknowledged = acknowledged; self.acknowledgedAt = acknowledgedAt
    }
}

// MARK: Telemetry
enum TelemetrySource: String, Codable, Sendable { case simulated, healthKit }

struct TelemetrySample: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let crewMemberID: UUID
    let timestamp: Date
    let heartRateBPM: Double?
    let activityLevel: Double?   // 0...1 relative activity
    let source: TelemetrySource
}

// MARK: Journal
enum SummarySource: String, Codable, Sendable { case onDevice, demo }

struct JournalSummary: Codable, Hashable, Sendable {
    /// Self-reported themes found in the text ("sleep", "workload"). Never a mood score or diagnosis.
    let themes: [String]
    let text: String
    let generatedBy: SummarySource
    let disclaimer: String
}

struct JournalEntry: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let crewMemberID: UUID
    let timestamp: Date
    var body: String
    var summary: JournalSummary?
}

// MARK: MUSE
enum ChatRole: String, Codable, Sendable { case user, assistant }

/// .live = returned by the backend for this question. .precomputed = bundled demo answer.
enum AnswerSource: String, Codable, Sendable { case live, precomputed }

enum MuseContext: String, Codable, Sendable { case generalWellness = "general_wellness" }

struct ResearchCitation: Codable, Hashable, Sendable {
    let title: String
    let url: URL
    let sectionOrPage: String?
}

struct MuseAnswer: Sendable {
    let answer: String
    let citations: [ResearchCitation]
    let disclaimer: String
    let source: AnswerSource
    /// false when retrieval found nothing relevant; the UI then shows "no supporting source found".
    let grounded: Bool
}

struct ChatMessage: Identifiable, Hashable, Sendable {
    let id: UUID
    let role: ChatRole
    let content: String
    let citations: [ResearchCitation]
    let timestamp: Date
    let answerSource: AnswerSource?
    let disclaimer: String?
}

enum MuseError: Error, Sendable, Equatable {
    case invalidQuestion      // HTTP 400, or empty / over-length input
    case serviceUnavailable   // HTTP 503
    case offline              // no network or host unreachable
    case timeout
    case badResponse          // undecodable body or unexpected status
    case noOfflineAnswer      // demo mode has no precomputed answer for this question
}
```

### 5.2 Service protocols and shared stores

```swift
// Core/Services/ServiceProtocols.swift
import Foundation

protocol MuseService: Sendable {
    func ask(_ question: String, context: MuseContext) async throws -> MuseAnswer
}

protocol JournalAnalyzing: Sendable {
    /// Must run fully on-device. Must not produce sentiment scores, risk levels or diagnoses.
    func summarize(_ body: String) async -> JournalSummary
}

protocol TelemetryProviding: Sendable {
    /// Oldest to newest. Simulated providers must set source = .simulated.
    func samples(for crewMemberID: UUID, last interval: TimeInterval, now: Date) -> [TelemetrySample]
}
```

```swift
// Core/Stores/*.swift
import Foundation
import Observation

@MainActor @Observable
final class EventStore {
    private(set) var events: [SafetyEvent] = []          // newest first

    var activeAlerts: [SafetyEvent] { events.filter { !$0.acknowledged } }
    var highestActiveSeverity: EventSeverity? { activeAlerts.map(\.severity).max() }

    init(events: [SafetyEvent] = []) { self.events = events.sorted { $0.timestamp > $1.timestamp } }

    func record(_ event: SafetyEvent) { events.insert(event, at: 0) }

    func acknowledge(_ id: SafetyEvent.ID, at date: Date = .now) {
        guard let i = events.firstIndex(where: { $0.id == id }), !events[i].acknowledged else { return }
        events[i].acknowledged = true
        events[i].acknowledgedAt = date
    }

    func activeAlerts(for crewMemberID: UUID) -> [SafetyEvent] {
        activeAlerts.filter { $0.crewMemberID == crewMemberID }
    }
}

@MainActor @Observable
final class CrewStore {
    var crew: [CrewMember]
    var monitoredCrewMemberID: UUID     // camera session and journal are attributed to this member

    init(crew: [CrewMember], monitoredCrewMemberID: UUID) {
        self.crew = crew; self.monitoredCrewMemberID = monitoredCrewMemberID
    }

    /// Displayed status is derived: an unacknowledged event overrides the base status.
    func status(for member: CrewMember, events: EventStore) -> CrewStatus {
        switch events.activeAlerts(for: member.id).map(\.severity).max() {
        case .critical?: return .alert
        case .warning?:  return .attention
        default:         return member.status
        }
    }
}

enum MuseMode: String, Codable, Sendable { case live, demo }

@MainActor @Observable
final class AppSettings {
    var museMode: MuseMode       // .demo must show a visible "Demo mode" badge in chat
    var museBaseURL: URL?
    init(museMode: MuseMode = .demo, museBaseURL: URL? = nil) {
        self.museMode = museMode; self.museBaseURL = museBaseURL
    }
}

@MainActor @Observable
final class AppServices {
    var muse: any MuseService
    var journalAnalyzer: any JournalAnalyzing
    var telemetry: any TelemetryProviding
    init(muse: any MuseService, journalAnalyzer: any JournalAnalyzing, telemetry: any TelemetryProviding) {
        self.muse = muse; self.journalAnalyzer = journalAnalyzer; self.telemetry = telemetry
    }
}
```

### 5.3 MUSE API

Swift wire types — `Core/Models/MuseDTOs.swift`:

```swift
struct ChatRequestDTO: Codable, Sendable { let question: String; let context: String }

struct CitationDTO: Codable, Sendable { let title: String; let url: String; let sectionOrPage: String? }

struct ChatResponseDTO: Codable, Sendable {
    let answer: String
    let citations: [CitationDTO]
    let disclaimer: String
    let grounded: Bool?       // additive; if absent treat as !citations.isEmpty
    let answerMode: String?   // additive; "generated" or "extractive"
}

struct APIErrorDTO: Codable, Sendable {
    struct Body: Codable, Sendable { let code: String; let message: String }
    let error: Body
}
```

`POST /chat` — the request and the three response fields `answer`, `citations`, `disclaimer` are exactly as in the brief. `grounded` and `answerMode` are additions proposed here; adopt them at the hour-3 freeze or drop them for everyone.

```json
{ "question": "string, 1–500 characters after trimming", "context": "general_wellness" }
```

```json
{
  "answer": "string",
  "citations": [ { "title": "string", "url": "https://…", "sectionOrPage": "string or null" } ],
  "disclaimer": "General information only; not medical diagnosis or emergency guidance.",
  "grounded": true,
  "answerMode": "generated"
}
```

| Case | Status | Body |
| --- | --- | --- |
| Success, sources found | 200 | as above, `grounded: true`, ≥ 1 citation |
| Success, nothing relevant retrieved | 200 | `answer` states that the corpus has no supporting material, `citations: []`, `grounded: false` |
| Empty, over-length or malformed input | 400 | `{ "error": { "code": "invalid_question", "message": "…" } }` |
| Retrieval or model failure | 503 | `{ "error": { "code": "service_unavailable", "message": "…" } }` |

`GET /health` → `200 { "status": "ok", "documents": <int>, "chunks": <int>, "llm": "configured" | "extractive_only" }`.

Rules: unknown `context` values are treated as `general_wellness`. Every citation must be copied from `manifest.json` metadata of a retrieved chunk. The server never returns a citation the model wrote. Client timeout is 15 s.

Client mapping: 400 → `.invalidQuestion`; 503 → `.serviceUnavailable`; `URLError.notConnectedToInternet`, `.cannotConnectToHost`, `.cannotFindHost` → `.offline`; `URLError.timedOut` → `.timeout`; anything else → `.badResponse`. A citation whose `url` does not parse is dropped and logged.

### 5.4 Pose and fall-detection contract — `Core/Models/PoseTypes.swift`

```swift
import Foundation

struct PosePoint: Codable, Hashable, Sendable {
    let x: Double   // 0...1, origin bottom-left, +y is up in the upright scene
    let y: Double
    let c: Double   // Vision joint confidence 0...1
}

/// Joint keys: nose, neck, root, leftShoulder, rightShoulder, leftHip, rightHip,
/// leftKnee, rightKnee, leftAnkle, rightAnkle. Missing joints are absent from the dictionary.
struct PoseFrame: Codable, Hashable, Sendable {
    let t: TimeInterval               // seconds since session or clip start, monotonic
    let joints: [String: PosePoint]
}

struct FallDetectorConfig: Codable, Sendable {
    var minJointConfidence = 0.3
    var uprightMaxTorsoAngleDeg = 35.0       // root→neck angle from vertical while "upright"
    var fallenMinTorsoAngleDeg = 60.0        // angle from vertical counted as "horizontal"
    var minHipDropFraction = 0.20            // hip-centre drop as a fraction of frame height
    var maxDropDuration: TimeInterval = 1.0  // the drop must be at least this fast
    var lowPostureHold: TimeInterval = 2.0   // must stay low this long before alerting
    var cooldown: TimeInterval = 15.0        // minimum gap between detections
}

struct FallDetection: Hashable, Sendable {
    let t: TimeInterval
    let score: Double          // 0...1 heuristic score
    let explanation: String    // "Hip height dropped 31% in 0.6 s; torso 78° from vertical for 2.1 s"
}

protocol FallDetecting {
    var config: FallDetectorConfig { get set }
    /// Feed frames in time order. Returns a detection at most once per cooldown window.
    mutating func process(_ frame: PoseFrame) -> FallDetection?
    mutating func reset()
}
```

The threshold values are starting points chosen for this plan, not measured results. Developer 2 tunes them on recorded fixtures and records the final values in the PR.

Mapping a detection to an event (Developer 2):
`SafetyEvent(crewMemberID: crewStore.monitoredCrewMemberID, type: .possibleFall, severity: .critical, source: .liveCamera or .replay, heuristicScore: detection.score, details: detection.explanation)`.

### 5.5 Mock and fixture formats

| File | Format | Owner |
| --- | --- | --- |
| `Resources/PoseFixtures/<name>.json` | `{ "name": "fall_forward_01", "label": "fall" \| "sit" \| "lie_down_slow" \| "walk" \| "stand", "fps": 10, "frames": [PoseFrame] }` | Dev 2 |
| `Resources/MuseFallbackAnswers.json` | `[ { "id": "string", "question": "string", "keywords": ["string"], "answer": "string", "citations": [CitationDTO], "disclaimer": "string" } ]` | Dev 3 |
| `backend/sources/manifest.json` | `[ { "id": "string", "title": "string", "url": "string", "publisher": "NASA", "file": "raw/<file>", "retrievedOn": "YYYY-MM-DD", "verifiedBy": "name or null" } ]` | Dev 3, verified by Dev 5 |
| `backend/sources/chunks.jsonl` | one object per line: `{ "chunkId", "sourceId", "sectionOrPage", "text" }` | Dev 3 (generated) |
| `Core/Mocks/SampleData.swift` | `enum SampleData { static let crew: [CrewMember]; static let monitoredID: UUID; static let events: [SafetyEvent] }` with fixed UUIDs; sample events use `source: .simulated` | Dev 1 |

`MuseFallbackAnswers.json` ships as `[]` until Developer 3 exports real answers produced from the verified corpus. With an empty file, demo mode returns `.noOfflineAnswer` and the UI says so. Nobody hand-writes answers or citations into this file.

### 5.6 Integration points

| Provided by | Symbol | Consumed by | How |
| --- | --- | --- | --- |
| Dev 2 | `CameraMonitorView()` | Dev 1 `RootTabView` | Reads `EventStore` and `CrewStore` from the environment |
| Dev 5 | `AlertsView()`, `AlertBannerView()` | Dev 1 `RootTabView` | Tab, and overlay above the tab view |
| Dev 5 | `TelemetryCardView(crewMemberID: UUID)` | Dev 1 `DashboardView` | Reads `AppServices.telemetry` |
| Dev 5 | `SimulatedTelemetryProvider()` | Dev 1 composition root | Conforms to `TelemetryProviding` |
| Dev 4 | `MuseChatView()`, `WellnessJournalView()` | Dev 1 `RootTabView` | Read `AppServices`, `AppSettings`, `CrewStore` |
| Dev 4 | `RemoteMuseService(baseURL:)`, `DemoMuseService()`, `OnDeviceJournalAnalyzer()` | Dev 1 composition root | Conform to `MuseService` / `JournalAnalyzing` |
| Dev 1 | `StatusBadge`, `SimulatedBadge`, `EmptyStateView`, `Theme` | Everyone | `Core/DesignSystem/` |

Until the real types land, `Core/Mocks/` holds `PlaceholderMuseService` (throws `.serviceUnavailable`), `PlaceholderJournalAnalyzer` (returns a summary with `generatedBy: .demo`) and `PlaceholderTelemetryProvider` (returns `[]`), and each feature folder holds a stub root view. Developer 1 swaps each placeholder for the real type in `CrewSafetyApp` when its owner says it is merged.

---

## 6. Step-by-step development plan

Hours assume a 24-hour event; a 36-hour event stretches phases 3 and 5.

### Phase 1 — Repository and Xcode setup (hours 0–1)

| Task | Owner | Depends on |
| --- | --- | --- |
| Commit the brief as `docs/BUILD_BRIEF.md` and this plan as `docs/EXECUTION_PLAN.md` on `main` | Dev 5 | — |
| Add `.gitignore` (Xcode user data, `DerivedData`, `.env`, `__pycache__`, `.venv`) | Dev 5 | — |
| In Xcode: new iOS App `CrewSafety` under `ios/`, SwiftUI, unit-test target, iOS 17.0, Swift 5 language mode, team signing | Dev 1 (human, in Xcode) | — |
| Build settings: `INFOPLIST_KEY_NSCameraUsageDescription`, `NSAllowsLocalNetworking`, `MUSE_BASE_URL` | Dev 1 | project |
| Confirm folders under `ios/CrewSafety/` are synchronised: add a file in Finder, see it in Xcode, `git status` shows no project-file change | Dev 1 | project |
| Run the empty app on the demo iPhone | Dev 1 + Dev 5 | project |
| Create `backend/` with a virtual environment and a FastAPI "hello" | Dev 3 | — |
| Start collecting candidate NASA documents and recording title/URL/section | Dev 3 | — |

Done when: empty app runs on the demo iPhone; `main` has project, brief, plan, `.gitignore`.

### Phase 2 — Shared architecture and interfaces (hours 1–3)

| Task | Owner |
| --- | --- |
| Copy §5 into `Core/`; write `SampleData`, placeholder services, design-system basics | Dev 1 |
| `CrewSafetyApp` creates the four shared objects and injects them; `RootTabView` with five tabs; one stub view file per feature folder | Dev 1 |
| Team reads §5 together; decide on `grounded` / `answerMode`; record any change in this file | All, 20 minutes |
| Camera spike on device in a branch: does Vision body pose hold ~10 fps? | Dev 2 |
| Merge the skeleton to `main`; everyone branches from it | Dev 1 |

Done when: `main` builds; five tabs open; §5 is declared frozen in the team channel. Deliverable: tag `skeleton`.

### Phase 3 — Parallel feature development (hours 3–16)

Branches: `dev1/dashboard`, `dev2/camera`, `dev3/backend`, `dev4/muse-journal`, `dev5/alerts`. Rebase on `main` before each checkpoint. Small PRs, one reviewer, merge when it builds.

| Checkpoint | Dev 1 | Dev 2 | Dev 3 | Dev 4 | Dev 5 |
| --- | --- | --- | --- | --- | --- |
| Hour 6 | Dashboard with crew cards and derived status | Live preview, permission flow, pose frames logged | `/chat` returns extractive answers from ≥ 2 real sources; `/health` | Chat UI against `PlaceholderMuseService`; journal form and list | Banner + alerts list + acknowledge, driven by a debug "Record test event" button |
| Hour 10 | Recent events list; settings sheet; swap in Dev 5 types | Detector passing fixture tests; pose-JSON replay | Full corpus indexed; LLM mode if a key exists; iPhone reaches the backend on the venue network | `RemoteMuseService` against Dev 3's URL; citations tappable; error states | Telemetry card; start `INTEGRATION_CHECKLIST.md`; record fall clips with Dev 2 |
| Hour 16 | Swap in Dev 2 and Dev 4 types; polish | Live fall → event on device; cooldown; false-positive pass | `export_fallback.py` output committed; `SOURCES.md` complete | `DemoMuseService`; journal persistence; on-device summary | Citation verification; first full checklist run |

Done when: every feature works alone on `main` in its minimum form.

### Phase 4 — Feature integration (hours 16–20)

- [ ] Developer 1 replaces every placeholder with the real implementation in `CrewSafetyApp`.
- [ ] Fall on device → banner → dashboard status `alert` → acknowledge → status returns.
- [ ] Live MUSE question from the iPhone with citations; switch to demo mode and repeat.
- [ ] Journal entry → summary → relaunch → entry still there.
- [ ] Airplane mode: everything except live MUSE still works.
- [ ] **Feature freeze at hour 20.**

Deliverable: tag `integrated`.

### Phase 5 — Testing and debugging (hours 20–23)

Run §8 on the demo device. Fix crashes and misleading labels first, visual polish last. Any feature still unstable is cut by the order in §1.5, not patched live.

Deliverable: tag `demo-candidate`, installed on the demo iPhone and one backup iPhone if available.

### Phase 6 — Demo preparation (hours 22–24)

- [ ] Three timed rehearsals of §9 on the demo device and venue network.
- [ ] Backup screen recording of a full successful run.
- [ ] Slides: problem, users, system, live demo, limitations, next steps.
- [ ] Phone charged, Do Not Disturb on, auto-lock disabled, stand positioned, backend running, demo-mode fallback tested.

---

## 7. Five independent AI coding prompts

Each block is self-contained. Paste one into a fresh AI coding assistant session opened at the repository root. Prepend the master prompt from §10 when the tool allows a system or project prompt; otherwise paste §10 first, then the developer prompt.

### 7.1 Developer 1 — App shell, shared core, dashboard

```text
You are implementing Developer 1's workstream of a five-person, 24–36 hour hackathon project.

PROJECT
A native Swift/SwiftUI iPhone app, "CrewSafety", for a SIMULATED space crew: a dashboard, camera-based
possible-fall detection with in-app alerts, a NASA-research-grounded assistant called MUSE (served by a
small FastAPI backend), and an on-device wellness journal. It is a demo, not a medical device.
Read docs/BUILD_BRIEF.md and docs/EXECUTION_PLAN.md fully before changing anything. Section 5 of the
plan holds the shared contracts and is the source of truth.

GLOBAL RULES
- Swift and SwiftUI only. iOS 17.0 target. Swift 5 language mode. Apple frameworks only; add no packages.
- Observation framework (@Observable) for state. No singletons, no Combine, no global mutable state.
- Never present simulated data as real: use the SimulatedBadge wherever simulated values appear.
- Never write diagnostic or medical-claim wording. Detections are "Possible fall".
- Do not invent NASA sources, sample citations, or sample research text.

YOU OWN (edit only these)
ios/CrewSafety.xcodeproj, ios/CrewSafety/App/, ios/CrewSafety/Core/, ios/CrewSafety/Features/Dashboard/,
ios/CrewSafety/Resources/Assets.xcassets, ios/CrewSafetyTests/CoreTests.swift.
You also create ONE stub root view file in each other feature folder during milestone 1, then never
touch those folders again.

PRECONDITION
A human has already created the Xcode project at ios/CrewSafety.xcodeproj with synchronised folders.
If it does not exist, stop and say so. Do not hand-write a project.pbxproj.

MILESTONES (finish and build each before starting the next)
1. Core: copy the Swift in plan sections 5.1, 5.2, 5.3 and 5.4 verbatim into Core/Models, Core/Services
   and Core/Stores. Add Core/Mocks/SampleData.swift (three crew members with fixed UUIDs, two sample
   events with source .simulated), PlaceholderMuseService (throws MuseError.serviceUnavailable),
   PlaceholderJournalAnalyzer (generatedBy .demo), PlaceholderTelemetryProvider (returns []).
2. Design system in Core/DesignSystem: Theme (spacing, colours from the asset catalogue), StatusBadge
   for CrewStatus, SimulatedBadge, EmptyStateView.
3. App: CrewSafetyApp creates EventStore, CrewStore, AppSettings and AppServices once and injects all
   four with .environment. AppConfig reads MUSE_BASE_URL from Info.plist. RootTabView has five tabs:
   Dashboard, Monitor, Alerts, MUSE, Journal. Stub views: CameraMonitorView, AlertsView, AlertBannerView,
   TelemetryCardView(crewMemberID:), MuseChatView, WellnessJournalView, each a labelled placeholder in
   its own feature folder. The Alerts tab shows a badge with eventStore.activeAlerts.count. Overlay
   AlertBannerView above the tab view.
4. Dashboard: DashboardView and DashboardViewModel. Crew cards showing name, role and the DERIVED status
   from CrewStore.status(for:events:); an active-alert summary; the ten most recent events with time,
   type, source and acknowledged state; TelemetryCardView for the monitored crew member. Empty states
   for no crew and no events. VoiceOver labels on status badges.
5. Settings sheet reachable from the dashboard toolbar: MUSE mode (live/demo) and base URL field,
   bound to AppSettings. Changing either rebuilds AppServices.muse.
6. Integration: when teammates tell you their real types are merged, replace the placeholders in
   CrewSafetyApp with SimulatedTelemetryProvider(), OnDeviceJournalAnalyzer(), and
   RemoteMuseService(baseURL:) or DemoMuseService() according to AppSettings.museMode.

BUILD SETTINGS YOU MUST SET
NSCameraUsageDescription ("Used on-device to detect a possible fall. Video is not stored or sent."),
NSAllowsLocalNetworking = YES, MUSE_BASE_URL.

TESTS
CoreTests.swift: EventStore orders newest first; acknowledge sets both fields and is idempotent;
CrewStore.status returns .alert with an unacknowledged critical event and reverts after acknowledge;
ChatResponseDTO decodes with and without the optional fields.
Build with xcodebuild for an iOS Simulator destination and run the tests. Report the exact commands
and their real output. If you cannot build, say so.

DELIVERABLE CHECKLIST
[ ] Project builds with zero errors      [ ] Five tabs navigate
[ ] Core matches plan section 5 exactly  [ ] Dashboard shows derived status and recent events
[ ] Settings sheet switches MUSE mode    [ ] CoreTests pass
[ ] Short note for teammates: how to inject the stores, where the stubs are, how to request a Core change
```

### 7.2 Developer 2 — Camera and possible-fall detection

```text
You are implementing Developer 2's workstream of a five-person, 24–36 hour hackathon project.

PROJECT
A native Swift/SwiftUI iPhone app, "CrewSafety", for a SIMULATED space crew: a dashboard, camera-based
possible-fall detection with in-app alerts, a NASA-research-grounded assistant called MUSE, and an
on-device wellness journal. It is a demo, not a medical device.
Read docs/BUILD_BRIEF.md and docs/EXECUTION_PLAN.md fully first. Plan section 5 holds the shared
contracts; they already exist in ios/CrewSafety/Core/ and you must not modify them.

GLOBAL RULES
- Swift, SwiftUI, AVFoundation and Vision only. iOS 17.0. Swift 5 language mode. No packages.
- Everything you build must work with no network connection.
- Camera frames are analysed in memory. Never write frames to disk and never transmit them.
- User-facing wording is "Possible fall" and "heuristic score". No injury, diagnosis or certainty claims.
- Events produced from replayed fixtures use source .replay and are labelled "Replay" on screen.

YOU OWN (edit only these)
ios/CrewSafety/Features/Camera/, ios/CrewSafety/Resources/PoseFixtures/, ios/CrewSafety/Resources/Clips/,
ios/CrewSafetyTests/FallDetectorTests.swift.
If adding a file changes project.pbxproj, stop and tell Developer 1.

INTERFACES YOU USE (from Core)
PoseFrame, PosePoint, FallDetectorConfig, FallDetection, FallDetecting, SafetyEvent, EventStore,
CrewStore. Read EventStore and CrewStore with @Environment. Emit with:
eventStore.record(SafetyEvent(crewMemberID: crewStore.monitoredCrewMemberID, type: .possibleFall,
  severity: .critical, source: .liveCamera or .replay, heuristicScore: d.score, details: d.explanation))

INTERFACE YOU PROVIDE
CameraMonitorView() with a no-argument initialiser, replacing the stub of the same name.

MILESTONES (finish and build each before the next)
1. HeuristicFallDetector: a struct conforming to FallDetecting, pure Swift, importing only Foundation.
   State machine: upright -> rapid drop -> low-posture hold -> emit, then cooldown. Use torso angle from
   vertical (root to neck; fall back to hip centre to shoulder centre), hip-centre height, and the
   config thresholds. Ignore joints below minJointConfidence. If the pose is lost during the hold, wait
   up to 1 s before resetting. The explanation string states the measured drop, duration and angle.
2. FallDetectorTests using synthetic PoseFrame sequences built in code: fast fall then stillness gives
   exactly one detection; sitting down gives none; lying down over 3 s gives none; walking gives none;
   two falls 5 s apart give one detection; two falls 20 s apart give two.
3. CameraService: AVCaptureSession on a private serial queue, back camera, portrait, video data output
   with alwaysDiscardsLateVideoFrames = true. Permission handling for notDetermined, authorized, denied
   and restricted. CameraPreviewView as a UIViewRepresentable over AVCaptureVideoPreviewLayer.
4. PoseEstimator: VNDetectHumanBodyPoseRequest on sampled frames at about 10 fps, mapped to PoseFrame
   with the joint keys listed in plan section 5.4. If several people are detected use the largest
   bounding box. Check the current Apple documentation for the exact Vision joint names and for
   orientation handling rather than relying on memory.
5. CameraMonitorViewModel (@Observable, @MainActor) and CameraMonitorView: preview, Start/Stop monitoring,
   state label (Idle, Monitoring, Possible fall detected), last detection explanation, permission-denied
   state with a button that opens Settings. Disable the idle timer while monitoring and restore it on
   stop or disappear. Stop the session when the view disappears.
6. Replay mode: a control that plays a bundled pose fixture (format in plan section 5.5) through the
   same detector in real time, with a visible "Replay" label. Add a debug-only recorder that saves the
   live PoseFrame stream to a JSON file in Documents so the team can capture real fixtures.
7. Optional, only if 1–6 are solid: skeleton overlay on the preview; video-clip replay through Vision.

TESTING
Run the unit tests with xcodebuild on a Simulator destination and report real output. The camera does
not work in the Simulator and Vision body pose may not either; say plainly which parts you could not
run. Give Developer 5 a manual device test list: stand, walk, sit, lie down slowly, safe simulated
fall onto a mat, person leaves the frame, low light.

DELIVERABLE CHECKLIST
[ ] Detector unit tests pass                 [ ] Live preview and permission flow on device
[ ] Fall on device records exactly one event [ ] Sit and slow lie-down record none
[ ] Replay works in airplane mode, labelled  [ ] At least five recorded fixtures committed
[ ] Final tuned config values and known failure cases written in the PR description
```

### 7.3 Developer 3 — MUSE backend and NASA retrieval

```text
You are implementing Developer 3's workstream of a five-person, 24–36 hour hackathon project.

PROJECT
A native SwiftUI iPhone app, "CrewSafety", for a SIMULATED space crew. You build the only server
component: a small Python FastAPI service that lets the in-app assistant, MUSE, answer wellness
questions using retrieval over a small curated set of NASA documents and return citations.
Read docs/BUILD_BRIEF.md and docs/EXECUTION_PLAN.md fully first. Plan section 5.3 is the API contract
and section 5.5 defines the file formats. Do not change the contract; raise changes with the team.

GLOBAL RULES
- NEVER invent a NASA document, title, URL, quotation or page number. The team supplies the source
  documents. If backend/sources/raw/ is empty, build everything else, leave manifest.json as [], make
  /chat return grounded:false, and tell the user which files are needed.
- Citations are built from manifest metadata of retrieved chunks, never from model output.
- No secrets in the repository. Read configuration from environment variables; provide .env.example.
- Keep dependencies minimal: fastapi, uvicorn, pydantic, pytest, httpx for tests, one BM25
  implementation (a small pure-Python one in retrieval.py is acceptable), and at most one LLM client.
- No diagnosis, no treatment instructions, no emergency guidance in any generated answer.

YOU OWN (edit only these)
backend/, docs/SOURCES.md, and the CONTENT of ios/CrewSafety/Resources/MuseFallbackAnswers.json.
Do not touch any Swift file.

MILESTONES (finish and test each before the next)
1. app/schemas.py: Pydantic models matching plan section 5.3 exactly, including the error body.
   Question is trimmed and must be 1–500 characters. Unknown context values become general_wellness.
2. scripts/build_index.py: read sources/manifest.json, extract text from each file in sources/raw/
   (plain text and HTML first; PDF only if the team supplies PDFs), split into chunks of roughly
   150–250 words keeping the section heading or page number, write sources/chunks.jsonl.
3. app/retrieval.py: BM25 over chunks, top 4, with a minimum score threshold below which nothing is
   returned. Tune the threshold with the test questions.
4. app/main.py: POST /chat and GET /health. Extractive mode: the answer is a short lead sentence
   followed by the top passages quoted verbatim, answerMode "extractive". No retrieved chunks: 200 with
   grounded false, empty citations, and an answer saying the corpus has no supporting material.
   Internal failure: 503 with the error body. CORS is not needed.
5. app/llm.py: one function generate(question, chunks) -> str, used only when MUSE_LLM_API_KEY is set.
   The provider and model are chosen by the team; ask the user which one and read its current
   documentation before writing the call. The system instruction: answer only from the supplied
   passages; say so when they do not cover the question; no diagnosis or treatment advice; do not
   write citations or URLs in the text. On any LLM error fall back to extractive mode, not to 503.
6. scripts/export_fallback.py: call the running service with a list of demo questions and write the
   responses in the MuseFallbackAnswers.json format from plan section 5.5.
7. docs/SOURCES.md: a table of every source with title, URL, sections used, retrieval date and a
   "verified by" column for Developer 5. backend/README.md: setup, run command binding 0.0.0.0, how the
   iPhone reaches it on the LAN, environment variables.

TESTS (backend/tests, pytest, run them and report real output)
Schema validation for empty and 501-character questions returns 400; an irrelevant question returns
grounded false and no citations; a relevant question returns at least one citation whose title and
URL appear in manifest.json; a forced retrieval exception returns 503; an LLM failure falls back to
extractive. Use a tiny fixture corpus of clearly artificial text under tests/fixtures, labelled as
test data, so the tests do not depend on the real corpus.

DELIVERABLE CHECKLIST
[ ] pytest passes                                [ ] /health reports document and chunk counts
[ ] /chat matches the contract byte-for-byte     [ ] No key or .env committed
[ ] SOURCES.md lists only documents the team supplied
[ ] MuseFallbackAnswers.json exported from real responses, or left as [] with the reason stated
[ ] Example curl commands and the development URL posted for Developer 4
```

### 7.4 Developer 4 — MUSE chat and wellness journal (iOS)

```text
You are implementing Developer 4's workstream of a five-person, 24–36 hour hackathon project.

PROJECT
A native Swift/SwiftUI iPhone app, "CrewSafety", for a SIMULATED space crew: a dashboard, camera-based
possible-fall detection with in-app alerts, a NASA-research-grounded assistant called MUSE (FastAPI
backend built by Developer 3), and an on-device wellness journal. It is a demo, not a medical device.
Read docs/BUILD_BRIEF.md and docs/EXECUTION_PLAN.md fully first. Plan section 5 holds the shared
contracts; they already exist in ios/CrewSafety/Core/ and you must not modify them.

GLOBAL RULES
- Swift and SwiftUI only. iOS 17.0. Swift 5 language mode. URLSession, Codable, NaturalLanguage,
  Foundation. No packages.
- The app never generates or invents an answer or a citation. It shows what the backend returned, or
  a bundled precomputed answer badged "Demo mode", or an error state.
- Journal text never leaves the device and is never sent to the MUSE backend.
- Journal summaries list self-reported themes only. No sentiment score, mood rating, risk level,
  diagnosis, or words such as "depressed", "anxious disorder", "at risk".
- No API keys or secrets anywhere in the app.

YOU OWN (edit only these)
ios/CrewSafety/Features/MuseChat/, ios/CrewSafety/Features/Journal/,
ios/CrewSafetyTests/MuseServiceTests.swift, ios/CrewSafetyTests/JournalTests.swift.
You read but do not edit ios/CrewSafety/Resources/MuseFallbackAnswers.json (Developer 3 owns its content).

INTERFACES YOU USE (from Core)
MuseService, MuseAnswer, MuseError, MuseContext, ChatMessage, ResearchCitation, ChatRequestDTO,
ChatResponseDTO, CitationDTO, APIErrorDTO, JournalAnalyzing, JournalEntry, JournalSummary, AppServices,
AppSettings, CrewStore. Read AppServices, AppSettings and CrewStore with @Environment.

INTERFACES YOU PROVIDE
MuseChatView() and WellnessJournalView() with no-argument initialisers (replacing the stubs),
RemoteMuseService(baseURL: URL), DemoMuseService(), OnDeviceJournalAnalyzer().

MILESTONES (finish and build each before the next)
1. MuseChatViewModel and MuseChatView: message list, text field, send button disabled while loading or
   when the trimmed question is empty or over 500 characters, the disclaimer under every assistant
   message, citations as tappable Link rows showing title and sectionOrPage, a "No supporting source
   found" note when grounded is false, a "Demo mode" badge when answerSource is .precomputed, and a
   distinct visible state for each MuseError case with a Retry button. Build this against
   services.muse so it works with the placeholder first.
2. RemoteMuseService: POST {baseURL}/chat with ChatRequestDTO, 15 s timeout, status and error mapping
   exactly as in plan section 5.3, invalid citation URLs dropped. Accept an injected URLSession so
   tests can use a URLProtocol stub.
3. DemoMuseService: load MuseFallbackAnswers.json from the bundle; match the question by keyword
   overlap; return source .precomputed; throw .noOfflineAnswer when the file is empty or nothing
   matches. Never fall back to generated text.
4. JournalStore (@Observable, @MainActor): entries newest first, add and delete, persisted as
   journal.json in Application Support with complete file protection, tolerant of a missing or corrupt
   file. JournalViewModel and WellnessJournalView: text editor, Save, dated history, entry detail,
   empty state, and a footer stating that entries stay on this device.
5. OnDeviceJournalAnalyzer: use NLTagger to pick salient nouns and match them against a small theme
   lexicon you define (for example sleep, workload, exercise, isolation, family, food, team). Produce
   JournalSummary(themes:, text: "You wrote about: …", generatedBy: .onDevice, disclaimer: "Summary of
   what you wrote. Not an assessment or diagnosis."). With no themes found, say so plainly.
6. Tell Developer 1 the exact initialisers to wire into CrewSafetyApp.

TESTS
MuseServiceTests: 200 decodes with and without the optional fields; 400, 503, timeout and offline map
to the right MuseError; DemoMuseService with an empty file throws .noOfflineAnswer.
JournalTests: add, persist, reload; corrupt file does not crash; analyzer output for sample sentences
contains expected themes and none of a banned-word list.
Build and run tests with xcodebuild on a Simulator destination and report real output. Test live
against Developer 3's URL when it exists and state clearly whether you did.

DELIVERABLE CHECKLIST
[ ] Chat works against placeholder, remote and demo services   [ ] Citations open in the browser
[ ] Every error case has its own visible state                 [ ] "Demo mode" badge appears
[ ] Journal entry survives relaunch                            [ ] Summary wording is non-diagnostic
[ ] Tests pass                                                 [ ] Wiring note sent to Developer 1
```

### 7.5 Developer 5 — Alerts, simulated telemetry, QA and demo

```text
You are implementing Developer 5's workstream of a five-person, 24–36 hour hackathon project.

PROJECT
A native Swift/SwiftUI iPhone app, "CrewSafety", for a SIMULATED space crew: a dashboard, camera-based
possible-fall detection with in-app alerts, a NASA-research-grounded assistant called MUSE, and an
on-device wellness journal. It is a demo, not a medical device.
Read docs/BUILD_BRIEF.md and docs/EXECUTION_PLAN.md fully first. Plan section 5 holds the shared
contracts; they already exist in ios/CrewSafety/Core/ and you must not modify them.

GLOBAL RULES
- Swift, SwiftUI and Swift Charts only. iOS 17.0. Swift 5 language mode. No packages.
- Every simulated value carries the SimulatedBadge from Core/DesignSystem, permanently visible.
- Alert wording is "Possible fall". Show the event source (Live camera, Replay, Simulated). No medical
  claims.
- Alerts must work with no network.

YOU OWN (edit only these)
ios/CrewSafety/Features/Alerts/, ios/CrewSafety/Features/Telemetry/,
ios/CrewSafetyTests/AlertsTests.swift, ios/CrewSafetyTests/TelemetryTests.swift,
docs/INTEGRATION_CHECKLIST.md, docs/DEMO_SCRIPT.md, demo/, .gitignore.

INTERFACES YOU USE (from Core)
EventStore, CrewStore, SafetyEvent, EventSeverity, EventSource, TelemetryProviding, TelemetrySample,
AppServices, StatusBadge, SimulatedBadge, EmptyStateView.

INTERFACES YOU PROVIDE
AlertsView(), AlertBannerView(), TelemetryCardView(crewMemberID: UUID) (replacing the stubs), and
SimulatedTelemetryProvider() conforming to TelemetryProviding.

MILESTONES (finish and build each before the next)
1. AlertBannerView: shows the newest unacknowledged event from EventStore with crew name, "Possible
   fall", relative time, source label and an Acknowledge button; hidden when there are none; animates
   in; fires one UINotificationFeedbackGenerator warning haptic when a new event id appears.
2. AlertsView: timeline of all events, active first, each row showing type, absolute timestamp,
   source, heuristic score as a percentage labelled "heuristic score", acknowledged state. A detail
   view shows the full details string and acknowledgedAt. Acknowledge from row and detail. Empty state.
   In DEBUG builds only, a toolbar button "Record test event" that records a SafetyEvent with type
   .manualTest and source .simulated.
3. SimulatedTelemetryProvider: deterministic heart rate (resting band with slow variation) and
   activity level, one sample every 10 s for the requested interval, seeded by crewMemberID so the same
   member shows the same curve. All samples have source .simulated.
4. TelemetryCardView: Swift Charts line for heart rate over the last 30 minutes, current value,
   SimulatedBadge in the card header, and an accessibility label that includes the word "simulated".
5. docs/INTEGRATION_CHECKLIST.md from plan section 8, and docs/DEMO_SCRIPT.md from plan section 9.
6. Citation verification: open every URL in docs/SOURCES.md and every citation in
   MuseFallbackAnswers.json, confirm the title and section match, fill in the "verified by" column, and
   report any mismatch to Developer 3. Do not correct a source by guessing.

TESTS
AlertsTests: recording an event makes it the banner's event; acknowledging removes it from
activeAlerts; acknowledging twice keeps the first acknowledgedAt.
TelemetryTests: sample count for an interval; all sources are .simulated; same seed gives same values;
heart-rate values stay inside the band you chose.
Build and run with xcodebuild on a Simulator destination and report real output.

DELIVERABLE CHECKLIST
[ ] Banner, timeline, detail and acknowledge work     [ ] Haptic fires once per new event
[ ] Telemetry card shows the Simulated badge          [ ] Tests pass
[ ] Integration checklist run on the demo device, with failures listed honestly
[ ] All citations verified or flagged                 [ ] Demo script rehearsed three times
[ ] Backup screen recording saved under demo/recordings/
```

---

## 8. Integration and testing plan

**Merge schedule:** hours 3, 6, 10, 16, 20. At each one Developer 1 pulls `main`, builds for the demo iPhone, and Developer 5 runs the checklist rows that apply. A red build on `main` is fixed before anyone continues feature work.

**Automated**

| Suite | Command | Owner |
| --- | --- | --- |
| iOS unit tests | `xcodebuild test -project ios/CrewSafety.xcodeproj -scheme CrewSafety -destination 'platform=iOS Simulator,name=<installed simulator>'` | each developer for their own file |
| Backend | `cd backend && pytest` | Dev 3 |

**Manual, on the demo iPhone** (maps to the brief's acceptance tests)

- [ ] App launches from a cold start without crashing.
- [ ] Dashboard shows at least one crew member with a status.
- [ ] First camera use prompts for permission; "Don't Allow" shows the denied state with a Settings link.
- [ ] A safe simulated fall produces exactly one `Possible fall` event.
- [ ] A replayed fall fixture produces one event labelled `Replay`.
- [ ] Sitting down and lying down slowly produce no event (three attempts each).
- [ ] Repeating a fall within 15 s does not produce a second alert.
- [ ] Banner shows timestamp and source; Acknowledge clears it; dashboard status returns to nominal.
- [ ] MUSE (live) answers a relevant question with citations that open the claimed document.
- [ ] MUSE answers an irrelevant question with "no supporting source found" and no citations.
- [ ] Backend stopped: chat shows the offline or unavailable state; app does not crash.
- [ ] Demo mode shows the "Demo mode" badge on every answer.
- [ ] Journal entry saves, shows a summary with the disclaimer, and survives relaunch.
- [ ] Airplane mode: dashboard, camera, detection, alerts, journal and telemetry all work.
- [ ] Telemetry chart shows `Simulated` at all times.
- [ ] `grep -rEi "api[_-]?key|secret|sk-" ios/` finds nothing that is a credential.
- [ ] No screen uses the words diagnosis, injury, or medical device except in a disclaimer.
- [ ] Ten minutes of continuous monitoring: no crash, phone does not lock, no runaway heat.
- [ ] Full demo script runs start to finish twice in a row.

**Known limits to state in the README and the pitch:** the heuristic assumes gravity, one person, a fixed camera and adequate light; it will miss some falls and flag some non-falls; the heuristic score is not a probability; telemetry is simulated; MUSE is informational and only as good as the small corpus.

---

## 9. Final hackathon demonstration script

About 2 minutes 45 seconds. One presenter talks, one operates the phone, one performs the fall onto a mat. Phone on a stand, mirrored to the projector.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Slide: problem | "Crews in isolated habitats have limited medical support and long stretches alone. We built a prototype that watches for a possible fall and puts NASA wellness research one question away. This is a hackathon prototype, not a medical device." |
| 0:20 | Dashboard | "This is a simulated crew. The heart-rate chart is simulated data and is labelled that way. Status is nominal." |
| 0:35 | Monitor tab, Start monitoring | "Pose estimation runs on the phone with Apple's Vision framework. No video is stored or sent." |
| 0:50 | Teammate falls onto the mat and stays down | "Our heuristic looks for a fast drop followed by staying low. It flags a *possible* fall." |
| 1:00 | Banner appears; open the alert | "Here is the alert: timestamp, the reason the heuristic fired, and a heuristic score, which is not a probability. Sitting or lying down slowly does not trigger it." |
| 1:15 | Acknowledge; back to dashboard | "A crewmate acknowledges it and the status clears." |
| 1:25 | MUSE tab; ask a prepared question on exercise or isolation | "MUSE retrieves passages from a small set of NASA documents we curated and answers only from those." |
| 1:45 | Answer with citations; tap one | "Every answer shows its sources, and they open the real document. If nothing relevant is found, it says so." |
| 2:00 | Journal tab; type a short note; save | "The journal stays on the device. The summary lists themes the person wrote about. It does not score mood or diagnose anything." |
| 2:20 | Slide: limitations and next steps | "Limits: the fall heuristic assumes gravity, one person and a fixed camera, and it will make mistakes. Vital signs are simulated. Next: validated sensors, a larger corpus, testing in an analog habitat." |

**If something fails live**

| Failure | Fallback | What to say |
| --- | --- | --- |
| Live detection does not fire | Use the Replay control | "Use this wording only after real fixtures exist: this is a replay of recorded motion. For the current generated fixtures, say: this is synthetic pose input through the same detector." |
| Backend unreachable | Switch MUSE to demo mode in settings | "We're offline, so this is a precomputed answer from the same system. It's labelled Demo mode." |
| App or phone fails | Play the backup recording | "This is a recording of the app from earlier today." |

Never describe a replay, a precomputed answer or the simulated chart as live or real.

---

## 10. Master implementation prompt for AI coding assistants

```text
You are an implementation agent on a five-person hackathon team building "CrewSafety": a native
Swift/SwiftUI iPhone app for simulated crew safety and wellness, with a small Python FastAPI service
for research retrieval. Five developers run agents like you at the same time in separate sessions, so
staying inside your lane matters as much as writing good code.

BEFORE YOU CHANGE ANYTHING
1. Read docs/BUILD_BRIEF.md and docs/EXECUTION_PLAN.md completely.
2. Inspect the repository: git status, git log, the folder tree, and every file under
   ios/CrewSafety/Core/. Describe what already exists in a few lines.
3. State which developer workstream you are working on, the files you own, the interfaces you depend
   on, and the acceptance test for the milestone you are about to start. If you were not told which
   workstream, ask.

ARCHITECTURE YOU MUST RESPECT
- SwiftUI is the application. No React Native, Flutter, web views or web frontends.
- iOS 17.0, Swift 5 language mode, Observation (@Observable), MVVM with one view model per screen.
- Shared state lives in EventStore, CrewStore, AppSettings and AppServices, injected through the
  SwiftUI environment. Features communicate only through types in Core/.
- The contracts in plan section 5 are frozen. Do not rename, reorder, add or remove anything in Core/
  or in the /chat API. If a contract is wrong or missing something, stop and write a short proposal
  for the team instead of changing it.
- Apple frameworks first. Add no third-party iOS dependency. On the backend add only what the plan lists.
- Anything that can run on the device runs on the device. Camera, detection, alerts, journal and
  telemetry must work with no network.

HOW TO WORK
- One milestone at a time, in the order your developer prompt gives. Make it build, then move on.
- Write complete, compilable, prototype-appropriate code. No TODO bodies, no fatalError placeholders,
  no "implement later" stubs. The only permitted non-real implementations are those the plan names as
  mock, placeholder, demo or simulated, and they must be labelled as such in code and on screen.
- Prefer the simplest thing that satisfies the acceptance test. No extra abstraction layers, generic
  frameworks, dependency-injection containers or configuration systems.
- Edit only files your workstream owns. Never modify, reformat, move or delete another developer's
  files, even to fix an obvious bug: report it instead. If adding a file changes project.pbxproj,
  stop and tell Developer 1.
- Never commit secrets. LLM keys live only in backend environment variables.

TRUTHFULNESS AND SAFETY
- Never invent NASA documents, titles, URLs, quotations or page numbers, including in sample data,
  tests, comments and UI copy. Sources are supplied by the team.
- Never present simulated, replayed or precomputed content as real or live. Label it on screen.
- Detections are "Possible fall". No diagnosis, injury or medical-device claims. Journal summaries
  report self-reported themes only.
- When an API of AVFoundation, Vision, NaturalLanguage, Swift Charts or an LLM provider matters, check
  current documentation instead of guessing.

VERIFICATION AND REPORTING
- After each milestone, build and run the relevant tests if the environment allows (xcodebuild for
  iOS, pytest for the backend). Show the command and its actual result.
- If you could not build, could not run tests, or could not test on a device, say so in plain words.
  Never write "tested" or "works" about something you did not run. Camera features cannot be verified
  in the Simulator; say that.
- Report failures and known limitations as they are, with the error text.

END EVERY MILESTONE WITH
1. Files created or changed.
2. What was verified, how, and what was not verified.
3. Integration notes for teammates: the symbols you now provide, their initialisers, what must be
   wired in CrewSafetyApp by Developer 1, and anything you need from another developer.
4. Assumptions you made where the plan was silent, each in one line.
```
