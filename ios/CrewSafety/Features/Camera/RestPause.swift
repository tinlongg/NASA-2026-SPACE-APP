import Foundation

/// A manual rest period (sleep, deliberate stillness). While paused the monitor raises no events.
/// Nothing is detected automatically; a person starts and ends it.
struct RestPause: Equatable {
    private(set) var until: Date?

    static let options: [(minutes: Int, label: String)] = [(15, "15 minutes"), (30, "30 minutes"), (60, "1 hour"), (120, "2 hours"), (240, "4 hours")]

    mutating func start(minutes: Int, now: Date = .now) {
        until = now.addingTimeInterval(TimeInterval(minutes * 60))
    }

    mutating func clear() { until = nil }

    func isPaused(at now: Date = .now) -> Bool {
        guard let until else { return false }
        return now < until
    }
}
