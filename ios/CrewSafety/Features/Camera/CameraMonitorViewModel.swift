import AVFoundation
import Foundation
import Observation
import UIKit

@MainActor @Observable
final class CameraMonitorViewModel {
    enum Mode: Equatable {
        case idle
        case live
        case replay(name: String)
    }

    enum CameraAccess: Equatable {
        case unknown, authorized, denied, unavailable
    }

    private(set) var mode: Mode = .idle
    private(set) var access: CameraAccess = .unknown
    private(set) var lastDetection: FallDetection?
    private(set) var lastDetectionSource: EventSource?
    private(set) var showsDetectionFlash = false
    private(set) var personVisible = false
    private(set) var replayFrame: PoseFrame?
    private(set) var replayAspectRatio = 9.0 / 16.0
    private(set) var cameraError: String?
    let fixtures: [PoseFixture]

    @ObservationIgnored let camera = CameraService()
    @ObservationIgnored private var detector = HeuristicFallDetector()
    @ObservationIgnored private var replayTask: Task<Void, Never>?
    @ObservationIgnored private var flashTask: Task<Void, Never>?
    @ObservationIgnored private var eventStore: EventStore?
    @ObservationIgnored private var crewStore: CrewStore?

    init() {
        fixtures = PoseFixture.bundled() + SyntheticPoses.fixtures
        refreshAccess()
    }

    var isActive: Bool { mode != .idle }

    var statusText: String {
        if showsDetectionFlash { return "Possible fall detected" }
        switch mode {
        case .idle: return "Idle"
        case .live: return personVisible ? "Monitoring" : "Monitoring · no person in view"
        case .replay(let name): return "Replay · \(name)"
        }
    }

    func attach(eventStore: EventStore, crewStore: CrewStore) {
        self.eventStore = eventStore
        self.crewStore = crewStore
    }

    func refreshAccess() {
        guard CameraService.device != nil else {
            access = .unavailable
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: access = .authorized
        case .notDetermined: access = .unknown
        default: access = .denied
        }
    }

    // MARK: Live camera

    func startLive() async {
        stop()
        refreshAccess()
        if access == .unknown {
            access = await AVCaptureDevice.requestAccess(for: .video) ? .authorized : .denied
        }
        guard access == .authorized else { return }

        detector.reset()
        cameraError = nil
        camera.onPose = { [weak self] frame, aspect in
            Task { @MainActor in self?.handle(frame, aspectRatio: aspect, source: .liveCamera) }
        }
        mode = .live
        UIApplication.shared.isIdleTimerDisabled = true
        camera.start { [weak self] ok in
            guard let self, !ok else { return }
            self.cameraError = "The camera could not be started."
            self.stop()
        }
    }

    // MARK: Replay

    func startReplay(_ fixture: PoseFixture) {
        stop()
        detector.reset()
        mode = .replay(name: fixture.displayName)
        replayAspectRatio = fixture.aspectRatio ?? 9.0 / 16.0
        let aspect = replayAspectRatio
        replayTask = Task { [weak self] in
            var previous = fixture.frames.first?.t ?? 0
            for frame in fixture.frames {
                let wait = max(0, frame.t - previous)
                previous = frame.t
                try? await Task.sleep(for: .seconds(wait))
                guard !Task.isCancelled, let self else { return }
                self.replayFrame = frame
                self.handle(frame, aspectRatio: aspect, source: .replay)
            }
            guard !Task.isCancelled, let self else { return }
            self.replayTask = nil
            self.mode = .idle
        }
    }

    func stop() {
        replayTask?.cancel()
        replayTask = nil
        if mode == .live {
            camera.stop()
            camera.onPose = nil
            UIApplication.shared.isIdleTimerDisabled = false
        }
        mode = .idle
        personVisible = false
        replayFrame = nil
    }

    // MARK: Detection

    private func handle(_ frame: PoseFrame, aspectRatio: Double, source: EventSource) {
        // Ignore frames that arrive after the mode they belong to has ended.
        switch (mode, source) {
        case (.live, .liveCamera), (.replay, .replay): break
        default: return
        }
        personVisible = !frame.joints.isEmpty
        detector.frameAspectRatio = aspectRatio
        guard let detection = detector.process(frame) else { return }

        lastDetection = detection
        lastDetectionSource = source
        if let eventStore, let crewStore {
            eventStore.record(SafetyEvent(crewMemberID: crewStore.monitoredCrewMemberID,
                                          type: .possibleFall, severity: .critical, source: source,
                                          heuristicScore: detection.score, details: detection.explanation))
        }
        showsDetectionFlash = true
        flashTask?.cancel()
        flashTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.showsDetectionFlash = false
        }
    }
}
