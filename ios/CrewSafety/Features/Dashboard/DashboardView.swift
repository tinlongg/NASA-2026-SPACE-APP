import SwiftUI

struct DashboardView: View {
    @Environment(EventStore.self) private var eventStore
    @Environment(CrewStore.self) private var crewStore
    @State private var model = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    alertSummary
                    crewSection
                    watchSection
                    telemetrySection
                    eventsSection
                    Text("Prototype for a simulated crew. Not a medical device.")
                        .font(.footnote)
                        .foregroundStyle(Theme.secondaryText)
                        .frame(maxWidth: .infinity)
                }
                .padding(Theme.Spacing.l)
            }
            .background(Theme.screenBackground)
            .navigationTitle("Crew status")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        model.isShowingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Settings")
                }
            }
            .sheet(isPresented: $model.isShowingSettings) {
                SettingsSheet()
            }
        }
    }

    // MARK: Sections

    private var alertSummary: some View {
        let severity = eventStore.highestActiveSeverity
        let color = severity?.color ?? Theme.accent
        return Card {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                Image(systemName: severity == nil ? "checkmark.shield" : "exclamationmark.triangle")
                    .font(.body.weight(.medium))
                    .foregroundStyle(color)
                    .frame(width: 20)
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(model.alertSummary(for: eventStore)).font(.headline)
                    Text(severity == nil ? "All recorded events are acknowledged."
                                         : "Open the Alerts tab to review and acknowledge.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.secondaryText)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var crewSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Crew", badge: "Simulated crew")
            if crewStore.crew.isEmpty {
                Card { EmptyStateView(title: "No crew members", systemImage: "person.slash") }
            } else {
                ForEach(crewStore.crew) { member in
                    CrewCard(member: member,
                             status: crewStore.status(for: member, events: eventStore),
                             isMonitored: member.id == crewStore.monitoredCrewMemberID,
                             activeAlertCount: eventStore.activeAlerts(for: member.id).count)
                }
            }
        }
    }

    private var watchSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Apple Watch", badge: nil)
            WatchCard()
            HealthComparisonCard()
        }
    }

    private var telemetrySection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Telemetry", badge: nil)
            TelemetryCardView(crewMemberID: crewStore.monitoredCrewMemberID)
        }
    }

    private var eventsSection: some View {
        let events = model.recentEvents(in: eventStore)
        return VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            sectionHeader("Recent events", badge: nil)
            Card {
                if events.isEmpty {
                    EmptyStateView(title: "No events yet", systemImage: "tray",
                                   message: "Events appear here when monitoring flags a crew member who stops moving.")
                } else {
                    VStack(spacing: 0) {
                        ForEach(events) { event in
                            EventRow(event: event, crewName: model.crewName(for: event.crewMemberID, in: crewStore))
                            if event.id != events.last?.id { Divider().padding(.vertical, Theme.Spacing.s) }
                        }
                    }
                }
            }
        }
    }

    private func sectionHeader(_ title: String, badge: String?) -> some View {
        HStack {
            Text(title).font(.headline)
            if let badge { SimulatedBadge(text: badge) }
            Spacer()
        }
        .accessibilityAddTraits(.isHeader)
    }
}

private struct CrewCard: View {
    let member: CrewMember
    let status: CrewStatus
    let isMonitored: Bool
    let activeAlertCount: Int

    /// "Crew Member A" becomes "A", "Ada Lovelace" becomes "AL".
    private var initials: String {
        let words = member.displayName.split(separator: " ")
        if words.count > 2, let last = words.last { return String(last.prefix(2)).uppercased() }
        return words.compactMap(\.first).map(String.init).joined().uppercased()
    }

    var body: some View {
        Card {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                Text(initials)
                    .font(.subheadline.weight(.medium).monospaced())
                    .foregroundStyle(Theme.secondaryText)
                    .frame(width: 36, height: 36)
                    .background(Color(.tertiarySystemFill), in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(member.displayName).font(.headline)
                        Spacer(minLength: Theme.Spacing.s)
                        StatusBadge(status: status)
                    }
                    Text(member.role).font(.subheadline).foregroundStyle(Theme.secondaryText)
                    if isMonitored || activeAlertCount > 0 {
                        HStack(spacing: Theme.Spacing.m) {
                            if isMonitored {
                                Label("Camera monitoring", systemImage: "video")
                                    .foregroundStyle(Theme.secondaryText)
                                    .accessibilityLabel("Camera monitoring is assigned to this crew member")
                            }
                            if activeAlertCount > 0 {
                                Text(activeAlertCount == 1 ? "1 unacknowledged alert"
                                                           : "\(activeAlertCount) unacknowledged alerts")
                                    .fontWeight(.medium)
                                    .foregroundStyle(status.color)
                            }
                        }
                        .font(.caption)
                        .padding(.top, Theme.Spacing.xs)
                    }
                }
            }
        }
    }
}

private struct EventRow: View {
    let event: SafetyEvent
    let crewName: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            StatusDot(color: event.acknowledged ? Color.secondary.opacity(0.4) : event.severity.color)
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                HStack(spacing: Theme.Spacing.s) {
                    Text(event.type.displayName).font(.subheadline.weight(.medium))
                    if event.source != .liveCamera { SimulatedBadge(text: event.source.displayName) }
                    Spacer(minLength: 0)
                    Text(event.timestamp.missionTimestamp)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(Theme.secondaryText)
                }
                Text(crewName)
                    .font(.caption)
                    .foregroundStyle(Theme.secondaryText)
                Text(event.acknowledged ? "Acknowledged" : "Not acknowledged")
                    .font(.caption)
                    .foregroundStyle(event.acknowledged ? Color.secondary : event.severity.color)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Apple Watch status and the one control people need before monitoring: start the Watch session.
/// Heart rate and wrist movement both depend on it; the website shows the same status before its camera starts.
private struct WatchCard: View {
    private let link = WatchLink.shared
    @State private var isStarting = false

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    HStack(alignment: .firstTextBaseline) {
                        Image(systemName: "applewatch")
                            .foregroundStyle(link.isStreaming ? Theme.accent : Theme.secondaryText)
                        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                            Text(link.isStreaming ? heartText : "Not monitoring").font(.headline)
                            Text(link.isStreaming ? wristText(now: context.date) : link.status)
                                .font(.subheadline)
                                .foregroundStyle(Theme.secondaryText)
                        }
                    }
                }
                if !link.isStreaming {
                    Button {
                        isStarting = true
                        Task { await link.startWatchMonitoring(); isStarting = false }
                    } label: {
                        Text(isStarting ? "Starting…" : "Start Watch monitoring").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isStarting || !link.isPaired)
                }
                Text("Wrist movement restarts the stillness timer and the Watch vibrates for \"Are you OK?\". Heart rate is context only and never decides an alert. Share with the website in Settings to use it there.")
                    .font(.footnote)
                    .foregroundStyle(Theme.secondaryText)
            }
        }
    }

    private var heartText: String { link.heartRate.map { "\(Int($0.rounded())) BPM" } ?? "Waiting for heart rate" }

    private func wristText(now: Date) -> String {
        guard let moved = link.movedAt else { return "Monitoring · no wrist movement yet" }
        return "Monitoring · wrist moved \(max(0, Int(now.timeIntervalSince(moved)))) s ago"
    }
}
