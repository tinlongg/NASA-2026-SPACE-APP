import XCTest
@testable import CrewSafety

private final class StubProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        do {
            let (status, data) = try Self.handler!(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
}

final class MuseServiceTests: XCTestCase {
    private func service() -> RemoteMuseService {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return RemoteMuseService(baseURL: URL(string: "http://test.invalid")!, session: URLSession(configuration: configuration))
    }

    private func expectError(_ expected: MuseError, file: StaticString = #filePath, line: UInt = #line) async {
        do {
            _ = try await service().ask("question", context: .generalWellness)
            XCTFail("Expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? MuseError, expected, file: file, line: line)
        }
    }

    func testSuccessDecodesAndSendsContractBody() async throws {
        StubProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/chat")
            XCTAssertEqual(request.httpMethod, "POST")
            let body = #"{"answer":"A","citations":[{"title":"T","url":"https://example.org/doc","sectionOrPage":"p. 3"},{"title":"Bad","url":"not a url","sectionOrPage":null}],"disclaimer":"D","grounded":true,"answerMode":"extractive"}"#
            return (200, Data(body.utf8))
        }
        let answer = try await service().ask("  question  ", context: .generalWellness)
        XCTAssertEqual(answer.answer, "A")
        XCTAssertEqual(answer.source, .live)
        XCTAssertTrue(answer.grounded)
        XCTAssertEqual(answer.citations.map(\.title), ["T"], "Citation with an invalid URL must be dropped")
    }

    func testResponseWithoutOptionalFieldsAndNoCitationsIsUngrounded() async throws {
        StubProtocol.handler = { _ in (200, Data(#"{"answer":"A","citations":[],"disclaimer":"D"}"#.utf8)) }
        let answer = try await service().ask("q", context: .generalWellness)
        XCTAssertFalse(answer.grounded)
    }

    func testStatusCodesMapToErrors() async {
        StubProtocol.handler = { _ in (400, Data()) }
        await expectError(.invalidQuestion)
        StubProtocol.handler = { _ in (503, Data()) }
        await expectError(.serviceUnavailable)
        StubProtocol.handler = { _ in (500, Data()) }
        await expectError(.badResponse)
        StubProtocol.handler = { _ in (200, Data("not json".utf8)) }
        await expectError(.badResponse)
    }

    func testTransportErrorsMapToErrors() async {
        StubProtocol.handler = { _ in throw URLError(.timedOut) }
        await expectError(.timeout)
        StubProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
        await expectError(.offline)
        StubProtocol.handler = { _ in throw URLError(.cannotConnectToHost) }
        await expectError(.offline)
    }

    func testEmptyAndOverLengthQuestionsAreRejectedLocally() async {
        StubProtocol.handler = { _ in XCTFail("No request should be sent"); return (200, Data()) }
        for question in ["   ", String(repeating: "x", count: 501)] {
            do {
                _ = try await service().ask(question, context: .generalWellness)
                XCTFail("Expected invalidQuestion")
            } catch {
                XCTAssertEqual(error as? MuseError, .invalidQuestion)
            }
        }
    }

    func testDemoServiceWithNoEntriesNeverAnswers() async {
        do {
            _ = try await DemoMuseService(entries: []).ask("anything about sleep", context: .generalWellness)
            XCTFail("Expected noOfflineAnswer")
        } catch {
            XCTAssertEqual(error as? MuseError, .noOfflineAnswer)
        }
    }

    func testDemoServiceMatchesByKeywordAndLabelsPrecomputed() async throws {
        // Clearly artificial test data, not a real source.
        let entry = DemoMuseService.Entry(id: "t1", question: "Test question", keywords: ["zebra"],
                                          answer: "Test answer", citations: [CitationDTO(title: "Test document (unit test fixture)", url: "https://example.org/test", sectionOrPage: nil)],
                                          disclaimer: "D")
        let demo = DemoMuseService(entries: [entry])
        let answer = try await demo.ask("Tell me about the ZEBRA", context: .generalWellness)
        XCTAssertEqual(answer.source, .precomputed)
        XCTAssertEqual(answer.answer, "Test answer")
        do {
            _ = try await demo.ask("unrelated", context: .generalWellness)
            XCTFail("Expected noOfflineAnswer")
        } catch {
            XCTAssertEqual(error as? MuseError, .noOfflineAnswer)
        }
    }

    func testBundledFallbackFileDecodes() {
        // Ships as [] until real answers are exported from the backend.
        XCTAssertNotNil(Bundle.main.url(forResource: "MuseFallbackAnswers", withExtension: "json"))
        _ = DemoMuseService()
    }
}
