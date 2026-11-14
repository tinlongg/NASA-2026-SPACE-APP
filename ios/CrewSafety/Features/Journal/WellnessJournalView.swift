import SwiftUI

struct WellnessJournalView: View {
    @Environment(AppServices.self) private var services
    @Environment(CrewStore.self) private var crewStore
    @State private var store = JournalStore()
    @State private var draft = ""
    @State private var isSaving = false
    @FocusState private var editorFocused: Bool

    private var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextEditor(text: $draft)
                        .frame(minHeight: 110)
                        .focused($editorFocused)
                        .accessibilityLabel("New journal entry")
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving { ProgressView() } else { Text("Save entry") }
                    }
                    .disabled(trimmedDraft.isEmpty || isSaving)
                } header: {
                    Text("New entry")
                } footer: {
                    Text("Entries stay on this device. They are never sent to MUSE or anywhere else.")
                }

                if store.lastSaveFailed {
                    Section {
                        Label("The journal could not be saved to disk. Entries will be lost when the app closes.",
                              systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(Theme.critical)
                    }
                }

                Section("History") {
                    if store.entries.isEmpty {
                        EmptyStateView(title: "No entries yet", systemImage: "book.closed",
                                       message: "Write a note above to start your journal.")
                    } else {
                        ForEach(store.entries) { entry in
                            NavigationLink(value: entry.id) { JournalRow(entry: entry) }
                        }
                        .onDelete { offsets in
                            offsets.map { store.entries[$0].id }.forEach(store.delete)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.screenBackground)
            .navigationTitle("Journal")
            .navigationDestination(for: UUID.self) { id in
                JournalDetailView(entry: store.entries.first { $0.id == id })
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private func save() async {
        let body = trimmedDraft
        guard !body.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        editorFocused = false
        let entry = JournalEntry(id: UUID(), crewMemberID: crewStore.monitoredCrewMemberID,
                                 timestamp: .now, body: body, summary: nil)
        store.add(entry)
        draft = ""
        let summary = await services.journalAnalyzer.summarize(body)
        store.setSummary(summary, for: entry.id)
    }
}

private struct JournalRow: View {
    let entry: JournalEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.timestamp.formatted(date: .abbreviated, time: .shortened))
                .font(.caption)
                .foregroundStyle(Theme.secondaryText)
            Text(entry.body).lineLimit(2)
            if let summary = entry.summary {
                Text(summary.text).font(.caption).foregroundStyle(Theme.secondaryText)
            }
        }
    }
}

private struct JournalDetailView: View {
    let entry: JournalEntry?
    var body: some View {
        if let entry {
            List {
                Section(entry.timestamp.formatted(date: .complete, time: .shortened)) {
                    Text(entry.body)
                }
                if let summary = entry.summary {
                    Section {
                        Text(summary.text)
                        if summary.generatedBy == .demo { SimulatedBadge(text: "Placeholder") }
                    } header: {
                        Text("Summary")
                    } footer: {
                        Text(summary.disclaimer + (summary.generatedBy == .onDevice ? " Produced on this device." : ""))
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.screenBackground)
            .navigationTitle("Entry")
            .navigationBarTitleDisplayMode(.inline)
        } else {
            EmptyStateView(title: "Entry not found", systemImage: "questionmark.circle")
        }
    }
}
