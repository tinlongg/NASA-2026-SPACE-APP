import Foundation

// Placeholder implementations used until each owner's real type is merged.
// They are swapped out in App/ServiceFactory.swift and nowhere else.

/// Always fails. The chat UI must show its "service unavailable" state, never invented text.
struct PlaceholderMuseService: MuseService {
    func ask(_ question: String, context: MuseContext) async throws -> MuseAnswer {
        throw MuseError.serviceUnavailable
    }
}

struct PlaceholderJournalAnalyzer: JournalAnalyzing {
    func summarize(_ body: String) async -> JournalSummary {
        JournalSummary(themes: [],
                       text: "Summary is not available in this build.",
                       generatedBy: .demo,
                       disclaimer: "Placeholder text. Not an assessment or diagnosis.")
    }
}

/// Returns no samples, so nothing that looks like a reading is shown before the simulated provider exists.
struct PlaceholderTelemetryProvider: TelemetryProviding {
    func samples(for crewMemberID: UUID, last interval: TimeInterval, now: Date) -> [TelemetrySample] { [] }
}
