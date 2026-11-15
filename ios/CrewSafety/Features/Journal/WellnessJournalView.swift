import SwiftUI

struct WellnessJournalView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(CrewStore.self) private var crewStore
    @State private var store = JournalStore()
    @State private var draft = ""
    @State private var showingDemo = false
    @State private var isSaving = false
    @State private var reflecting: Set<UUID> = []
    @State private var reflectionErrors: [UUID: String] = [:]
    @State private var path: [UUID] = []
    @State private var selectedDay: Date?
    @FocusState private var editorFocused: Bool

    private var ownEntries: [JournalEntry] {
        store.entries.filter { $0.crewMemberID == crewStore.monitoredCrewMemberID }
    }

    private var visibleEntries: [JournalEntry] {
        guard let selectedDay else { return ownEntries }
        return JournalCalendar.entries(on: selectedDay, in: ownEntries)
    }

    private var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    TextEditor(text: $draft)
                        .frame(minHeight: 110)
                        .focused($editorFocused)
                        .accessibilityLabel("New journal entry")
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving { ProgressView() } else { Text("Save & get MUSE reflection") }
                    }
                    .disabled(trimmedDraft.isEmpty || trimmedDraft.count > 10000 || isSaving)
                } header: {
                    Text("New entry")
                } footer: {
                    Text("Entries and reflections are saved on this iPhone. Saving or retrying sends this entry and up to 11 earlier entries from the preceding 14 days through your configured website to Meta MUSE. Earlier entries may be excerpted. MUSE reviews every save; collective suggestions start after 3 entries within 14 days. AI reflections can be mistaken and are not a diagnosis.")
                }

                Section {
                    Button("Run astronaut demo", systemImage: "sparkles") { showingDemo = true }
                } footer: {
                    Text("Watch a fictional astronaut’s 3-entry story, then see real MUSE feedback. Only preset text goes to Meta; nothing is saved to your journal or Mission progress.")
                }

                if store.lastSaveFailed {
                    Section {
                        Label("The journal could not be saved to disk. Entries will be lost when the app closes.",
                              systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(Theme.critical)
                    }
                }

                if !ownEntries.isEmpty {
                    Section {
                        JournalCalendarView(entries: ownEntries, selectedDay: $selectedDay)
                    } header: {
                        Text("Calendar")
                    }
                }

                Section {
                    if ownEntries.isEmpty {
                        EmptyStateView(title: "No entries yet", systemImage: "book.closed",
                                       message: "Write a note above to start your journal.")
                    } else {
                        ForEach(visibleEntries) { entry in
                            NavigationLink(value: entry.id) { JournalRow(entry: entry) }
                        }
                        .onDelete { offsets in
                            offsets.map { visibleEntries[$0].id }.forEach(store.delete)
                        }
                    }
                } header: {
                    HStack {
                        Text(selectedDay.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? "History")
                        Spacer()
                        if selectedDay != nil { Button("Show all") { selectedDay = nil }.textCase(nil) }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.screenBackground)
            .navigationTitle("Journal")
            .navigationDestination(for: UUID.self) { id in
                JournalDetailView(entry: ownEntries.first { $0.id == id },
                                  reflecting: reflecting.contains(id), error: reflectionErrors[id]) {
                    if let entry = ownEntries.first(where: { $0.id == id }) {
                        Task { await reflect(entry) }
                    }
                }
            }
            .sheet(isPresented: $showingDemo) {
                JournalAstronautDemoView(baseURL: settings.dashboardBaseURL)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private func save() async {
        let body = trimmedDraft
        guard !body.isEmpty, body.count <= 10000, !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        editorFocused = false
        let entry = JournalEntry(id: UUID(), crewMemberID: crewStore.monitoredCrewMemberID,
                                 timestamp: .now, body: body, summary: nil)
        guard store.add(entry) else { return }
        if trimmedDraft == body { draft = "" }
        path = [entry.id]
        await reflect(entry)
    }

    private func reflect(_ entry: JournalEntry) async {
        guard !reflecting.contains(entry.id) else { return }
        reflecting.insert(entry.id); reflectionErrors[entry.id] = nil
        defer { reflecting.remove(entry.id) }
        let context = JournalReflectionService.context(for: entry, in: store.entries)
        do {
            let reflection = try await JournalReflectionService().reflect(on: entry, context: context, baseURL: settings.dashboardBaseURL)
            store.setReflection(reflection, for: entry.id, contextIDs: Set(context.map(\.id)))
        } catch {
            reflectionErrors[entry.id] = error.localizedDescription
        }
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
            Text(entry.reflection?.message ?? "MUSE reflection pending")
                .font(.caption).foregroundStyle(Theme.secondaryText).lineLimit(2)
        }
    }
}

private struct JournalDetailView: View {
    let entry: JournalEntry?
    let reflecting: Bool
    let error: String?
    let retry: () -> Void
    var body: some View {
        if let entry {
            List {
                Section(entry.timestamp.formatted(date: .complete, time: .shortened)) {
                    Text(entry.body)
                }
                Section("MUSE reflection") {
                    if let reflection = entry.reflection {
                        JournalFeedbackView(reflection: reflection)
                    } else if reflecting {
                        ProgressView("Entry saved. MUSE is reflecting…")
                    } else {
                        Text(error ?? "Entry saved. MUSE reflection pending.")
                        Button("Retry MUSE reflection", action: retry)
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

private struct JournalFeedbackView: View {
    let reflection: JournalReflection
    var body: some View {
        Text(reflection.message)
        if reflection.collectiveSuggestionsReady {
            Text("Things you could try").font(.headline)
            ForEach(Array(reflection.suggestions.enumerated()), id: \.offset) { _, suggestion in
                Label(suggestion, systemImage: "leaf")
            }
        } else {
            Text("\(reflection.context.entryCount) of 3 recent entries. Collective suggestions start after 3 entries within 14 days.")
                .font(.callout).foregroundStyle(Theme.secondaryText)
        }
        Text(reflection.question)
        Text("Based on \(reflection.context.entryCount) recent entries. A reflection on your words, not a diagnosis.")
            .font(.footnote).foregroundStyle(Theme.secondaryText)
        if reflection.collectiveSuggestionsReady { JournalCatBreakView() }
    }
}

private struct JournalCatBreakView: View {
    private let videos = [
        (title: "Meet Marmalade — kitten cuteness", url: "https://www.youtube.com/watch?v=UnJCiJD1mig"),
        (title: "Cole meets kitten Marmalade", url: "https://www.youtube.com/watch?v=XswFdWL7HM0")
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("A little cat break", systemImage: "pawprint.fill").font(.headline)
            Text("If you feel like a light distraction, pick a cute cat video. Optional, just for fun.")
                .font(.callout)
            ForEach(videos, id: \.url) { video in
                if let url = URL(string: video.url) {
                    Link(destination: url) { Label(video.title, systemImage: "play.rectangle") }
                        .accessibilityHint("Opens YouTube")
                }
            }
            Text("Cole & Marmalade · Opens YouTube.")
                .font(.footnote).foregroundStyle(Theme.secondaryText)
        }
        .padding(.vertical, 8)
    }
}

#Preview("Journal cat break") {
    List { JournalCatBreakView() }
}

private struct JournalAstronautDemoView: View {
    let baseURL: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stage = 0
    @State private var reflection: JournalReflection?
    @State private var error: String?
    @State private var running = false
    @State private var generation = 0
    private let labels = ["Missing home", "Feeling lonely", "Feeling very low"]
    private let entries = [
        "After my shift aboard the station I felt homesick and tired. I missed dinner conversations with my family, though a short chat with a crewmate helped.",
        "I felt sad and lonely again after work. I stayed in my cabin instead of joining the crew for a meal, and I missed hearing a familiar voice from home.",
        "I feel really down and worn out tonight. Being far from home has been hard across these days. I would welcome some company and a calm conversation with someone I trust."
    ]
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Fictional demo · Live MUSE").font(.headline)
                    Text("Three preset entries go to Meta for a real reflection. This demo never saves to your journal or changes Mission progress.").font(.footnote)
                    JournalDemoAstronaut(stage: stage)
                        .frame(height: 190).frame(maxWidth: .infinity)
                    if stage > 0 { Text("Day \(stage) of 3 · \(labels[stage - 1])").font(.headline) }
                    Text("An illustrated story, not camera analysis.").font(.caption)
                }
                ForEach(0..<stage, id: \.self) { index in
                    Section("Day \(index + 1) · \(labels[index])") { Text(entries[index]) }
                }
                Section("MUSE reflection") {
                    if let reflection {
                        JournalFeedbackView(reflection: reflection)
                    } else if let error {
                        Text(error)
                        Button("Retry demo reflection") { generation += 1 }
                    } else if running && stage == 3 {
                        ProgressView("MUSE is reading the three fictional entries…")
                    } else {
                        Text("\(stage) of 3 entries. Building context before collective suggestions…")
                    }
                }
            }
            .navigationTitle("Astronaut demo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task(id: generation) { await run() }
        }
    }
    private func run() async {
        running = true; error = nil
        defer { running = false }
        do {
            if stage < 3 {
                for next in 1...3 {
                    try Task.checkCancellation()
                    stage = next
                    if next < 3 && !reduceMotion { try await Task.sleep(for: .seconds(2.3)) }
                }
            }
            let result = try await JournalReflectionService().runDemo(baseURL: baseURL)
            try Task.checkCancellation()
            reflection = result
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }
}

private struct JournalDemoAstronaut: View {
    let stage: Int
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width / 220, size.height / 220)
            context.translateBy(x: (size.width - 220 * scale) / 2, y: 0)
            context.scaleBy(x: scale, y: scale)
            context.fill(Path(roundedRect: CGRect(x: 47, y: 150, width: 126, height: 70), cornerRadius: 30), with: .color(.mint.opacity(0.6)))
            context.fill(Path(ellipseIn: CGRect(x: 35, y: 20, width: 150, height: 150)), with: .color(.mint.opacity(0.8)))
            context.fill(Path(ellipseIn: CGRect(x: 49, y: 34, width: 122, height: 122)), with: .color(Color(red: 0.12, green: 0.22, blue: 0.18)))
            for x in [85.0, 130.0] {
                context.fill(Path(ellipseIn: CGRect(x: x, y: 88, width: 6, height: 9)), with: .color(.white))
            }
            var mouth = Path(); mouth.move(to: CGPoint(x: 91, y: 123))
            mouth.addQuadCurve(to: CGPoint(x: 133, y: 123), control: CGPoint(x: 112, y: stage >= 3 ? 96 : stage == 2 ? 108 : 123))
            context.stroke(mouth, with: .color(.white), style: StrokeStyle(lineWidth: 4, lineCap: .round))
            if stage == 3 { context.fill(Path(ellipseIn: CGRect(x: 141, y: 104, width: 7, height: 13)), with: .color(.cyan)) }
            context.fill(Path(roundedRect: CGRect(x: 86, y: 180, width: 48, height: 25), cornerRadius: 6), with: .color(.black.opacity(0.6)))
        }
        .accessibilityLabel("Illustrated fictional astronaut, \(stage >= 3 ? "feeling very low" : stage == 2 ? "feeling lonely" : "missing home")")
    }
}
