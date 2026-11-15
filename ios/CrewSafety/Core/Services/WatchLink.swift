import Foundation
import HealthKit
import Observation
import WatchConnectivity

/// The iPhone side of the Apple Watch: receives heart rate, wrist movement and check-in answers from the
/// CrewSafety Watch app, starts Watch monitoring, and forwards "Are you OK?" requests to the Watch.
/// DashboardSync relays these readings to the website.
@MainActor @Observable
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()

    struct Answer: Equatable { let checkInID: String; let kind: String; let at: Date }

    private(set) var monitoring = false
    private(set) var heartRate: Double?
    private(set) var heartRateAt: Date?
    private(set) var movedAt: Date?
    private(set) var activityLevel: Double?
    private(set) var lastReadingAt: Date?
    private(set) var lastAnswer: Answer?
    private(set) var isPaired = false
    private(set) var isAppInstalled = false
    private(set) var status = "Checking for an Apple Watch…"
    /// Changes on every reading or answer, so the sync loop can send promptly.
    private(set) var version = 0

    /// Called with each heart-rate sample (for HealthKitTelemetryProvider).
    @ObservationIgnored var onHeartRate: ((Double, Date, Double?) -> Void)?
    @ObservationIgnored private var localAnswerHandlers: [String: (CrewCheckIn.Response) -> Void] = [:]
    @ObservationIgnored private var websiteCheckInID: String?
    @ObservationIgnored private let store = HKHealthStore()

    /// Readings arrived recently and the Watch says it is monitoring.
    var isStreaming: Bool { monitoring && (lastReadingAt.map { Date().timeIntervalSince($0) < 8 } ?? false) }

    func activate() {
        guard WCSession.isSupported() else { status = "This iPhone cannot connect to an Apple Watch."; return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Opens the CrewSafety Watch app and starts its monitoring session, without touching the Watch.
    func startWatchMonitoring() async {
        guard HKHealthStore.isHealthDataAvailable() else { status = "Health data is not available on this iPhone."; return }
        do {
            try await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [HKQuantityType(.heartRate)])
        } catch {
            status = "Health access was not granted: \(error.localizedDescription)"
            return
        }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .other
        configuration.locationType = .indoor
        status = "Starting the Watch app…"
        store.startWatchApp(with: configuration) { success, error in
            let message = success ? "Watch app started. Waiting for its first reading…" : "Could not start the Watch app: \(error?.localizedDescription ?? "unknown error"). Open CrewSafety on the Watch and tap Start."
            Task { @MainActor in WatchLink.shared.status = message }
        }
    }

    // MARK: Check-ins

    /// The iPhone camera's own check-in: the Watch vibrates, and its answer calls `onAnswer`.
    func requestCheckIn(id: String, deadline: Date, onAnswer: @escaping (CrewCheckIn.Response) -> Void) {
        localAnswerHandlers[id] = onAnswer
        send([WatchMessage.type: WatchMessage.checkIn, "id": id, "deadline": deadline.timeIntervalSince1970])
    }

    func cancelCheckIn(id: String) {
        localAnswerHandlers[id] = nil
        send([WatchMessage.type: WatchMessage.cancelCheckIn, "id": id])
    }

    /// The website's pending check-in, read from each sync reply. Forwards new ones and cancels ended ones.
    func syncWebsiteCheckIn(id: String?, expiresAt: Date?) {
        if let id, let expiresAt, id != websiteCheckInID, expiresAt > .now {
            websiteCheckInID = id
            send([WatchMessage.type: WatchMessage.checkIn, "id": id, "deadline": expiresAt.timeIntervalSince1970])
        } else if id == nil, let previous = websiteCheckInID {
            websiteCheckInID = nil
            send([WatchMessage.type: WatchMessage.cancelCheckIn, "id": previous])
        }
    }

    private func send(_ message: [String: Any]) {
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in WCSession.default.transferUserInfo(message) }
        } else {
            session.transferUserInfo(message)
        }
    }

    // MARK: Incoming

    fileprivate func receivedReading(monitoring: Bool, heartRate: Double?, heartRateAt: Date?, movedAt: Date?, level: Double?) {
        self.monitoring = monitoring
        if let heartRate, let heartRateAt, heartRateAt != self.heartRateAt {
            self.heartRate = heartRate
            self.heartRateAt = heartRateAt
            onHeartRate?(heartRate, heartRateAt, level)
        }
        if let movedAt { self.movedAt = movedAt }
        activityLevel = level
        lastReadingAt = .now
        status = monitoring ? "Watch monitoring" : "Watch connected, not monitoring"
        version += 1
    }

    fileprivate func receivedAnswer(id: String, kind: String, at: Date) {
        lastAnswer = Answer(checkInID: id, kind: kind, at: at)
        if let handler = localAnswerHandlers.removeValue(forKey: id) { handler(kind == "help" ? .help : .ok) }
        version += 1
    }

    fileprivate func updateState(paired: Bool, installed: Bool) {
        isPaired = paired
        isAppInstalled = installed
        if !paired { status = "No Apple Watch is paired with this iPhone." }
        else if !installed { status = "Install CrewSafety on the Apple Watch (Watch app → Available apps)." }
        else if lastReadingAt == nil { status = "Watch ready. Tap Start Watch monitoring." }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let paired = session.isPaired, installed = session.isWatchAppInstalled
        Task { @MainActor in WatchLink.shared.updateState(paired: paired, installed: installed) }
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        let paired = session.isPaired, installed = session.isWatchAppInstalled
        Task { @MainActor in WatchLink.shared.updateState(paired: paired, installed: installed) }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { handle(message) }
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { handle(userInfo) }

    nonisolated private func handle(_ message: [String: Any]) {
        let date = { (key: String) in (message[key] as? Double).map { Date(timeIntervalSince1970: $0) } }
        switch message[WatchMessage.type] as? String {
        case WatchMessage.reading?:
            let monitoring = message["monitoring"] as? Bool ?? false, heartRate = message["hr"] as? Double, level = message["level"] as? Double
            let heartRateAt = date("hrAt"), movedAt = date("movedAt")
            Task { @MainActor in WatchLink.shared.receivedReading(monitoring: monitoring, heartRate: heartRate, heartRateAt: heartRateAt, movedAt: movedAt, level: level) }
        case WatchMessage.answer?:
            guard let id = message["id"] as? String, let kind = message["kind"] as? String, ["ok", "help"].contains(kind) else { return }
            let at = date("at") ?? .now
            Task { @MainActor in WatchLink.shared.receivedAnswer(id: id, kind: kind, at: at) }
        default:
            return
        }
    }
}
