import SwiftUI
import UIKit

/// Colors sampled from the NASA Space Apps Houston 2026 event page
/// (spaceappschallenge.org). The site pairs a near-black/white base with
/// neon yellow calls to action and electric blue links.
enum Brand {
    static let neonYellow = UIColor(hex: 0xE7F434)
    static let neonBlue = UIColor(hex: 0x0050D8)
    static let blueYonder = UIColor(hex: 0x2491FF)
    static let nearBlack = UIColor(hex: 0x1B1B1B)
    static let deepBlue = UIColor(hex: 0x151622)
    static let electricBlue = UIColor(hex: 0x1B2B85)
    static let cloudGray = UIColor(hex: 0xDFE1E2)
    static let clayGray = UIColor(hex: 0x8D9297)
    static let slateGray = UIColor(hex: 0x3D4551)
    static let oxideOrange = UIColor(hex: 0xFF5804)
    static let nasaRed = UIColor(hex: 0xE52207)
    static let paleYellow = UIColor(hex: 0xFAFAAD)
    static let lightGray = UIColor(hex: 0xEEEEEE)

    // Adaptive roles. Dark mode uses the site's deep-blue and near-black surfaces.
    static let accent = UIColor { $0.userInterfaceStyle == .dark ? blueYonder : neonBlue }
    static let onAccent = UIColor { $0.userInterfaceStyle == .dark ? nearBlack : .white }
    static let screen = UIColor { $0.userInterfaceStyle == .dark ? deepBlue : lightGray }
    static let card = UIColor { $0.userInterfaceStyle == .dark ? nearBlack : .white }
    static let border = UIColor { $0.userInterfaceStyle == .dark ? slateGray : cloudGray }
    static let primaryText = UIColor { $0.userInterfaceStyle == .dark ? .white : nearBlack }
    static let secondaryText = UIColor { $0.userInterfaceStyle == .dark ? clayGray : slateGray }
    static let warning = oxideOrange
    /// The NASA red is lightened in dark mode so critical text keeps its contrast.
    static let critical = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0xFF6B5A) : nasaRed }
    static let onCritical = UIColor { $0.userInterfaceStyle == .dark ? nearBlack : .white }
}

enum Theme {
    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 24
    }

    /// Named brand colors for features that need an explicit palette value.
    enum Palette {
        static let neonYellow = Color(uiColor: Brand.neonYellow)
        static let neonBlue = Color(uiColor: Brand.neonBlue)
        static let blueYonder = Color(uiColor: Brand.blueYonder)
        static let nearBlack = Color(uiColor: Brand.nearBlack)
        static let deepBlue = Color(uiColor: Brand.deepBlue)
        static let electricBlue = Color(uiColor: Brand.electricBlue)
        static let cloudGray = Color(uiColor: Brand.cloudGray)
        static let clayGray = Color(uiColor: Brand.clayGray)
        static let slateGray = Color(uiColor: Brand.slateGray)
        static let oxideOrange = Color(uiColor: Brand.oxideOrange)
        static let nasaRed = Color(uiColor: Brand.nasaRed)
        static let paleYellow = Color(uiColor: Brand.paleYellow)
    }

    static let cornerRadius: CGFloat = 14
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
    static let highlight = Color(uiColor: Brand.neonYellow)
    static let onHighlight = Color(uiColor: Brand.nearBlack)

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
            .overlay {
                RoundedRectangle(cornerRadius: Theme.cornerRadius)
                    .strokeBorder(Theme.cardBorder, lineWidth: 1)
            }
    }
}
