import Foundation
import Observation

@MainActor @Observable
final class DashboardViewModel {
    let recentEventLimit = 10

    func recentEvents(in store: EventStore) -> [SafetyEvent] {
        Array(store.events.prefix(recentEventLimit))
    }

    func crewName(for id: UUID, in crewStore: CrewStore) -> String {
        crewStore.crew.first { $0.id == id }?.displayName ?? "Unknown crew member"
    }

    func alertSummary(for store: EventStore) -> String {
        let count = store.activeAlerts.count
        switch count {
        case 0: return "No unacknowledged alerts"
        case 1: return "1 unacknowledged alert"
        default: return "\(count) unacknowledged alerts"
        }
    }
}
