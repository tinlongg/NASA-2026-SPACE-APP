import Foundation
import Observation

/// Journal entries, newest first, saved to a protected JSON file on this device only.
@MainActor @Observable
final class JournalStore {
    private(set) var entries: [JournalEntry] = []
    private(set) var lastSaveFailed = false
    @ObservationIgnored private let fileURL: URL

    nonisolated static var defaultFileURL: URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return directory.appendingPathComponent("journal.json")
    }

    init(fileURL: URL = JournalStore.defaultFileURL) {
        self.fileURL = fileURL
        load()
    }

    func add(_ entry: JournalEntry) {
        entries.insert(entry, at: 0)
        save()
    }

    func setSummary(_ summary: JournalSummary, for id: JournalEntry.ID) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[index].summary = summary
        save()
    }

    func delete(_ id: JournalEntry.ID) {
        entries.removeAll { $0.id == id }
        save()
    }

    private func load() {
        // A missing or unreadable file simply means an empty journal.
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([JournalEntry].self, from: data) else { return }
        entries = decoded.sorted { $0.timestamp > $1.timestamp }
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(),
                                                    withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(entries)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            lastSaveFailed = false
        } catch {
            lastSaveFailed = true
        }
    }
}
