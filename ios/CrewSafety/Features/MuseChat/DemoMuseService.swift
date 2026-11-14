import Foundation

/// Serves precomputed answers bundled in MuseFallbackAnswers.json.
/// It never writes an answer of its own: no match means `.noOfflineAnswer`.
struct DemoMuseService: MuseService {
    struct Entry: Codable, Sendable {
        let id: String
        let question: String
        let keywords: [String]
        let answer: String
        let citations: [CitationDTO]
        let disclaimer: String
    }

    let entries: [Entry]

    init(entries: [Entry]) { self.entries = entries }

    init(bundle: Bundle = .main) {
        guard let url = bundle.url(forResource: "MuseFallbackAnswers", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([Entry].self, from: data) else {
            entries = []
            return
        }
        entries = decoded
    }

    func ask(_ question: String, context: MuseContext) async throws -> MuseAnswer {
        let text = question.lowercased()
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw MuseError.invalidQuestion }
        let scored = entries.map { entry in
            (entry, entry.keywords.filter { !$0.isEmpty && text.contains($0.lowercased()) }.count)
        }
        guard let best = scored.max(by: { $0.1 < $1.1 }), best.1 > 0 else { throw MuseError.noOfflineAnswer }
        let citations = RemoteMuseService.citations(from: best.0.citations)
        return MuseAnswer(answer: best.0.answer, citations: citations, disclaimer: best.0.disclaimer,
                          source: .precomputed, grounded: !citations.isEmpty)
    }
}
