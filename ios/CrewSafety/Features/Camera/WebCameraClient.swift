import Foundation

/// Receives pose frames from the browser web camera through the local relay (`webcam/server.js`)
/// and sends check-in state back so the page can mirror the "Are you OK?" prompt.
/// Only joint positions arrive here; the video stays in the browser.
@MainActor
final class WebCameraClient {
    enum Status: Equatable {
        case disconnected
        case connecting
        /// Connected to the relay, but no camera page is open or sending.
        case waitingForCamera
        case receiving
        case failed(String)
    }

    var onStatus: ((Status) -> Void)?
    var onPose: ((PoseFrame, Double) -> Void)?
    var onAnswer: ((FallCheckIn.Response) -> Void)?
    /// Speech the page transcribed (ElevenLabs). The app classifies it like any other transcript.
    var onTranscript: ((String) -> Void)?
    /// Called when a different camera page takes over, so the detector can start fresh.
    var onCameraChanged: (() -> Void)?

    private(set) var status: Status = .disconnected {
        didSet { if status != oldValue { onStatus?(status) } }
    }
    private var task: URLSessionWebSocketTask?
    private var lastFrameAt: Date?
    /// The camera page being followed. With several pages open, frames from the others are ignored
    /// until this one goes quiet, so two clocks never mix in the detector.
    private var activeCamera: Int?
    private var watchdog: Task<Void, Never>?

    func connect(to url: URL) {
        disconnect()
        status = .connecting
        let task = URLSession.shared.webSocketTask(with: url)
        self.task = task
        task.resume()
        receive(on: task)
        // URLSession only reports a failed connection on the first receive, so mark it connected after a ping.
        task.sendPing { [weak self] error in
            Task { @MainActor in
                guard let self, self.task === task else { return }
                if let error {
                    self.status = .failed(Self.describe(error))
                } else if self.status == .connecting {
                    self.status = .waitingForCamera
                }
            }
        }
        watchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, !Task.isCancelled else { return }
                if self.status == .receiving, let last = self.lastFrameAt, Date.now.timeIntervalSince(last) > 2 {
                    self.status = .waitingForCamera
                }
            }
        }
    }

    func disconnect() {
        watchdog?.cancel()
        watchdog = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        lastFrameAt = nil
        activeCamera = nil
        status = .disconnected
    }

    func send(_ object: [String: Any]) {
        guard let task, let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8) else { return }
        task.send(.string(text)) { _ in }
    }

    // MARK: Private

    private struct Envelope: Decodable {
        let type: String
        let t: Double?
        let aspect: Double?
        let joints: [String: PosePoint]?
        let response: String?
        let text: String?
        let cameras: Int?
        /// Which camera page sent it, added by the relay.
        let cam: Int?
    }

    private func receive(on task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            Task { @MainActor in
                guard let self, self.task === task else { return }
                switch result {
                case .failure(let error):
                    self.status = .failed(Self.describe(error))
                case .success(let message):
                    if case .string(let text) = message { self.handle(text) }
                    self.receive(on: task)
                }
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(Envelope.self, from: data) else { return }
        switch envelope.type {
        case "pose":
            guard let t = envelope.t else { return }
            if let cam = envelope.cam, cam != activeCamera {
                let activeIsQuiet = lastFrameAt.map { Date.now.timeIntervalSince($0) > 1.5 } ?? true
                guard activeCamera == nil || activeIsQuiet else { return }
                activeCamera = cam
                onCameraChanged?()
            }
            lastFrameAt = .now
            status = .receiving
            onPose?(PoseFrame(t: t, joints: envelope.joints ?? [:]), envelope.aspect ?? 16.0 / 9.0)
        case "answer":
            switch envelope.response {
            case "ok": onAnswer?(.ok)
            case "help": onAnswer?(.help)
            default: break
            }
        case "transcript":
            if let text = envelope.text, !text.isEmpty { onTranscript?(text) }
        case "peers":
            if envelope.cameras == 0, status == .receiving { status = .waitingForCamera }
        default:
            break
        }
    }

    private static func describe(_ error: Error) -> String {
        "Can't reach the web camera relay. Run node webcam/server.js on the Mac."
    }
}
