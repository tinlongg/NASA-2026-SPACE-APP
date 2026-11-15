import Foundation

/// Fixed sample data for the simulated crew. Every event here is `source: .simulated`.
enum SampleData {
    static let monitoredID = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
    private static let secondID = UUID(uuidString: "00000000-0000-4000-8000-000000000002")!
    private static let thirdID = UUID(uuidString: "00000000-0000-4000-8000-000000000003")!

    static var crew: [CrewMember] {
        let now = Date()
        return [
            CrewMember(id: monitoredID, displayName: "Crew Member A", role: "Commander (simulated)",
                       status: .nominal, lastUpdated: now),
            CrewMember(id: secondID, displayName: "Crew Member B", role: "Flight Engineer (simulated)",
                       status: .nominal, lastUpdated: now),
            CrewMember(id: thirdID, displayName: "Crew Member C", role: "Science Officer (simulated)",
                       status: .nominal, lastUpdated: now),
        ]
    }

    static var events: [SafetyEvent] {
        let now = Date()
        // Start with a clean incident state: history only, no active alert banner.
        return [
            SafetyEvent(crewMemberID: monitoredID, type: .manualTest, timestamp: now.addingTimeInterval(-3600),
                        severity: .info, source: .simulated,
                        details: "Sample event created at launch to show an acknowledged entry.",
                        acknowledged: true, acknowledgedAt: now.addingTimeInterval(-3500)),
        ]
    }
}
