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

    @discardableResult func add(_ entry: JournalEntry) -> Bool {
        entries.insert(entry, at: 0)
        save()
        if lastSaveFailed { entries.removeAll { $0.id == entry.id } }
        return !lastSaveFailed
    }

    func setReflection(_ reflection: JournalReflection, for id: JournalEntry.ID, contextIDs: Set<UUID>) {
        guard let index = entries.firstIndex(where: { $0.id == id }),
              contextIDs.isSubset(of: Set(entries.map(\.id))) else { return }
        entries[index].reflection = reflection
        entries[index].summary = nil
        save()
    }

    func setSummary(_ summary: JournalSummary, for id: JournalEntry.ID) {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[index].summary = summary
        save()
    }

    func delete(_ id: JournalEntry.ID) {
        let owner = entries.first { $0.id == id }?.crewMemberID
        entries.removeAll { $0.id == id }
        for index in entries.indices where entries[index].crewMemberID == owner {
            entries[index].reflection = nil
        }
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

/// Uses the same MUSE endpoint as the website, without sending web-account cookies.
struct JournalReflectionService {
    let session: URLSession
    init(session: URLSession = URLSession(configuration: .ephemeral)) { self.session = session }

    static func context(for entry: JournalEntry, in entries: [JournalEntry]) -> [JournalEntry] {
        let start = entry.timestamp.addingTimeInterval(-14 * 86400)
        let history = entries.filter {
            $0.id != entry.id && $0.crewMemberID == entry.crewMemberID &&
            $0.timestamp >= start && $0.timestamp <= entry.timestamp
        }.sorted {
            $0.timestamp == $1.timestamp ? $0.id.uuidString > $1.id.uuidString : $0.timestamp > $1.timestamp
        }.prefix(11)
        return Array(history.reversed()) + [entry]
    }

    func reflect(on entry: JournalEntry, context: [JournalEntry], baseURL: String) async throws -> JournalReflection {
        let formatter = ISO8601DateFormatter()
        let text: (JournalEntry) -> [String: String] = { ["body": $0.body, "date": formatter.string(from: $0.timestamp)] }
        let selected = Self.context(for: entry, in: context)
        let payload: [String: Any] = ["entry": text(entry), "history": selected.dropLast().map(text), "consent": true]
        return try await request(payload: payload, path: "/api/journal/analyze", count: selected.count, demo: false, baseURL: baseURL)
    }

    /// Uses server-owned fictional entries; no JournalStore, crew ID or account cookie is involved.
    func runDemo(baseURL: String) async throws -> JournalReflection {
        try await request(payload: ["consent": true], path: "/api/journal/demo", count: 3, demo: true, baseURL: baseURL)
    }

    private func request(payload: [String: Any], path: String, count: Int, demo: Bool, baseURL: String) async throws -> JournalReflection {
        guard var parts = URLComponents(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parts.host, parts.user == nil, parts.password == nil,
              parts.scheme == "https" || (parts.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host)) else {
            throw JournalReflectionError("Set a valid HTTPS website address in Settings, then retry.")
        }
        parts.path = ""; parts.query = nil; parts.fragment = nil
        guard let origin = parts.url?.absoluteString else { throw JournalReflectionError("Check the website address in Settings.") }
        parts.path = path
        guard let url = parts.url else { throw JournalReflectionError("Check the website address in Settings.") }
        var request = URLRequest(url: url, timeoutInterval: 35)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue(origin, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let data: Data, response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw JournalReflectionError("MUSE could not be reached. Please retry the reflection.") }
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw JournalReflectionError("MUSE is unavailable on this server. Please retry later.")
        }
        guard let reflection = try? JSONDecoder().decode(JournalReflection.self, from: data),
              !reflection.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              reflection.message.count <= 1600, reflection.suggestions.count <= 3,
              count < JournalReflection.minimumEntries || !reflection.suggestions.isEmpty,
              reflection.suggestions.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 600 }),
              !reflection.question.isEmpty, reflection.question.count <= 400,
              reflection.context.entryCount == count, (!demo || reflection.demo == true) else {
            throw JournalReflectionError("MUSE did not return a complete reflection. Please retry later.")
        }
        return reflection
    }
}

struct JournalReflectionError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
