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
