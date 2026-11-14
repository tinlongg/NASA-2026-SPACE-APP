import SwiftUI

struct DashboardView: View {
    @Environment(EventStore.self) private var eventStore
    @Environment(CrewStore.self) private var crewStore
    @State private var model = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    alertSummary
                    crewSection
                    telemetrySection
                    eventsSection
                    Text("Prototype for a simulated crew. Not a medical device.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
                .padding(Theme.Spacing.l)
            }
            .background(Theme.screenBackground)
            .navigationTitle("Crew Dashboard")
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
        let color = severity?.color ?? .green
        return Card {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: severity == nil ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                    .font(.title2)
                    .foregroundStyle(color)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.alertSummary(for: eventStore)).font(.headline)
                    Text(severity == nil ? "All recorded events are acknowledged."
                                         : "Open the Alerts tab to review and acknowledge.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
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
                                   message: "Events appear here when monitoring flags a possible fall.")
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
            Text(title).font(.title3.weight(.semibold))
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

    var body: some View {
        Card {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(member.displayName).font(.headline)
                    Text(member.role).font(.subheadline).foregroundStyle(.secondary)
                    if isMonitored {
                        Label("Camera monitoring is assigned to this crew member", systemImage: "video")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if activeAlertCount > 0 {
                        Text(activeAlertCount == 1 ? "1 unacknowledged alert"
                                                   : "\(activeAlertCount) unacknowledged alerts")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(status.color)
                    }
                }
                Spacer(minLength: 0)
                StatusBadge(status: status)
            }
        }
    }
}

private struct EventRow: View {
    let event: SafetyEvent
    let crewName: String

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Circle()
                .fill(event.acknowledged ? Color.secondary.opacity(0.4) : event.severity.color)
                .frame(width: 10, height: 10)
                .padding(.top, 5)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(event.type.displayName).font(.subheadline.weight(.semibold))
                    if event.source != .liveCamera { SimulatedBadge(text: event.source.displayName) }
                }
                Text("\(crewName) · \(event.timestamp.formatted(date: .omitted, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(event.acknowledged ? "Acknowledged" : "Not acknowledged")
                    .font(.caption)
                    .foregroundStyle(event.acknowledged ? Color.secondary : event.severity.color)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}
