import Foundation

// MARK: - Crew
enum CrewStatus: String, Codable, Sendable, CaseIterable { case nominal, attention, alert }

struct CrewMember: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var displayName: String
    var role: String
    var status: CrewStatus
    var lastUpdated: Date
}

// MARK: - Safety events
enum SafetyEventType: String, Codable, Sendable { case possibleFall, manualTest }

enum EventSeverity: Int, Codable, Sendable, Comparable {
    case info = 0, warning = 1, critical = 2
    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Where the event came from. Shown in the UI so replayed/simulated events are never mistaken for live ones.
enum EventSource: String, Codable, Sendable { case liveCamera, replay, simulated }

struct SafetyEvent: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let crewMemberID: UUID
    let type: SafetyEventType
    let timestamp: Date
    let severity: EventSeverity
    let source: EventSource
    /// 0...1 heuristic score. NOT a calibrated probability; label it "heuristic score" in UI.
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

// MARK: - Telemetry
enum TelemetrySource: String, Codable, Sendable { case simulated, healthKit }

struct TelemetrySample: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let crewMemberID: UUID
    let timestamp: Date
    let heartRateBPM: Double?
    /// 0...1 relative activity level.
    let activityLevel: Double?
    let source: TelemetrySource
}

// MARK: - Journal
enum SummarySource: String, Codable, Sendable { case onDevice, demo }

struct JournalSummary: Codable, Hashable, Sendable {
    /// Self-reported themes found in the text (e.g. "sleep", "workload"). Never a mood score or diagnosis.
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

// MARK: - MUSE chat
enum ChatRole: String, Codable, Sendable { case user, assistant }

/// `.live` = returned by the backend for this question. `.precomputed` = bundled demo answer.
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
    /// false when retrieval found nothing relevant; UI must then show "no supporting source found".
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
    case invalidQuestion          // HTTP 400 or empty/too-long input
    case serviceUnavailable       // HTTP 503
    case offline                  // no network / host unreachable
    case timeout
    case badResponse              // undecodable or unexpected status
    case noOfflineAnswer          // demo mode has no precomputed answer for this question
}

