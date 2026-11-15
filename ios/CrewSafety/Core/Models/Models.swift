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
enum SafetyEventType: String, Codable, Sendable { case possibleUnresponsive, manualTest }

enum EventSeverity: Int, Codable, Sendable, Comparable {
    case info = 0, warning = 1, critical = 2
    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Where the event came from. Shown in the UI so replayed/simulated events are never mistaken for live ones.
enum EventSource: String, Codable, Sendable { case liveCamera, replay, simulated, webCamera }

/// What happened when the app asked "Are you OK?" after a no-movement alert.
enum CheckInOutcome: Codable, Hashable, Sendable {
    case respondedOK(after: TimeInterval)
    case requestedHelp(after: TimeInterval)
    case noResponse(after: TimeInterval)

    var summary: String {
        switch self {
        case .respondedOK(let s): "Responded OK after \(Int(s.rounded())) s"
        case .requestedHelp(let s): "Asked for help after \(Int(s.rounded())) s"
        case .noResponse(let s): "No response after \(Int(s.rounded())) s"
        }
    }
}

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
    /// Result of the "Are you OK?" check-in, when one ran.
    var checkIn: CheckInOutcome?

    init(id: UUID = UUID(), crewMemberID: UUID, type: SafetyEventType, timestamp: Date = .now,
         severity: EventSeverity, source: EventSource, heuristicScore: Double? = nil,
         details: String, acknowledged: Bool = false, acknowledgedAt: Date? = nil,
         checkIn: CheckInOutcome? = nil) {
        self.id = id; self.crewMemberID = crewMemberID; self.type = type; self.timestamp = timestamp
        self.severity = severity; self.source = source; self.heuristicScore = heuristicScore
        self.details = details; self.acknowledged = acknowledged; self.acknowledgedAt = acknowledgedAt
        self.checkIn = checkIn
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
    // Legacy local summaries remain decodable but are no longer produced or displayed.
    var summary: JournalSummary?
    var reflection: JournalReflection? = nil
}


/// Only user-facing feedback crosses the API. Sentiment and analysis stay on the server.
struct JournalReflection: Codable, Hashable, Sendable {
    static let minimumEntries = 3
    var collectiveSuggestionsReady: Bool { context.entryCount >= Self.minimumEntries }
    struct Context: Codable, Hashable, Sendable {
        let entryCount: Int
        var minimumEntries: Int? = nil
        let from: String
        let to: String
    }
    let message: String
    let suggestions: [String]
    let question: String
    let context: Context
    let model: String
    let generatedAt: String
    var demo: Bool? = nil
}
