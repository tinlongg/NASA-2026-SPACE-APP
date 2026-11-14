import AVFoundation
import Foundation

/// Owns the capture session and turns video frames into `PoseFrame`s at roughly 10 per second.
/// Frames are analysed in memory only. Nothing is written to disk or sent anywhere.
final class CameraService: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()

    /// Called on a background queue with each pose frame and the frame's width/height ratio.
    /// A frame with no joints means no person was found.
    var onPose: ((PoseFrame, Double) -> Void)?

    private let sessionQueue = DispatchQueue(label: "crewsafety.camera.session")
    private let videoQueue = DispatchQueue(label: "crewsafety.camera.video")
    private let estimator = PoseEstimator()
    private let sampleInterval: TimeInterval = 0.1
    private var isConfigured = false

    // Touched only on videoQueue.
    private var firstTimestamp: TimeInterval?
    private var lastSampleTimestamp: TimeInterval = -.infinity

    static var device: AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
    }

    /// Starts the session. `completion` is called on the main queue with false if the camera could not be set up.
    func start(completion: @escaping (Bool) -> Void) {
        sessionQueue.async { [self] in
            if !isConfigured { isConfigured = configure() }
            guard isConfigured else {
                DispatchQueue.main.async { completion(false) }
                return
            }
            videoQueue.sync {
                firstTimestamp = nil
                lastSampleTimestamp = -.infinity
            }
            if !session.isRunning { session.startRunning() }
            DispatchQueue.main.async { completion(true) }
        }
    }

    func stop() {
        sessionQueue.async { [self] in
            if session.isRunning { session.stopRunning() }
        }
    }

    private func configure() -> Bool {
        guard let device = Self.device, let input = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .hd1280x720
        guard session.canAddInput(input) else { return false }
        session.addInput(input)

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: videoQueue)
        guard session.canAddOutput(output) else { return false }
        session.addOutput(output)

        // Deliver upright portrait buffers so Vision and the heuristic see +y as up.
        if let connection = output.connection(with: .video), connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
        return true
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        guard timestamp.isFinite, timestamp - lastSampleTimestamp >= sampleInterval,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastSampleTimestamp = timestamp
        if firstTimestamp == nil { firstTimestamp = timestamp }

        let joints = estimator.joints(in: pixelBuffer)
        let width = Double(CVPixelBufferGetWidth(pixelBuffer))
        let height = Double(CVPixelBufferGetHeight(pixelBuffer))
        let frame = PoseFrame(t: timestamp - (firstTimestamp ?? timestamp), joints: joints)
        onPose?(frame, height > 0 ? width / height : 9.0 / 16.0)
    }
}
