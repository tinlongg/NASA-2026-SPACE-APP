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
    private struct CheckInRequest: Decodable { let id: String; let expiresAt: Double }
    private struct RemoteState: Decodable { let events: [SafetyEvent]; let checkInRequest: CheckInRequest? }
    private struct WearableReply: Decodable { let checkInRequest: CheckInRequest? }
    /// Apple Watch readings for the website, in Unix milliseconds. Nil fields are left out.
    private struct WearablePayload: Encodable {
        struct Answer: Encodable { let checkInID: String; let kind: String; let at: Double }
        let deviceID: UUID
        let sentAt: Double
        let monitoring: Bool
        let heartRateBPM: Double?
        let heartRateAt: Double?
        let movedAt: Double?
        let activityLevel: Double?
        let answer: Answer?
    }
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
        // The Watch channel runs beside the 3-second snapshot loop and stops with it.
        let wearable = Task { await self.wearableLoop(base: base, code: code) }
        defer { wearable.cancel() }
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
                WatchLink.shared.syncWebsiteCheckIn(id: reply.snapshot.checkInRequest?.id,
                                                    expiresAt: reply.snapshot.checkInRequest.map { Date(timeIntervalSince1970: $0.expiresAt / 1000) })
                lastSynced = .now
                status = "Connected · updates every 3 seconds"
            } catch {
                if Task.isCancelled { return }
                status = "Disconnected · retrying. Local monitoring still works."
            }
            do { try await Task.sleep(for: .seconds(3)) } catch { return }
        }
    }

    /// Sends Watch readings promptly (at most once a second when something changed) and every 2 seconds
    /// as a heartbeat, so wrist movement reaches the website well within the 15-second stillness timer.
    private func wearableLoop(base: URL, code: String) async {
        let link = WatchLink.shared, encoder = JSONEncoder(), decoder = JSONDecoder()
        var lastVersion = -1, lastSent = Date.distantPast
        while !Task.isCancelled {
            let now = Date.now, since = now.timeIntervalSince(lastSent)
            if link.lastReadingAt != nil, (link.version != lastVersion && since >= 1) || since >= 2 {
                lastVersion = link.version; lastSent = now
                let ms = { (date: Date?) in date.map { min($0, now).timeIntervalSince1970 * 1000 } } // Watch and iPhone clocks can differ slightly
                let answer = link.lastAnswer.flatMap { now.timeIntervalSince($0.at) < 120 ? WearablePayload.Answer(checkInID: $0.checkInID, kind: $0.kind, at: min($0.at, now).timeIntervalSince1970 * 1000) : nil }
                let payload = WearablePayload(deviceID: deviceID, sentAt: now.timeIntervalSince1970 * 1000, monitoring: link.isStreaming,
                                              heartRateBPM: link.heartRate, heartRateAt: ms(link.heartRateAt), movedAt: ms(link.movedAt),
                                              activityLevel: link.activityLevel, answer: answer)
                var request = URLRequest(url: base.appendingPathComponent("sync/wearable"))
                request.httpMethod = "PUT"
                request.timeoutInterval = 5
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("Bearer \(code)", forHTTPHeaderField: "Authorization")
                request.httpBody = try? encoder.encode(payload)
                if let (data, response) = try? await URLSession.shared.data(for: request),
                   (response as? HTTPURLResponse)?.statusCode == 200,
                   let reply = try? decoder.decode(WearableReply.self, from: data) {
                    link.syncWebsiteCheckIn(id: reply.checkInRequest?.id,
                                            expiresAt: reply.checkInRequest.map { Date(timeIntervalSince1970: $0.expiresAt / 1000) })
                }
            }
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
        }
    }
}
