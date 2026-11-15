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
        /// Pose frames streamed from the browser page in webcam/, through the local relay.
        case webCamera
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
    /// The most recent pose in any mode, for the skeleton and bounding box.
    private(set) var latestFrame: PoseFrame?
    private(set) var latestAspectRatio = 9.0 / 16.0
    /// Live detector state for the Detector readout.
    private(set) var reading = HeuristicFallDetector.Reading()
    /// Thresholds currently in use (standard, or easy test detection on the web camera).
    private(set) var thresholds = FallDetectorConfig()
    private(set) var cameraError: String?
    let fixtures: [PoseFixture]

    // Check-in after a possible fall
    /// How long to wait for "I'm OK" before raising a critical alert.
    static let checkInDuration: TimeInterval = 60
    private(set) var checkIn = FallCheckIn(duration: CameraMonitorViewModel.checkInDuration)
    private(set) var isListening = false
    private(set) var heardText: String?
    private(set) var lastOutcome: CheckInOutcome?
    private(set) var webCameraStatus: WebCameraClient.Status = .disconnected
    /// Web camera only: much easier thresholds so you can test without really falling.
    var easyTestDetection = true {
        didSet { if mode == .webCamera { resetDetector() } }
    }
    private var usesEasyDetection: Bool { mode == .webCamera && easyTestDetection }

    @ObservationIgnored let camera = CameraService()
    @ObservationIgnored private var detector = HeuristicFallDetector()
    @ObservationIgnored private var replayTask: Task<Void, Never>?
    @ObservationIgnored private var flashTask: Task<Void, Never>?
    @ObservationIgnored private var eventStore: EventStore?
    @ObservationIgnored private var crewStore: CrewStore?
    @ObservationIgnored private let voice = CheckInVoice()
    @ObservationIgnored private let webCamera = WebCameraClient()
    @ObservationIgnored private var countdownTask: Task<Void, Never>?
    @ObservationIgnored private var voiceTask: Task<Void, Never>?
    @ObservationIgnored private var checkInContext: (detection: FallDetection, source: EventSource, easyDetection: Bool)?
    private static let pendingNotificationID = "crewsafety.checkin.no-response"

    init() {
        fixtures = PoseFixture.bundled() + SyntheticPoses.fixtures
        refreshAccess()
        webCamera.onStatus = { [weak self] status in self?.webCameraStatus = status }
        webCamera.onPose = { [weak self] frame, aspect in
            guard let self, self.mode == .webCamera else { return }
            self.handle(frame, aspectRatio: aspect, source: .webCamera)
        }
        webCamera.onTranscript = { [weak self] text in self?.heard(text) }
        webCamera.onAnswer = { [weak self] response in self?.answer(response) }
        webCamera.onCameraChanged = { [weak self] in self?.resetDetector() }
    }

    var isActive: Bool { mode != .idle }

    var statusText: String {
        if checkIn.isAwaiting { return "Possible fall · checking in" }
        if showsDetectionFlash { return "Possible fall detected" }
        switch mode {
        case .idle: return "Idle"
        case .live: return personVisible ? "Monitoring" : "Monitoring · no person in view"
        case .replay(let name): return "Replay · \(name)"
        case .webCamera:
            switch webCameraStatus {
            case .receiving: return personVisible ? "Web camera · monitoring" : "Web camera · no person in view"
            case .failed: return "Web camera · relay not reachable"
            default: return "Web camera · waiting for the camera page"
            }
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
        await preparePermissions()

        resetDetector()
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

    func startReplay(_ fixture: PoseFixture) async {
        await preparePermissions()
        stop()
        resetDetector()
        mode = .replay(name: fixture.displayName)
        latestAspectRatio = fixture.aspectRatio ?? 9.0 / 16.0
        let aspect = latestAspectRatio
        replayTask = Task { [weak self] in
            var previous = fixture.frames.first?.t ?? 0
            for frame in fixture.frames {
                let wait = max(0, frame.t - previous)
                previous = frame.t
                try? await Task.sleep(for: .seconds(wait))
                guard !Task.isCancelled, let self else { return }
                self.handle(frame, aspectRatio: aspect, source: .replay)
            }
            guard !Task.isCancelled, let self else { return }
            self.replayTask = nil
            self.mode = .idle
        }
    }

    /// Resets the detector with the thresholds for the current mode. The iPhone camera and replays
    /// always use the standard thresholds; only the web camera can use the easy testing ones.
    private func resetDetector() {
        detector.config = usesEasyDetection ? .easyTesting : FallDetectorConfig()
        detector.reset()
        thresholds = detector.config
        reading = detector.reading
    }

    // MARK: Web camera

    func startWebCamera() async {
        await preparePermissions()
        stop()
        mode = .webCamera
        resetDetector()  // after setting the mode, so the easy thresholds apply
        webCamera.connect(to: AppConfig.webCameraURL)
    }

    func stop() {
        replayTask?.cancel()
        replayTask = nil
        if mode == .webCamera { webCamera.disconnect() }
        if mode == .live {
            camera.stop()
            camera.onPose = nil
            UIApplication.shared.isIdleTimerDisabled = false
        }
        mode = .idle
        personVisible = false
        latestFrame = nil
        reading = HeuristicFallDetector.Reading()
    }

    // MARK: Detection

    private func handle(_ frame: PoseFrame, aspectRatio: Double, source: EventSource) {
        // Ignore frames that arrive after the mode they belong to has ended.
        switch (mode, source) {
        case (.live, .liveCamera), (.replay, .replay), (.webCamera, .webCamera): break
        default: return
        }
        personVisible = !frame.joints.isEmpty
        latestFrame = frame
        latestAspectRatio = aspectRatio
        // One check-in at a time: detection pauses until the current one is answered or times out.
        guard !checkIn.isAwaiting else { return }
        detector.frameAspectRatio = aspectRatio
        let detection = detector.process(frame)
        reading = detector.reading
        sendReadoutIfDue()
        guard let detection else { return }

        lastDetection = detection
        lastDetectionSource = source
        beginCheckIn(detection: detection, source: source)
    }

    // MARK: Readout

    /// How the bounding box is drawn.
    enum BoxState { case tracking, holding, checkingIn }

    var boxState: BoxState {
        if checkIn.isAwaiting { return .checkingIn }
        return reading.phase == .holding ? .holding : .tracking
    }

    @ObservationIgnored private var lastReadoutSent = Date.distantPast

    /// Mirrors the detector state to the web camera page, at most 5 times a second.
    private func sendReadoutIfDue(force: Bool = false) {
        guard mode == .webCamera, force || Date.now.timeIntervalSince(lastReadoutSent) >= 0.2 else { return }
        lastReadoutSent = .now
        var message: [String: Any] = [
            "type": "readout",
            "phase": String(describing: reading.phase),
            "box": String(describing: boxState),
            "held": reading.held,
            "angleThreshold": thresholds.fallenMinTorsoAngleDeg,
            "dropThreshold": thresholds.minHipDropFraction,
            "holdRequired": thresholds.lowPostureHold,
            "easy": usesEasyDetection,
        ]
        if let value = reading.poseConfidence { message["poseConfidence"] = value }
        if let value = reading.torsoAngleDeg { message["torsoAngle"] = value }
        if let value = reading.hipDrop { message["hipDrop"] = value }
        if let score = lastDetection?.score { message["lastScore"] = score }
        webCamera.send(message)
    }

    // MARK: Check-in

    /// Notification, microphone and speech prompts all happen here, before monitoring starts.
    /// A prompt that appeared during a check-in would cover the answer buttons.
    private func preparePermissions() async {
        await AlertNotifier.shared.requestAuthorization()
        await voice.prepare()
    }

    var checkInRemaining: TimeInterval { checkIn.remaining(at: .now) }

    func respondOK() { answer(.ok) }
    func requestHelp() { answer(.help) }

    private func beginCheckIn(detection: FallDetection, source: EventSource) {
        let now = Date.now
        checkInContext = (detection, source, usesEasyDetection)
        checkIn.start(at: now)
        heardText = nil
        lastOutcome = nil
        isListening = false
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        webCamera.send(["type": "checkin", "state": "awaiting",
                        "deadline": now.addingTimeInterval(Self.checkInDuration).timeIntervalSince1970,
                        "duration": Self.checkInDuration])

        // Scheduled up front so the alert still fires if the app is in the background when time runs out.
        // Cancelled as soon as the person answers.
        AlertNotifier.shared.post(id: Self.pendingNotificationID,
                                  title: "No response after possible fall",
                                  body: notificationBody(source: source),
                                  after: Self.checkInDuration)

        countdownTask?.cancel()
        countdownTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard let self, !Task.isCancelled else { return }
                if let outcome = self.checkIn.tick(now: .now) {
                    self.resolve(outcome, notificationAlreadyScheduled: true)
                    return
                }
            }
        }

        voiceTask?.cancel()
        voiceTask = Task { [weak self] in
            guard let self else { return }
            await self.voice.speak("Possible fall detected. Are you OK? Say I'm okay, or say help.")
            guard !Task.isCancelled, self.checkIn.isAwaiting else { return }
            // Only now may the web page listen, so it never hears the spoken prompt as an answer.
            self.webCamera.send(["type": "checkin", "state": "listening"])
            self.isListening = await self.voice.listen { [weak self] transcript in
                self?.heard(transcript)
            }
        }
    }

    private func heard(_ transcript: String) {
        guard checkIn.isAwaiting else { return }
        heardText = transcript
        webCamera.send(["type": "heard", "text": transcript])
        if let response = FallCheckIn.classify(transcript: transcript) { answer(response) }
    }

    private func answer(_ response: FallCheckIn.Response) {
        guard let outcome = checkIn.respond(response, at: .now) else { return }
        resolve(outcome, notificationAlreadyScheduled: false)
    }

    private func resolve(_ outcome: CheckInOutcome, notificationAlreadyScheduled: Bool) {
        countdownTask?.cancel()
        countdownTask = nil
        voiceTask?.cancel()
        voiceTask = nil
        voice.stop()
        isListening = false
        lastOutcome = outcome
        let context = checkInContext
        checkInContext = nil
        webCamera.send(["type": "checkin", "state": "resolved", "summary": outcome.summary,
                        "escalated": { if case .respondedOK = outcome { return false } else { return true } }()])

        let escalate: Bool
        switch outcome {
        case .respondedOK:
            escalate = false
            AlertNotifier.shared.cancel(id: Self.pendingNotificationID)
        case .requestedHelp:
            escalate = true
            AlertNotifier.shared.cancel(id: Self.pendingNotificationID)
            if let context {
                AlertNotifier.shared.post(title: "Help requested after possible fall",
                                          body: notificationBody(source: context.source, askedForHelp: true))
            }
        case .noResponse:
            escalate = true
            // The scheduled notification fires at the deadline. Post now only if it was not scheduled.
            if !notificationAlreadyScheduled, let context {
                AlertNotifier.shared.post(title: "No response after possible fall",
                                          body: notificationBody(source: context.source))
            }
        }

        if let context, let eventStore, let crewStore {
            eventStore.record(SafetyEvent(crewMemberID: crewStore.monitoredCrewMemberID,
                                          type: .possibleFall,
                                          severity: escalate ? .critical : .info,
                                          source: context.source,
                                          heuristicScore: context.detection.score,
                                          details: context.easyDetection
                                              ? "Easy test detection. " + context.detection.explanation
                                              : context.detection.explanation,
                                          acknowledged: !escalate,
                                          acknowledgedAt: escalate ? nil : .now,
                                          checkIn: outcome))
        }

        sendReadoutIfDue(force: true)
        if escalate {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            showsDetectionFlash = true
            flashTask?.cancel()
            flashTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                self?.showsDetectionFlash = false
            }
        }
        checkIn.reset()
    }

    private func notificationBody(source: EventSource, askedForHelp: Bool = false) -> String {
        let name = crewStore.flatMap { store in
            store.crew.first { $0.id == store.monitoredCrewMemberID }?.displayName
        } ?? "Crew member"
        let suffix = source == .liveCamera ? "" : " (\(source.displayName.lowercased()))"
        let what = askedForHelp ? "asked for help" : "did not answer \"Are you OK?\""
        return "\(name) \(what) after a possible fall\(suffix). Open CrewSafety to check on them."
    }
}
