import SwiftUI
import UIKit

/// Graphite instrument-panel palette shared with the website (`web/dist/styles.css`): one indicator
/// green as the only accent, toned amber and red for warnings. The app is dark-only like the site.
enum Brand {
    static let bg = UIColor(hex: 0x121314)
    static let surface = UIColor(hex: 0x18191B)
    static let raised = UIColor(hex: 0x1F2023)
    static let field = UIColor(hex: 0x0E0F10)
    static let line = UIColor(hex: 0x2A2B2D)
    static let lineStrong = UIColor(hex: 0x3A3B3E)
    static let text = UIColor(hex: 0xECECEF)
    static let text2 = UIColor(hex: 0xA6A9AE)
    static let text3 = UIColor(hex: 0x75787E)
    static let green = UIColor(hex: 0x5CCF8E)
    static let amber = UIColor(hex: 0xD6A24E)
    static let red = UIColor(hex: 0xDF6A5E)

    static let accent = green
    static let onAccent = bg
    static let screen = bg
    static let card = surface
    static let border = line
    static let primaryText = text
    static let secondaryText = text2
    static let warning = amber
    static let critical = red
    static let onCritical = bg
}

enum Theme {
    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 24
    }

    static let cornerRadius: CGFloat = 12
    static let controlRadius: CGFloat = 8
    static let accent = Color(uiColor: Brand.accent)
    static let onAccent = Color(uiColor: Brand.onAccent)
    static let screenBackground = Color(uiColor: Brand.screen)
    static let cardBackground = Color(uiColor: Brand.card)
    static let cardBorder = Color(uiColor: Brand.border)
    static let primaryText = Color(uiColor: Brand.primaryText)
    static let secondaryText = Color(uiColor: Brand.secondaryText)
    static let warning = Color(uiColor: Brand.warning)
    static let critical = Color(uiColor: Brand.critical)
    static let onCritical = Color(uiColor: Brand.onCritical)
    static let highlight = Color(uiColor: Brand.amber)
    static let onHighlight = Color(uiColor: Brand.bg)
    static let raised = Color(uiColor: Brand.raised)
    static let tertiaryText = Color(uiColor: Brand.text3)

    // Semantic names used by the check-in, web camera and detector screens, mapped onto the brand palette.
    static var nominal: Color { accent }
    static var attention: Color { warning }
    static var alert: Color { critical }
    static var hairline: Color { cardBorder }
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

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
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
        case .nominal: Theme.accent
        case .attention: Theme.warning
        case .alert: Theme.critical
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
        case .warning: Theme.warning
        case .critical: Theme.critical
        }
    }
}

extension SafetyEventType {
    /// Detections are always worded as "Possible unresponsive", never as a confirmed condition.
    var displayName: String {
        switch self {
        case .possibleUnresponsive: "Possible unresponsive"
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
            .overlay {
                RoundedRectangle(cornerRadius: Theme.cornerRadius)
                    .strokeBorder(Theme.cardBorder, lineWidth: 1)
            }
    }
}
