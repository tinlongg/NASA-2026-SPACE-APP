import SwiftUI

/// Small status dot, the one place a status color appears as a shape.
struct StatusDot: View {
    let color: Color
    var body: some View {
        Circle().fill(color).frame(width: 6, height: 6).accessibilityHidden(true)
    }
}

struct StatusBadge: View {
    let status: CrewStatus
    var body: some View {
        HStack(spacing: 6) {
            StatusDot(color: status.color)
            Text(status.displayName)
                .font(.caption.weight(.medium))
                .foregroundStyle(status.color)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Status: \(status.displayName)")
    }
}

/// Must stay visible next to every simulated value. Do not hide it behind a tap or a scroll.
struct SimulatedBadge: View {
    var text: String = "Simulated"
    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, Theme.Spacing.s)
            .padding(.vertical, 2)
            .foregroundStyle(.secondary)
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.secondary.opacity(0.4), lineWidth: 0.5))
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
                .foregroundStyle(.secondary)
            Text(title).font(.headline)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.xl)
        .accessibilityElement(children: .combine)
    }
}
