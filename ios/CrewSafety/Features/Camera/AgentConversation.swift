import AVFoundation
import Foundation

/// A message from the ElevenLabs agent socket, reduced to what the check-in needs.
enum AgentMessage: Equatable {
    case ready(outputRate: Double?)
    case audio(Data)
    case user(String)
    case agent(String)
    case interrupt
    case ping(Int?)
    case ignored

    static func parse(_ text: String) -> AgentMessage {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return .ignored }
        switch type {
        case "conversation_initiation_metadata":
            let event = json["conversation_initiation_metadata_event"] as? [String: Any]
            return .ready(outputRate: AgentAudio.outputRate(for: event?["agent_output_audio_format"] as? String))
        case "audio":
            let event = json["audio_event"] as? [String: Any]
            if let base64 = event?["audio_base_64"] as? String, let audio = Data(base64Encoded: base64) { return .audio(audio) }
            return .ignored
        case "user_transcript":
            let event = json["user_transcription_event"] as? [String: Any]
            return .user(event?["user_transcript"] as? String ?? "")
        case "agent_response":
            let event = json["agent_response_event"] as? [String: Any]
            return .agent(event?["agent_response"] as? String ?? "")
        case "interruption":
            return .interrupt
        case "ping":
            let event = json["ping_event"] as? [String: Any]
            return .ping(event?["event_id"] as? Int)
        default:
            return .ignored
        }
    }
}

enum AgentAudio {
    static let inputRate: Double = 16_000

    /// 16000 for "pcm_16000" (also the default when unstated); nil for any format that is not plain PCM.
    static func outputRate(for format: String?) -> Double? {
        guard let format else { return inputRate }
        guard format.hasPrefix("pcm_"), let rate = Double(format.dropFirst(4)), rate >= 8_000, rate <= 48_000 else { return nil }
        return rate
    }

    /// Little-endian 16-bit samples, clipped to the valid range.
    static func pcm16Data(from samples: [Float]) -> Data {
        var data = Data(capacity: samples.count * 2)
        for sample in samples {
            let value = Int16((max(-1, min(1, sample)) * 32767).rounded())
            withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
        }
        return data
    }

    static func floats(fromPCM16 data: Data) -> [Float] {
        let count = data.count / 2
        return (0..<count).map { index in
            let low = UInt16(data[data.startIndex + index * 2]), high = UInt16(data[data.startIndex + index * 2 + 1])
            return Float(Int16(bitPattern: low | (high << 8))) / 32768
        }
    }

    /// "https://host:port" for a base address: the website only accepts the check-in link from its own origin.
    static func origin(of base: URL) -> String? {
        guard let scheme = base.scheme?.lowercased(), ["http", "https"].contains(scheme), let host = base.host else { return nil }
        return "\(scheme)://\(host)\(base.port.map { ":\($0)" } ?? "")"
    }
}

enum AgentSignedURL {
    enum Failure: Error { case badAddress, unavailable }

    /// Asks the website for a short-lived link to the check-in agent. The ElevenLabs key stays on the server.
    static func fetch(base: URL, session: URLSession = .shared) async throws -> URL {
        guard let origin = AgentAudio.origin(of: base) else { throw Failure.badAddress }
        var request = URLRequest(url: base.appendingPathComponent("api/checkin/voice/session"))
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue(origin, forHTTPHeaderField: "Origin")
        let (data, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let link = (json["signedUrl"] as? String).flatMap(URL.init(string:)),
              link.scheme == "wss" else { throw Failure.unavailable }
        return link
    }
}

/// A live two-way voice conversation with the "CrewSafety Check-in" ElevenLabs agent.
///
/// Opt-in only (Settings): while it is open the microphone audio is sent to ElevenLabs. The app still reads the
/// transcript of what the person said and ends the check-in on "I'm okay" or "help" like any other answer.
@MainActor
final class AgentConversation {
    enum State { case connecting, listening, speaking, ended }
    enum Failure: Error { case timedOut, unsupportedAudio, closed }

    var onState: (State) -> Void = { _ in }
    var onUser: (String) -> Void = { _ in }
    var onAgent: (String) -> Void = { _ in }

    private var socket: URLSessionWebSocketTask?
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var outputFormat: AVAudioFormat?
    private var tapInstalled = false
    private var pendingBuffers = 0
    private var stopped = false
    private var readyContinuation: CheckedContinuation<Void, Error>?

    /// Connects and returns once the agent is ready to talk. Throws when it cannot start.
    func start(url: URL) async throws {
        onState(.connecting)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .duckOthers])
        try session.setActive(true)
        engine.attach(player)
        try? engine.inputNode.setVoiceProcessingEnabled(true) // echo cancellation, so it does not hear itself

        let socket = URLSession.shared.webSocketTask(with: url)
        self.socket = socket
        socket.resume()
        Task { await receiveLoop(socket) }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 10_000_000_000)
            self?.finishReady(.failure(Failure.timedOut))
        }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            readyContinuation = continuation
        }
    }

    func stop() {
        guard !stopped else { return }
        stopped = true
        finishReady(.failure(Failure.closed))
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        player.stop()
        if engine.isRunning { engine.stop() }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        onState(.ended)
    }

    // MARK: Private

    private func finishReady(_ result: Result<Void, Error>) {
        guard let continuation = readyContinuation else { return }
        readyContinuation = nil
        continuation.resume(with: result)
    }

    private func receiveLoop(_ socket: URLSessionWebSocketTask) async {
        while !stopped {
            do {
                if case .string(let text) = try await socket.receive() { handle(AgentMessage.parse(text)) }
            } catch {
                finishReady(.failure(Failure.closed))
                stop()
                return
            }
        }
    }

    private func handle(_ message: AgentMessage) {
        guard !stopped else { return }
        switch message {
        case .ready(let rate):
            guard let rate, let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate, channels: 1, interleaved: false) else {
                finishReady(.failure(Failure.unsupportedAudio)); stop(); return
            }
            do { try beginAudio(outputFormat: format) } catch { finishReady(.failure(error)); stop(); return }
            onState(.listening)
            finishReady(.success(()))
        case .audio(let data): play(data)
        case .user(let text): onUser(text)
        case .agent(let text): onAgent(text)
        case .interrupt:
            player.stop(); pendingBuffers = 0; player.play(); onState(.listening)
        case .ping(let id):
            var reply: [String: Any] = ["type": "pong"]
            if let id { reply["event_id"] = id }
            if let data = try? JSONSerialization.data(withJSONObject: reply), let text = String(data: data, encoding: .utf8) {
                socket?.send(.string(text)) { _ in }
            }
        case .ignored: break
        }
    }

    private func beginAudio(outputFormat: AVAudioFormat) throws {
        self.outputFormat = outputFormat
        engine.connect(player, to: engine.mainMixerNode, format: outputFormat)

        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0,
              let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: AgentAudio.inputRate, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inputFormat, to: target), let socket else { throw Failure.unsupportedAudio }
        input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * AgentAudio.inputRate / inputFormat.sampleRate) + 16
            guard let converted = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
            var supplied = false
            var error: NSError?
            converter.convert(to: converted, error: &error) { _, status in
                if supplied { status.pointee = .noDataNow; return nil }
                supplied = true; status.pointee = .haveData; return buffer
            }
            guard error == nil, converted.frameLength > 0, let samples = converted.int16ChannelData else { return }
            let audio = Data(bytes: samples[0], count: Int(converted.frameLength) * 2).base64EncodedString()
            socket.send(.string("{\"user_audio_chunk\":\"\(audio)\"}")) { _ in }
        }
        tapInstalled = true
        engine.prepare()
        try engine.start()
        player.play()
    }

    private func play(_ data: Data) {
        guard let outputFormat else { return }
        let samples = AgentAudio.floats(fromPCM16: data)
        guard !samples.isEmpty,
              let buffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        for (index, sample) in samples.enumerated() { channel[index] = sample }
        pendingBuffers += 1
        onState(.speaking)
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { @MainActor in
                guard let self, !self.stopped else { return }
                self.pendingBuffers = max(0, self.pendingBuffers - 1)
                if self.pendingBuffers == 0 { self.onState(.listening) }
            }
        }
    }
}
