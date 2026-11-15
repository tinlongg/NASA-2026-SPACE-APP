import AVFoundation
import Speech

/// Speaks the check-in question and listens for a spoken answer, all on the device.
///
/// Listening starts only after the question has finished playing, so the app never hears its own
/// prompt ("Say I'm okay") as an answer. Audio is not stored or sent.
///
/// Fixed phrases are played from bundled clips (generated once with ElevenLabs by
/// `backend/scripts/generate_voice.py`), so the check-in works offline and never waits on a network
/// request. Any phrase without a clip, or a clip that fails to play, falls back to the system voice.
@MainActor
final class CheckInVoice: NSObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {
    private var synthesizer: AVSpeechSynthesizer?
    private var player: AVAudioPlayer?
    private var engine: AVAudioEngine?
    private var tappedInput: AVAudioInputNode?
    private var sessionActive = false
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var speechFinished: CheckedContinuation<Void, Never>?

    /// Speaks `text` and returns when it has finished (or was stopped).
    func speak(_ text: String) async {
        configureSession()
        if await playClip(for: text) { return }
        let synthesizer = synthesizer ?? AVSpeechSynthesizer()
        self.synthesizer = synthesizer
        synthesizer.delegate = self
        await withCheckedContinuation { continuation in
            speechFinished = continuation
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            synthesizer.speak(utterance)
        }
    }

    /// The bundled clip for an exact phrase, listed in `Voice/phrases.json`, or nil when there is none.
    static func clipURL(for text: String, in bundle: Bundle = .main) -> URL? {
        guard let list = bundle.url(forResource: "phrases", withExtension: "json"),
              let data = try? Data(contentsOf: list),
              let phrases = try? JSONDecoder().decode([Phrase].self, from: data),
              let name = phrases.first(where: { $0.text == text })?.name else { return nil }
        return bundle.url(forResource: name, withExtension: "mp3")
    }

    private struct Phrase: Decodable { let name: String; let text: String }

    /// Plays the bundled clip and returns true when it played to the end (or was stopped).
    private func playClip(for text: String) async -> Bool {
        guard let url = Self.clipURL(for: text),
              let player = try? AVAudioPlayer(contentsOf: url) else { return false }
        player.delegate = self
        self.player = player
        guard player.prepareToPlay() else { self.player = nil; return false }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            speechFinished = continuation
            if !player.play() { resumeSpeech() }
        }
        return true
    }

    /// Asks for microphone and speech permission. Call when monitoring starts, never during a check-in,
    /// so a system prompt can't cover the "I'm OK" button during a check-in.
    func prepare() async {
        _ = await Self.requestPermissions()
    }

    /// Starts on-device speech recognition. Returns false when voice is unavailable
    /// (permission not granted, no on-device recognizer, no microphone), in which case only taps work.
    /// Never asks for permission itself.
    func listen(onTranscript: @escaping (String) -> Void) async -> Bool {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              AVAudioApplication.shared.recordPermission == .granted,
              let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              recognizer.isAvailable,
              // Audio must stay on the device, so voice is off where on-device recognition isn't supported.
              recognizer.supportsOnDeviceRecognition else { return false }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true

        configureSession()
        let engine = AVAudioEngine()
        self.engine = engine
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            self.engine = nil
            return false
        }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        tappedInput = input
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            tappedInput = nil
            self.engine = nil
            return false
        }

        self.request = request
        task = recognizer.recognitionTask(with: request) { result, _ in
            guard let text = result?.bestTranscription.formattedString else { return }
            Task { @MainActor in onTranscript(text) }
        }
        return true
    }

    /// Stops speaking and listening and releases the microphone.
    func stop() {
        if let synthesizer, synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        player?.stop()
        player = nil
        resumeSpeech()
        if let engine, engine.isRunning { engine.stop() }
        // Accessing engine.inputNode creates audio I/O. Cleanup must not open a microphone
        // when recognition never started (for example, after permission was denied).
        tappedInput?.removeTap(onBus: 0)
        tappedInput = nil
        engine = nil
        request?.endAudio()
        request = nil
        task?.cancel()
        task = nil
        if sessionActive {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            sessionActive = false
        }
    }

    // MARK: Private

    private func configureSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .duckOthers])
            try session.setActive(true)
            sessionActive = true
        } catch {
            // Buttons remain available when audio cannot be activated.
        }
    }

    private func resumeSpeech() {
        speechFinished?.resume()
        speechFinished = nil
    }

    private static func requestPermissions() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.resumeSpeech() }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in self.resumeSpeech() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.resumeSpeech() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.resumeSpeech() }
    }
}
