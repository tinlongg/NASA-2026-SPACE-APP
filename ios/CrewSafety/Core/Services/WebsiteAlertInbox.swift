import Foundation

/// An alert the website's camera raised, relayed through the pairing session.
struct WebsiteAlert: Decodable, Equatable {
    enum Kind: String, Decodable { case checkin, alert, resolved }
    let id: String
    let person: String
    let kind: Kind
    let reason: String
    /// Server time, Unix milliseconds.
    let at: Double

    /// A check-in, its alert and its resolution share a group (the id without the "-kind" ending),
    /// so they replace and clear the same notification.
    var group: String {
        let suffix = "-\(kind.rawValue)"
        return id.hasSuffix(suffix) ? String(id.dropLast(suffix.count)) : id
    }
}

/// Decides which website alerts to show as notifications. Pure apart from its remembered ids.
struct WebsiteAlertInbox {
    enum Action: Equatable {
        case show(id: String, title: String, body: String)
        case clear(id: String)
    }
    /// Alerts older than this are skipped, so opening the app later doesn't replay old alerts.
    static let maxAge: TimeInterval = 120
    private(set) var seen: [String]

    init(seen: [String] = []) { self.seen = seen }

    /// `serverNow` is the server's clock in Unix milliseconds (the newest alert or reply time is close enough).
    mutating func receive(_ alerts: [WebsiteAlert], serverNow: Double) -> [Action] {
        var actions: [Action] = []
        for alert in alerts where !seen.contains(alert.id) {
            seen.append(alert.id)
            let notificationID = "website-\(alert.group)"
            if alert.kind == .resolved { actions.append(.clear(id: notificationID)); continue }
            guard serverNow - alert.at <= Self.maxAge * 1000 else { continue }
            let reason = alert.reason.isEmpty ? "" : " \(alert.reason)"
            switch alert.kind {
            case .checkin:
                actions.append(.show(id: notificationID, title: "Are you OK? check · \(alert.person)",
                                     body: "The website camera is checking on \(alert.person).\(reason)"))
            case .alert:
                actions.append(.show(id: notificationID, title: "No movement · \(alert.person)",
                                     body: "Possible unresponsive crew member.\(reason) Go and check on them."))
            case .resolved: break
            }
        }
        if seen.count > 100 { seen.removeFirst(seen.count - 100) }
        return actions
    }
}
