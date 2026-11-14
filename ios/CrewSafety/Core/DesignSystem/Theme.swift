import SwiftUI

enum Theme {
    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 24
    }
    static let cornerRadius: CGFloat = 14
    static let cardBackground = Color(.secondarySystemGroupedBackground)
    static let screenBackground = Color(.systemGroupedBackground)
}

extension CrewStatus {
    var displayName: String {
        switch self {
        case .nominal: "Nominal"
        case .attention: "Attention"
        case .alert: "Alert"
        }
    }
    var color: Color {
        switch self {
        case .nominal: .green
        case .attention: .orange
        case .alert: .red
        }
    }
    var symbolName: String {
        switch self {
        case .nominal: "checkmark.circle.fill"
        case .attention: "exclamationmark.circle.fill"
        case .alert: "exclamationmark.triangle.fill"
        }
    }
}

extension EventSeverity {
    var displayName: String {
        switch self {
        case .info: "Info"
        case .warning: "Warning"
        case .critical: "Critical"
        }
    }
    var color: Color {
        switch self {
        case .info: .blue
        case .warning: .orange
        case .critical: .red
        }
    }
}

extension SafetyEventType {
    /// Detections are always worded as "Possible fall", never as a confirmed fall or injury.
    var displayName: String {
        switch self {
        case .possibleFall: "Possible fall"
        case .manualTest: "Test event"
        }
    }
}

extension EventSource {
    var displayName: String {
        switch self {
        case .liveCamera: "Live camera"
        case .replay: "Replay"
        case .simulated: "Simulated"
        }
    }
}

/// Standard card container used on the dashboard and available to every feature.
struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: Theme.cornerRadius))
    }
}
