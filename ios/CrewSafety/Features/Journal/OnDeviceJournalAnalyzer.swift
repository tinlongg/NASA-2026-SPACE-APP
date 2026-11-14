import Foundation
import NaturalLanguage

/// Lists themes the writer mentioned, using Apple's on-device NaturalLanguage framework.
/// It reports what was written about. It does not score mood, judge the writer, or diagnose anything.
struct OnDeviceJournalAnalyzer: JournalAnalyzing {
    static let disclaimer = "Summary of what you wrote. Not an assessment or diagnosis."

    /// Theme name -> word stems that count as a mention.
    static let lexicon: [(theme: String, words: Set<String>)] = [
        ("sleep", ["sleep", "slept", "asleep", "nap", "insomnia", "tired", "rest", "rested", "awake", "dream", "fatigue"]),
        ("workload", ["work", "workload", "task", "schedule", "deadline", "busy", "shift", "overtime", "procedure"]),
        ("exercise", ["exercise", "workout", "treadmill", "run", "ran", "training", "stretch", "gym", "cycling", "strength"]),
        ("isolation", ["alone", "lonely", "isolated", "isolation", "confined", "cramped", "homesick"]),
        ("family and home", ["family", "home", "wife", "husband", "partner", "kids", "children", "mom", "dad", "parents", "friend", "friends"]),
        ("food", ["food", "meal", "eat", "ate", "hungry", "appetite", "dinner", "lunch", "breakfast", "coffee"]),
        ("crew and teamwork", ["crew", "team", "crewmate", "teammate", "argument", "conflict", "together", "commander"]),
        ("stress", ["stress", "stressed", "stressful", "pressure", "overwhelmed", "tense", "worry", "worried"]),
        ("physical comfort", ["pain", "ache", "headache", "sore", "nausea", "dizzy", "cold", "hot", "back"]),
    ]

    func summarize(_ body: String) async -> JournalSummary {
        let themes = Self.themes(in: body)
        let text: String
        if themes.isEmpty {
            text = "No common themes were picked out of this entry."
        } else {
            text = "You wrote about: " + themes.joined(separator: ", ") + "."
        }
        return JournalSummary(themes: themes, text: text, generatedBy: .onDevice, disclaimer: Self.disclaimer)
    }

    static func themes(in body: String) -> [String] {
        var found: Set<String> = []
        let tagger = NLTagger(tagSchemes: [.lemma])
        tagger.string = body
        tagger.enumerateTags(in: body.startIndex..<body.endIndex, unit: .word, scheme: .lemma,
                             options: [.omitWhitespace, .omitPunctuation]) { tag, range in
            found.insert(body[range].lowercased())
            if let lemma = tag?.rawValue.lowercased() { found.insert(lemma) }
            return true
        }
        return lexicon.filter { !$0.words.isDisjoint(with: found) }.map(\.theme)
    }
}
