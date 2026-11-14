import Foundation
import Observation

@MainActor @Observable
final class MuseChatViewModel {
    private(set) var messages: [ChatMessage] = []
    /// Assistant messages for which retrieval found no supporting source.
    private(set) var ungroundedMessageIDs: Set<UUID> = []
    private(set) var isLoading = false
    private(set) var error: MuseError?
    private(set) var pendingQuestion: String?
    var draft = ""

    var canSend: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isLoading && !trimmed.isEmpty && trimmed.count <= RemoteMuseService.maxQuestionLength
    }

    var isOverLength: Bool {
        draft.trimmingCharacters(in: .whitespacesAndNewlines).count > RemoteMuseService.maxQuestionLength
    }

    func send(using service: any MuseService) async {
        guard canSend else { return }
        let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = ""
        messages.append(ChatMessage(id: UUID(), role: .user, content: question, citations: [],
                                    timestamp: .now, answerSource: nil, disclaimer: nil))
        await ask(question, using: service)
    }

    func retry(using service: any MuseService) async {
        guard !isLoading, let question = pendingQuestion else { return }
        await ask(question, using: service)
    }

    private func ask(_ question: String, using service: any MuseService) async {
        isLoading = true
        error = nil
        pendingQuestion = question
        defer { isLoading = false }
        do {
            let answer = try await service.ask(question, context: .generalWellness)
            let message = ChatMessage(id: UUID(), role: .assistant, content: answer.answer,
                                      citations: answer.citations, timestamp: .now,
                                      answerSource: answer.source, disclaimer: answer.disclaimer)
            messages.append(message)
            if !answer.grounded { ungroundedMessageIDs.insert(message.id) }
            pendingQuestion = nil
        } catch let museError as MuseError {
            error = museError
        } catch {
            self.error = .badResponse
        }
    }

    static func title(for error: MuseError) -> String {
        switch error {
        case .invalidQuestion: "That question can't be sent"
        case .serviceUnavailable: "MUSE is unavailable"
        case .offline: "Can't reach the MUSE backend"
        case .timeout: "MUSE took too long to answer"
        case .badResponse: "MUSE sent an unexpected reply"
        case .noOfflineAnswer: "No precomputed answer for that question"
        }
    }

    static func detail(for error: MuseError) -> String {
        switch error {
        case .invalidQuestion: "Questions must be between 1 and 500 characters."
        case .serviceUnavailable: "The research service reported a problem. No answer was made up in its place."
        case .offline: "Check the backend address in Settings and that this phone is on the same network, or switch to Demo mode."
        case .timeout: "The backend did not reply within 15 seconds."
        case .badResponse: "The reply could not be read, so it is not shown."
        case .noOfflineAnswer: "Demo mode only has answers that were exported from the research service ahead of time."
        }
    }
}
