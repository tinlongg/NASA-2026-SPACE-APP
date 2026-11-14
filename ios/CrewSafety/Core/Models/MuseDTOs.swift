import Foundation

// MARK: - Wire format (must match backend/app/schemas.py exactly)
struct ChatRequestDTO: Codable, Sendable {
    let question: String
    let context: String
}

struct CitationDTO: Codable, Sendable {
    let title: String
    let url: String
    let sectionOrPage: String?
}

struct ChatResponseDTO: Codable, Sendable {
    let answer: String
    let citations: [CitationDTO]
    let disclaimer: String
    let grounded: Bool?       // additive field; absent => treat as !citations.isEmpty
    let answerMode: String?   // additive field: "generated" | "extractive"
}

struct APIErrorDTO: Codable, Sendable {
    struct Body: Codable, Sendable { let code: String; let message: String }
    let error: Body
}

