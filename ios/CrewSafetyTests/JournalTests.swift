import XCTest
@testable import CrewSafety

@MainActor
final class JournalTests: XCTestCase {
    private var fileURL: URL!

    override func setUp() {
        fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("journal-test-\(UUID().uuidString)")
            .appendingPathComponent("journal.json")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent())
    }

    private func entry(_ body: String, at offset: TimeInterval = 0) -> JournalEntry {
        JournalEntry(id: UUID(), crewMemberID: UUID(), timestamp: Date(timeIntervalSince1970: 1_000 + offset),
                     body: body, summary: nil)
    }

    func testEntriesPersistAndReloadNewestFirst() {
        let store = JournalStore(fileURL: fileURL)
        XCTAssertTrue(store.entries.isEmpty)
        let old = entry("old", at: 0), new = entry("new", at: 100)
        store.add(old)
        store.add(new)
        store.setSummary(JournalSummary(themes: ["sleep"], text: "t", generatedBy: .onDevice, disclaimer: "d"), for: old.id)
        XCTAssertFalse(store.lastSaveFailed)

        let reloaded = JournalStore(fileURL: fileURL)
        XCTAssertEqual(reloaded.entries.map(\.body), ["new", "old"])
        XCTAssertEqual(reloaded.entries.last?.summary?.themes, ["sleep"])

        reloaded.delete(new.id)
        XCTAssertEqual(JournalStore(fileURL: fileURL).entries.map(\.body), ["old"])
    }

    func testCorruptFileGivesEmptyJournal() throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{ not json".utf8).write(to: fileURL)
        XCTAssertTrue(JournalStore(fileURL: fileURL).entries.isEmpty)
    }

    func testAnalyzerFindsSelfReportedThemes() async {
        let summary = await OnDeviceJournalAnalyzer().summarize(
            "Slept badly again and the treadmill session felt long. I miss my family.")
        XCTAssertTrue(summary.themes.contains("sleep"), "\(summary.themes)")
        XCTAssertTrue(summary.themes.contains("exercise"), "\(summary.themes)")
        XCTAssertTrue(summary.themes.contains("family and home"), "\(summary.themes)")
        XCTAssertEqual(summary.generatedBy, .onDevice)
        XCTAssertTrue(summary.text.hasPrefix("You wrote about:"))
    }

    func testAnalyzerSaysSoWhenNothingMatches() async {
        let summary = await OnDeviceJournalAnalyzer().summarize("Xyzzy plugh.")
        XCTAssertTrue(summary.themes.isEmpty)
        XCTAssertEqual(summary.text, "No common themes were picked out of this entry.")
    }

    func testSummaryWordingIsNeverDiagnostic() async {
        let banned = ["depress", "anxiety disorder", "at risk", "diagnos", "mental illness", "symptom", "you are", "you seem"]
        let inputs = ["I feel hopeless and so stressed and alone, I can't sleep.",
                      "Great day, workout was fun and dinner with the crew was good.", ""]
        for input in inputs {
            let summary = await OnDeviceJournalAnalyzer().summarize(input)
            let produced = (summary.text + " " + summary.themes.joined(separator: " ")).lowercased()
            for word in banned { XCTAssertFalse(produced.contains(word), "'\(word)' in: \(produced)") }
            XCTAssertTrue(summary.disclaimer.lowercased().contains("not an assessment or diagnosis"))
        }
    }
}

private final class JournalURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data) = try Self.handler!(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@MainActor
final class JournalReflectionTests: XCTestCase {
    private func note(_ body: String, owner: UUID, days: Int = 0) -> JournalEntry {
        JournalEntry(id: UUID(), crewMemberID: owner, timestamp: Date(timeIntervalSince1970: 1_790_000_000 - Double(days) * 86400), body: body, summary: nil)
    }
    private var feedback: JournalReflection {
        JournalReflection(message: "You have described a difficult stretch.", suggestions: ["Talk with someone you trust."], question: "What would help today?", context: .init(entryCount: 1, from: "2026-09-22T14:13:20Z", to: "2026-09-22T14:13:20Z"), model: "test", generatedAt: "2026-09-22T14:13:20Z")
    }
    func testContextIncludesDifferentTonesAndRepeatedTextButNotOtherCrewOrFuture() {
        let owner = UUID(), current = note("sad", owner: owner)
        let past = (1...20).map { note($0 % 2 == 0 ? "happy" : "sad", owner: owner, days: $0) }
        let selected = JournalReflectionService.context(for: current, in: past + [current, note("private", owner: UUID()), note("future", owner: owner, days: -1)])
        XCTAssertEqual(selected.count, 12)
        XCTAssertEqual(selected.last?.id, current.id)
        XCTAssertEqual(selected.first?.timestamp, past[10].timestamp)
        XCTAssertTrue(selected.contains { $0.body == "happy" })
        XCTAssertGreaterThan(selected.filter { $0.body == "sad" }.count, 1)
        XCTAssertFalse(selected.contains { ["private", "future"].contains($0.body) })
    }
    func testNetworkSendsOnlyOwnDatedTextAndDecodesOnlyPublicFeedback() async throws {
        let owner = UUID(), current = note("sad", owner: owner)
        let responseData = try JSONEncoder().encode(feedback)
        JournalURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://journal.example/api/journal/analyze")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://journal.example")
            XCTAssertFalse(request.httpShouldHandleCookies)
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count))
                }
            }
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            XCTAssertEqual(body["consent"] as? Bool, true)
            XCTAssertEqual((body["history"] as? [[String:String]])?.count, 0)
            XCTAssertEqual((body["entry"] as? [String:String])?["body"], "sad")
            XCTAssertFalse(String(decoding: data, as: UTF8.self).contains("private"))
            var value = try XCTUnwrap(JSONSerialization.jsonObject(with: responseData) as? [String: Any])
            value["sentiment"] = -1; value["summary"] = "private internal analysis"
            return (200, try JSONSerialization.data(withJSONObject: value))
        }
        defer { JournalURLProtocol.handler = nil }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [JournalURLProtocol.self]
        let session = URLSession(configuration: config); defer { session.invalidateAndCancel() }
        let result = try await JournalReflectionService(session: session).reflect(on: current, context: [current, note("private", owner: UUID())], baseURL: "https://journal.example/journal")
        XCTAssertEqual(result, feedback)
        XCTAssertFalse(String(decoding: try JSONEncoder().encode(result), as: UTF8.self).contains("sentiment"))
    }
    func testFailureKeepsSavedEntryAndNeverPersistsFakeReflection() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("journal.json")
        defer { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        let store = JournalStore(fileURL: file), current = note("saved note", owner: UUID())
        XCTAssertTrue(store.add(current))
        JournalURLProtocol.handler = { _ in (503, Data("private upstream error".utf8)) }
        defer { JournalURLProtocol.handler = nil }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [JournalURLProtocol.self]
        let session = URLSession(configuration: config); defer { session.invalidateAndCancel() }
        do { _ = try await JournalReflectionService(session: session).reflect(on: current, context: [current], baseURL: "https://journal.example"); XCTFail("Expected failure") }
        catch { XCTAssertFalse(error.localizedDescription.contains("private")) }
        let reloaded = JournalStore(fileURL: file)
        XCTAssertEqual(reloaded.entries.first?.body, current.body)
        XCTAssertNil(reloaded.entries.first?.reflection)
    }
    func testReflectionPersistsAndDeletionInvalidatesRelatedFeedback() {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("journal.json")
        defer { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        let store = JournalStore(fileURL: file), owner = UUID()
        let current = note("today", owner: owner), past = note("yesterday", owner: owner, days: 1)
        store.add(past); store.add(current)
        store.setReflection(feedback, for: current.id, contextIDs: [current.id, past.id])
        XCTAssertEqual(JournalStore(fileURL: file).entries.first?.reflection, feedback)
        store.delete(past.id)
        XCTAssertNil(store.entries.first?.reflection)
        store.setReflection(feedback, for: current.id, contextIDs: [current.id, past.id])
        XCTAssertNil(store.entries.first?.reflection, "Deleted context cannot reappear from an in-flight response")
        store.delete(current.id)
        store.setReflection(feedback, for: current.id, contextIDs: [current.id])
        XCTAssertTrue(store.entries.isEmpty)
    }
    func testSuggestionsStayHiddenForLegacyReflectionsUntilThreeEntries() {
        XCTAssertFalse(feedback.collectiveSuggestionsReady)
        let collective = JournalReflection(message: feedback.message, suggestions: feedback.suggestions, question: feedback.question, context: .init(entryCount: 3, from: feedback.context.from, to: feedback.context.to), model: "test", generatedAt: feedback.generatedAt)
        XCTAssertTrue(collective.collectiveSuggestionsReady)
    }
    func testEarlyReflectionAcceptsEmptySuggestionsButCollectiveNeedsSuggestions() async throws {
        let owner = UUID(), current = note("today", owner: owner)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [JournalURLProtocol.self]
        let session = URLSession(configuration: config); defer { session.invalidateAndCancel(); JournalURLProtocol.handler = nil }
        for count in 1...3 {
            let value = JournalReflection(message: "Thank you for sharing.", suggestions: [], question: "How was today?", context: .init(entryCount: count, from: feedback.context.from, to: feedback.context.to), model: "test", generatedAt: feedback.generatedAt)
            let data = try JSONEncoder().encode(value)
            JournalURLProtocol.handler = { _ in (200, data) }
            let context = [current] + (1..<count).map { note("earlier", owner: owner, days: $0) }
            do {
                let result = try await JournalReflectionService(session: session).reflect(on: current, context: context, baseURL: "https://journal.example")
                XCTAssertLessThan(count, 3); XCTAssertTrue(result.suggestions.isEmpty)
            } catch { XCTAssertEqual(count, 3) }
        }
    }
    func testDemoSendsOnlyConsentAndRequiresFictionalResponseMarker() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [JournalURLProtocol.self]
        let session = URLSession(configuration: config); defer { session.invalidateAndCancel(); JournalURLProtocol.handler = nil }
        for marked in [true, false] {
            let value = JournalReflection(message: feedback.message, suggestions: feedback.suggestions, question: feedback.question, context: .init(entryCount: 3, from: feedback.context.from, to: feedback.context.to), model: "test", generatedAt: feedback.generatedAt, demo: marked)
            let encoded = try JSONEncoder().encode(value)
            JournalURLProtocol.handler = { request in
                XCTAssertEqual(request.url?.path, "/api/journal/demo"); XCTAssertFalse(request.httpShouldHandleCookies)
                var data = request.httpBody ?? Data()
                if let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var buffer = [UInt8](repeating: 0, count: 4096)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&buffer, maxLength: buffer.count)
                        if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count))
                    }
                }
                let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
                XCTAssertEqual(Set(body.keys), ["consent"]); XCTAssertEqual(body["consent"] as? Bool, true)
                return (200, encoded)
            }
            do { let result = try await JournalReflectionService(session: session).runDemo(baseURL: "https://journal.example"); XCTAssertTrue(marked); XCTAssertEqual(result, value) }
            catch { XCTAssertFalse(marked) }
        }
    }
    func testDiskFailureRetainsNoPhantomSavedEntry() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data("not a directory".utf8).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let store = JournalStore(fileURL: file.appendingPathComponent("journal.json"))
        XCTAssertFalse(store.add(note("unsaved", owner: UUID())))
        XCTAssertTrue(store.lastSaveFailed)
        XCTAssertTrue(store.entries.isEmpty)
    }
}
