import Foundation
import Observation

/// Foreground-only, opt-in sync. No camera frames, journal text or chat is encoded.
@MainActor @Observable
final class DashboardSync {
    var status = "Not connected"
    var lastSynced: Date?
    private let deviceID: UUID

    init() {
        let key = "crewSafetyDashboardDeviceID"
        if let value = UserDefaults.standard.string(forKey: key), let id = UUID(uuidString: value) {
            deviceID = id
        } else {
            deviceID = UUID()
            UserDefaults.standard.set(deviceID.uuidString, forKey: key)
        }
    }

    private struct Payload: Encodable {
        let deviceID: UUID
        let crew: [CrewMember]
        let monitoredCrewMemberID: UUID
        let events: [SafetyEvent]
        let telemetry: [TelemetrySample]
    }
    private struct RemoteState: Decodable { let events: [SafetyEvent] }
    private struct Reply: Decodable { let snapshot: RemoteState }

    func run(settings: AppSettings, crew: CrewStore, events: EventStore, services: AppServices) async {
        guard settings.dashboardSyncEnabled else { status = "Not connected"; return }
        let raw = settings.dashboardBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let code = settings.dashboardPairingCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let base = URL(string: raw), let host = base.host, !host.isEmpty,
              ["http", "https"].contains(base.scheme?.lowercased() ?? ""),
              base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
              code.count == 32, code.allSatisfy({ $0.isHexDigit }) else {
            status = "Enter the backend address and 32-character pairing code from the website."
            return
        }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .millisecondsSince1970
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .millisecondsSince1970
        status = "Connecting…"
        while !Task.isCancelled {
            do {
                let payload = Payload(deviceID: deviceID, crew: crew.crew,
                                      monitoredCrewMemberID: crew.monitoredCrewMemberID,
                                      events: Array(events.events.prefix(500)),
                                      telemetry: services.telemetry.samples(for: crew.monitoredCrewMemberID, last: 30 * 60, now: .now))
                var request = URLRequest(url: base.appendingPathComponent("sync/state"))
                request.httpMethod = "PUT"
                request.timeoutInterval = 10
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("Bearer \(code)", forHTTPHeaderField: "Authorization")
                request.httpBody = try encoder.encode(payload)
                let (data, response) = try await URLSession.shared.data(for: request)
                try Task.checkCancellation()
                guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                if response.statusCode == 401 {
                    status = "Pairing expired or code invalid. Create a new website session."
                    return
                }
                if response.statusCode == 409 {
                    status = "Session belongs to another iPhone. Create a new website session."
                    return
                }
                guard response.statusCode == 200 else { throw URLError(.badServerResponse) }
                let reply = try decoder.decode(Reply.self, from: data)
                events.mergeSynced(reply.snapshot.events)
                lastSynced = .now
                status = "Connected · updates every 3 seconds"
            } catch {
                if Task.isCancelled { return }
                status = "Disconnected · retrying. Local monitoring still works."
            }
            do { try await Task.sleep(for: .seconds(3)) } catch { return }
        }
    }
}
