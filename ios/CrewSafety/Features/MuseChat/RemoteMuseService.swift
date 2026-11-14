import Foundation

/// Talks to the FastAPI backend. Contract: docs/EXECUTION_PLAN.md section 5.3.
struct RemoteMuseService: MuseService {
    static let maxQuestionLength = 500
    let baseURL: URL
    var session: URLSession = .shared
    var timeout: TimeInterval = 15

    func ask(_ question: String, context: MuseContext) async throws -> MuseAnswer {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= Self.maxQuestionLength else { throw MuseError.invalidQuestion }

        var request = URLRequest(url: baseURL.appendingPathComponent("chat"))
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ChatRequestDTO(question: trimmed, context: context.rawValue))

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            switch error.code {
            case .timedOut: throw MuseError.timeout
            case .notConnectedToInternet, .cannotConnectToHost, .cannotFindHost, .networkConnectionLost,
                 .dnsLookupFailed, .dataNotAllowed:
                throw MuseError.offline
            default: throw MuseError.badResponse
            }
        } catch {
            throw MuseError.badResponse
        }

        guard let http = response as? HTTPURLResponse else { throw MuseError.badResponse }
        switch http.statusCode {
        case 200: break
        case 400, 422: throw MuseError.invalidQuestion
        case 503: throw MuseError.serviceUnavailable
        default: throw MuseError.badResponse
        }
        guard let dto = try? JSONDecoder().decode(ChatResponseDTO.self, from: data) else { throw MuseError.badResponse }
        return Self.answer(from: dto, source: .live)
    }

    /// Citations whose URL does not parse as http(s) are dropped rather than shown as broken links.
    static func citations(from dtos: [CitationDTO]) -> [ResearchCitation] {
        dtos.compactMap { dto in
            guard let url = URL(string: dto.url), let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https", url.host != nil else { return nil }
            return ResearchCitation(title: dto.title, url: url, sectionOrPage: dto.sectionOrPage)
        }
    }

    static func answer(from dto: ChatResponseDTO, source: AnswerSource) -> MuseAnswer {
        let citations = citations(from: dto.citations)
        return MuseAnswer(answer: dto.answer, citations: citations, disclaimer: dto.disclaimer,
                          source: source, grounded: (dto.grounded ?? true) && !citations.isEmpty)
    }
}
