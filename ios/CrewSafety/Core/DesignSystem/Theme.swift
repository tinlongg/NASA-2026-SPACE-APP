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

    /// NASA blue. Lifted in dark mode so it keeps contrast on dark surfaces.
    static let accent = Color(light: 0x0B3D91, dark: 0x5A8DEE)
    /// Hairline border for cards, the label color at low opacity.
    static let hairline = Color.primary.opacity(0.08)

    /// Semantic colors, toned down to sit inside the palette. Red is reserved for real alerts.
    static let nominal = Color(light: 0x2E8B57, dark: 0x4CC38A)
    static let attention = Color(light: 0xA86400, dark: 0xF0A33A)
    static let alert = Color(light: 0xC8102E, dark: 0xFC3D21)
}

extension Color {
    /// A color that resolves to a different hex value in light and dark mode.
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255,
                           green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255,
                           alpha: 1)
        })
    }
}

extension Date {
    /// Mission-style timestamp in GMT, like "GMT 318 · 14:02" (day of year, then hours and minutes).
    var missionTimestamp: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "GMT")!
        let day = calendar.ordinality(of: .day, in: .year, for: self) ?? 0
        let parts = calendar.dateComponents([.hour, .minute], from: self)
        return String(format: "GMT %03d · %02d:%02d", day, parts.hour ?? 0, parts.minute ?? 0)
    }
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
        case .nominal: Theme.nominal
        case .attention: Theme.attention
        case .alert: Theme.alert
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
        case .info: Theme.accent
        case .warning: Theme.attention
        case .critical: Theme.alert
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
        case .webCamera: "Web camera"
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
            .overlay(RoundedRectangle(cornerRadius: Theme.cornerRadius).strokeBorder(Theme.hairline, lineWidth: 0.5))
    }
}
