import SwiftUI

/// Small status dot, used in event rows and the camera status line.
struct StatusDot: View {
    let color: Color
    var body: some View {
        Circle().fill(color).frame(width: 6, height: 6).accessibilityHidden(true)
    }
}

struct StatusBadge: View {
    let status: CrewStatus

    private var foreground: Color {
        switch status {
        case .nominal: Theme.onAccent
        case .attention: Theme.onHighlight
        case .alert: Theme.onCritical
        }
    }

    var body: some View {
        Label(status.displayName, systemImage: status.symbolName)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, Theme.Spacing.s)
            .padding(.vertical, Theme.Spacing.xs)
            .foregroundStyle(foreground)
            .background(status.color, in: Capsule())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Status: \(status.displayName)")
    }
}

/// Must stay visible next to every simulated value. Do not hide it behind a tap or a scroll.
struct SimulatedBadge: View {
    var text: String = "Simulated"
    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(Theme.onHighlight)
            .background(Theme.highlight, in: Capsule())
            .accessibilityLabel("\(text) data")
    }
}

struct EmptyStateView: View {
    let title: String
    let systemImage: String
    var message: String? = nil
    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(Theme.secondaryText)
            Text(title).font(.headline)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Theme.secondaryText)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.xl)
        .accessibilityElement(children: .combine)
    }
}
