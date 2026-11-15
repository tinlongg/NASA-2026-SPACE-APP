import Foundation

/// The "Are you OK?" step after a possible-unresponsive alert. Pure logic: no timers, audio or UI.
///
/// idle -> awaiting (countdown) -> resolved(outcome). The caller drives time with `tick(now:)`
/// and feeds answers with `respond(_:at:)`. Once resolved, further answers and ticks are ignored.
struct CrewCheckIn {
    enum Response: Equatable { case ok, help }

    enum State: Equatable {
        case idle
        case awaiting(startedAt: Date, deadline: Date)
        case resolved(CheckInOutcome)
    }

    let duration: TimeInterval
    private(set) var state: State = .idle

    init(duration: TimeInterval) {
        self.duration = duration
    }

    var isAwaiting: Bool {
        if case .awaiting = state { return true }
        return false
    }

    mutating func start(at now: Date) {
        state = .awaiting(startedAt: now, deadline: now.addingTimeInterval(duration))
    }

    mutating func reset() {
        state = .idle
    }

    /// Seconds left before the check-in escalates. Zero when not awaiting.
    func remaining(at now: Date) -> TimeInterval {
        guard case .awaiting(_, let deadline) = state else { return 0 }
        return max(0, deadline.timeIntervalSince(now))
    }

    /// Records an answer. Returns the outcome if this answer resolved the check-in.
    mutating func respond(_ response: Response, at now: Date) -> CheckInOutcome? {
        guard case .awaiting(let startedAt, let deadline) = state else { return nil }
        // An answer that arrives after the deadline is too late; the timeout wins.
        if now >= deadline { return tick(now: now) }
        let elapsed = now.timeIntervalSince(startedAt)
        let outcome: CheckInOutcome = switch response {
        case .ok: .respondedOK(after: elapsed)
        case .help: .requestedHelp(after: elapsed)
        }
        state = .resolved(outcome)
        return outcome
    }

    /// Advances time. Returns `.noResponse` once, when the deadline passes.
    mutating func tick(now: Date) -> CheckInOutcome? {
        guard case .awaiting(let startedAt, let deadline) = state, now >= deadline else { return nil }
        let outcome = CheckInOutcome.noResponse(after: deadline.timeIntervalSince(startedAt))
        state = .resolved(outcome)
        return outcome
    }

    // MARK: Voice

    private static let helpPhrases = ["help", "hurt", "emergency", "can't get up", "cannot get up", "dizzy", "can't breathe"]
    private static let okWords: Set<String> = ["ok", "okay", "fine", "good", "alright"]
    // "No" is left out on purpose: "No, I'm fine" means OK.
    private static let negations: Set<String> = ["not", "never", "isn't", "ain't"]

    /// Maps a speech transcript to an answer. Help wins over OK, and a negated OK ("not okay") is help.
    /// Returns nil for anything else, so background talk never resolves the check-in.
    static func classify(transcript: String) -> Response? {
        let text = transcript.lowercased()
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "all right", with: "alright")
        if helpPhrases.contains(where: { text.contains($0) }) { return .help }

        let words = text.split { !$0.isLetter && $0 != "'" }.map(String.init)
        for (i, word) in words.enumerated() where okWords.contains(word) {
            let before = words[max(0, i - 2)..<i]
            if before.contains(where: { negations.contains($0) }) { return .help }
            return .ok
        }
        return nil
    }
}
