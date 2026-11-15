import SwiftUI

/// Banner for the newest unacknowledged event. Sits above the tab view on every screen.
struct AlertBannerView: View {
    @Environment(EventStore.self) private var eventStore
    @Environment(CrewStore.self) private var crewStore

    var body: some View {
        let active = eventStore.activeAlerts
        Group {
            if let event = active.first {
                let bannerColor = event.severity == .critical ? Theme.critical : Theme.warning
                let bannerText = event.severity == .critical ? Theme.onCritical : Theme.onHighlight
                HStack(alignment: .center, spacing: Theme.Spacing.m) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.title3)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(event.type.displayName) · \(crewName(event.crewMemberID))")
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        (Text("\(event.source.displayName) · ")
                            + Text(event.timestamp, style: .relative)
                            + Text(active.count > 1 ? " ago · +\(active.count - 1) more" : " ago"))
                            .font(.caption)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 0)
                    Button("Acknowledge") {
                        withAnimation { eventStore.acknowledge(event.id) }
                    }
                    .font(.footnote.weight(.semibold))
                    .buttonStyle(.bordered)
                    .tint(bannerText)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.s)
                .foregroundStyle(bannerText)
                .background(bannerColor)
                .transition(.move(edge: .top).combined(with: .opacity))
                .accessibilityElement(children: .contain)
            }
        }
        .animation(.default, value: active.first?.id)
        .sensoryFeedback(trigger: active.first?.id) { _, new in
            new == nil ? nil : .warning
        }
    }

    private func crewName(_ id: UUID) -> String {
        crewStore.crew.first { $0.id == id }?.displayName ?? "Unknown crew member"
    }
}
