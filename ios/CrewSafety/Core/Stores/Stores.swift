import Foundation
import Observation

// MARK: - Shared stores (concrete; owned by Dev 1)
@MainActor @Observable
final class EventStore {
    /// Newest first.
    private(set) var events: [SafetyEvent] = []

    var activeAlerts: [SafetyEvent] { events.filter { !$0.acknowledged } }
    var highestActiveSeverity: EventSeverity? { activeAlerts.map(\.severity).max() }

    init(events: [SafetyEvent] = []) { self.events = events.sorted { $0.timestamp > $1.timestamp } }

    func record(_ event: SafetyEvent) { events.insert(event, at: 0) }

    func mergeSynced(_ remote: [SafetyEvent]) {
        for event in remote {
            if let index = events.firstIndex(where: { $0.id == event.id }) {
                if event.acknowledged && !events[index].acknowledged {
                    events[index].acknowledged = true
                    events[index].acknowledgedAt = event.acknowledgedAt
                }
            } else {
                events.append(event)
            }
        }
        events.sort { $0.timestamp > $1.timestamp }
    }

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
    /// The crew member the camera session and journal are attributed to.
    var monitoredCrewMemberID: UUID

    init(crew: [CrewMember], monitoredCrewMemberID: UUID) {
        self.crew = crew; self.monitoredCrewMemberID = monitoredCrewMemberID
    }

    /// Status is derived, not stored: any unacknowledged critical/warning event wins over the base status.
    func status(for member: CrewMember, events: EventStore) -> CrewStatus {
        switch events.activeAlerts(for: member.id).map(\.severity).max() {
        case .critical?: return .alert
        case .warning?: return .attention
        default: return member.status
        }
    }
}

@MainActor @Observable
final class AppSettings {
    var dashboardSyncEnabled = false
    var dashboardBaseURL = "https://crew-safety-connected.lustrousbush32.chatgpt.site"
    var dashboardPairingCode = ""
    var dashboardSyncKey: String { "\(dashboardSyncEnabled)|\(dashboardBaseURL)|\(dashboardPairingCode)" }
}

@MainActor @Observable
final class AppServices {
    var journalAnalyzer: any JournalAnalyzing
    var telemetry: any TelemetryProviding
    init(journalAnalyzer: any JournalAnalyzing, telemetry: any TelemetryProviding) {
        self.journalAnalyzer = journalAnalyzer; self.telemetry = telemetry
    }
}

