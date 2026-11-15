import XCTest
@testable import CrewSafety

final class AgentConversationTests: XCTestCase {
    func testOutputRateAcceptsOnlyPCM() {
        XCTAssertEqual(AgentAudio.outputRate(for: "pcm_16000"), 16_000)
        XCTAssertEqual(AgentAudio.outputRate(for: "pcm_44100"), 44_100)
        XCTAssertEqual(AgentAudio.outputRate(for: nil), 16_000)
        XCTAssertNil(AgentAudio.outputRate(for: "ulaw_8000"))
        XCTAssertNil(AgentAudio.outputRate(for: "pcm_abc"))
    }

    func testPCMRoundTripClipsInsteadOfWrapping() {
        let data = AgentAudio.pcm16Data(from: [0, 0.5, -0.5, 2, -2])
        XCTAssertEqual(data.count, 10)
        let back = AgentAudio.floats(fromPCM16: data)
        XCTAssertEqual(back.count, 5)
        XCTAssertEqual(back[1], 0.5, accuracy: 0.001)
        XCTAssertEqual(back[3], 1, accuracy: 0.001)
        XCTAssertEqual(back[4], -1, accuracy: 0.001)
    }

    func testMessagesParseToTheRightEffect() {
        XCTAssertEqual(AgentMessage.parse(#"{"type":"conversation_initiation_metadata","conversation_initiation_metadata_event":{"agent_output_audio_format":"pcm_16000"}}"#), .ready(outputRate: 16_000))
        XCTAssertEqual(AgentMessage.parse(#"{"type":"conversation_initiation_metadata","conversation_initiation_metadata_event":{"agent_output_audio_format":"ulaw_8000"}}"#), .ready(outputRate: nil))
        XCTAssertEqual(AgentMessage.parse(#"{"type":"user_transcript","user_transcription_event":{"user_transcript":"I'm okay"}}"#), .user("I'm okay"))
        XCTAssertEqual(AgentMessage.parse(#"{"type":"agent_response","agent_response_event":{"agent_response":"Are you OK?"}}"#), .agent("Are you OK?"))
        XCTAssertEqual(AgentMessage.parse(#"{"type":"ping","ping_event":{"event_id":7}}"#), .ping(7))
        XCTAssertEqual(AgentMessage.parse(#"{"type":"interruption"}"#), .interrupt)
        XCTAssertEqual(AgentMessage.parse(#"{"type":"audio","audio_event":{"audio_base_64":"AAA="}}"#), .audio(Data([0, 0])))
        XCTAssertEqual(AgentMessage.parse(#"{"type":"audio","audio_event":{}}"#), .ignored)
        XCTAssertEqual(AgentMessage.parse("not json"), .ignored)
        XCTAssertEqual(AgentMessage.parse(#"{"type":"something_new"}"#), .ignored)
    }

    func testAgentTranscriptsAreClassifiedLikeAnyOtherAnswer() {
        XCTAssertEqual(CrewCheckIn.classify(transcript: "I'm okay"), .ok)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "help me please"), .help)
    }

    func testOriginIsSchemeHostAndPortOnly() {
        XCTAssertEqual(AgentAudio.origin(of: URL(string: "https://example.com/path?x=1")!), "https://example.com")
        XCTAssertEqual(AgentAudio.origin(of: URL(string: "http://192.168.1.5:4173")!), "http://192.168.1.5:4173")
        XCTAssertNil(AgentAudio.origin(of: URL(string: "ftp://example.com")!))
    }
}
