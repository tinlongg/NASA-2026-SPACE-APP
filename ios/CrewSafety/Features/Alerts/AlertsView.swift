import SwiftUI

struct AlertsView: View {
    @Environment(EventStore.self) private var eventStore
    @Environment(CrewStore.self) private var crewStore

    var body: some View {
        NavigationStack {
            Group {
                if eventStore.events.isEmpty {
                    EmptyStateView(title: "No events", systemImage: "bell.slash",
                                   message: "Possible-fall alerts appear here with their time and the reason they were raised.")
                } else {
                    List {
                        let active = eventStore.activeAlerts
                        let acknowledged = eventStore.events.filter(\.acknowledged)
                        if !active.isEmpty {
                            Section("Needs acknowledgement") {
                                ForEach(active) { row($0) }
                            }
                        }
                        if !acknowledged.isEmpty {
                            Section("Acknowledged") {
                                ForEach(acknowledged) { row($0) }
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                    .background(Theme.screenBackground)
                }
            }
            .navigationTitle("Alerts")
            .navigationDestination(for: UUID.self) { id in
                AlertDetailView(eventID: id)
            }
            #if DEBUG
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Record test event") {
                        eventStore.record(SafetyEvent(crewMemberID: crewStore.monitoredCrewMemberID,
                                                      type: .manualTest, severity: .warning, source: .simulated,
                                                      details: "Test event recorded by hand from the Alerts screen."))
                    }
                    .font(.footnote)
                }
            }
            #endif
        }
    }

    private func row(_ event: SafetyEvent) -> some View {
        NavigationLink(value: event.id) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(event.type.displayName).font(.headline)
                    if event.source != .liveCamera { SimulatedBadge(text: event.source.displayName) }
                }
                Text("\(crewName(event.crewMemberID)) · \(event.timestamp.formatted(date: .abbreviated, time: .standard))")
                    .font(.caption)
                    .foregroundStyle(Theme.secondaryText)
                if let checkIn = event.checkIn {
                    Text(checkIn.summary)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(event.severity.color)
                }
                if let score = event.heuristicScore {
                    Text("Heuristic score \(Int((score * 100).rounded()))%")
                        .font(.caption)
                        .foregroundStyle(Theme.secondaryText)
                }
            }
        }
        .swipeActions(edge: .trailing) {
            if !event.acknowledged {
                Button("Acknowledge") { eventStore.acknowledge(event.id) }.tint(Theme.accent)
            }
        }
    }

    private func crewName(_ id: UUID) -> String {
        crewStore.crew.first { $0.id == id }?.displayName ?? "Unknown crew member"
    }
}

struct AlertDetailView: View {
    let eventID: UUID
    @Environment(EventStore.self) private var eventStore
    @Environment(CrewStore.self) private var crewStore

    var body: some View {
        if let event = eventStore.events.first(where: { $0.id == eventID }) {
            List {
                Section {
                    LabeledContent("Type", value: event.type.displayName)
                    LabeledContent("Crew member",
                                   value: crewStore.crew.first { $0.id == event.crewMemberID }?.displayName ?? "Unknown")
                    LabeledContent("Time", value: event.timestamp.formatted(date: .abbreviated, time: .standard))
                    LabeledContent("Source", value: event.source.displayName)
                    LabeledContent("Severity", value: event.severity.displayName)
                    if let checkIn = event.checkIn {
                        LabeledContent("Check-in", value: checkIn.summary)
                    }
                    if let score = event.heuristicScore {
                        LabeledContent("Heuristic score", value: "\(Int((score * 100).rounded()))%")
                    }
                } footer: {
                    if event.heuristicScore != nil {
                        Text("The heuristic score is not a probability.")
                    }
                }
                Section("Why this was raised") {
                    Text(event.details)
                }
                Section {
                    if event.acknowledged {
                        LabeledContent("Acknowledged",
                                       value: event.acknowledgedAt?.formatted(date: .abbreviated, time: .standard) ?? "Yes")
                    } else {
                        Button("Acknowledge") { eventStore.acknowledge(event.id) }
                    }
                } footer: {
                    Text("This is an alert, not a diagnosis. It cannot tell whether anyone is hurt.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.screenBackground)
            .navigationTitle(event.type.displayName)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            EmptyStateView(title: "Event not found", systemImage: "questionmark.circle")
        }
    }
}
