import Foundation
import Observation
import WatchConnectivity

/// The Watch side of WatchConnectivity: sends readings and check-in answers to the iPhone, and receives
/// "Are you OK?" requests from it.
@MainActor @Observable
final class PhoneLink: NSObject, WCSessionDelegate {
    static let shared = PhoneLink()

    struct CheckIn: Equatable { let id: String; let deadline: Date }
    private(set) var checkIn: CheckIn?
    private(set) var lastAnswer: String?

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func sendReading() {
        let monitor = MonitorSession.shared
        var message: [String: Any] = [WatchMessage.type: WatchMessage.reading,
                                      "monitoring": monitor.isMonitoring,
                                      "sentAt": Date().timeIntervalSince1970,
                                      "level": monitor.activityLevel]
        if let bpm = monitor.heartRate, let at = monitor.heartRateAt { message["hr"] = bpm; message["hrAt"] = at.timeIntervalSince1970 }
        if let moved = monitor.movedAt { message["movedAt"] = moved.timeIntervalSince1970 }
        send(message, reliable: false)
    }

    func answer(_ kind: String) {
        guard let checkIn else { return }
        send([WatchMessage.type: WatchMessage.answer, "id": checkIn.id, "kind": kind, "at": Date().timeIntervalSince1970], reliable: true)
        lastAnswer = kind
        self.checkIn = nil
    }

    func expire() { checkIn = nil }

    /// Readings are frequent, so a dropped one is fine. Answers must arrive: they fall back to a queued transfer.
    private func send(_ message: [String: Any], reliable: Bool) {
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated else { return }
        if session.isReachable {
            session.sendMessage(message, replyHandler: nil) { _ in
                if reliable { WCSession.default.transferUserInfo(message) }
            }
        } else if reliable {
            session.transferUserInfo(message)
        }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { handle(message) }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { handle(userInfo) }

    nonisolated private func handle(_ message: [String: Any]) {
        let type = message[WatchMessage.type] as? String, id = message["id"] as? String, deadline = message["deadline"] as? Double
        Task { @MainActor in
            let link = PhoneLink.shared
            if type == WatchMessage.checkIn, let id, let deadline, deadline > Date().timeIntervalSince1970 {
                link.checkIn = CheckIn(id: id, deadline: Date(timeIntervalSince1970: deadline))
                link.lastAnswer = nil
            } else if type == WatchMessage.cancelCheckIn, link.checkIn?.id == id {
                link.checkIn = nil
            }
        }
    }
}
