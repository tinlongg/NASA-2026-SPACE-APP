import Foundation
import HealthKit
import CoreMotion
import Observation

/// Runs while monitoring: a workout session (so heart rate arrives every few seconds and the app keeps
/// running with the screen off) and device motion at 50 Hz for wrist movement. The workout is discarded
/// at the end, so nothing is added to the wearer's activity history.
@MainActor @Observable
final class MonitorSession: NSObject {
    static let shared = MonitorSession()

    private(set) var isMonitoring = false
    private(set) var heartRate: Double?
    private(set) var heartRateAt: Date?
    private(set) var movedAt: Date?
    private(set) var activityLevel = 0.0
    private(set) var status = "Not monitoring"

    @ObservationIgnored private let store = HKHealthStore()
    @ObservationIgnored private var session: HKWorkoutSession?
    @ObservationIgnored private var builder: HKLiveWorkoutBuilder?
    @ObservationIgnored private let motion = CMMotionManager()
    @ObservationIgnored private var wrist = WristMotion()
    @ObservationIgnored private var lastMovementSent = Date.distantPast
    @ObservationIgnored private var heartbeat: Task<Void, Never>?

    func start() async {
        guard !isMonitoring, session == nil else { return }
        guard HKHealthStore.isHealthDataAvailable() else { status = "Health data is not available"; return }
        status = "Starting…"
        do {
            try await store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [HKQuantityType(.heartRate)])
            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .other
            configuration.locationType = .indoor
            let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder
            let now = Date()
            session.startActivity(with: now)
            try await builder.beginCollection(at: now)
            isMonitoring = true
            status = "Monitoring"
            startMotion()
            startHeartbeat()
            PhoneLink.shared.sendReading()
        } catch {
            status = "Could not start: \(error.localizedDescription)"
            session = nil
            builder = nil
        }
    }

    func stop() async {
        motion.stopDeviceMotionUpdates()
        heartbeat?.cancel()
        heartbeat = nil
        wrist.reset()
        if let session, let builder {
            session.end()
            try? await builder.endCollection(at: .now)
            builder.discardWorkout()
        }
        session = nil
        builder = nil
        isMonitoring = false
        status = "Not monitoring"
        PhoneLink.shared.sendReading()
    }

    private func startMotion() {
        guard motion.isDeviceMotionAvailable else { status = "Monitoring · motion sensor unavailable"; return }
        motion.deviceMotionUpdateInterval = 1.0 / 50
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let data else { return }
            MainActor.assumeIsolated { self?.ingest(data) }
        }
    }

    private func ingest(_ data: CMDeviceMotion) {
        let a = data.userAcceleration, r = data.rotationRate
        guard let window = wrist.add(time: data.timestamp, acceleration: SIMD3(a.x, a.y, a.z), rotation: SIMD3(r.x, r.y, r.z)) else { return }
        activityLevel = window.activityLevel
        guard window.moved else { return }
        movedAt = .now
        // Send at most once a second; the heartbeat covers the rest.
        if Date().timeIntervalSince(lastMovementSent) >= 1 {
            lastMovementSent = .now
            PhoneLink.shared.sendReading()
        }
    }

    /// Keeps the website's "streaming" status alive even when nothing changes.
    private func startHeartbeat() {
        heartbeat?.cancel()
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled, let self, self.isMonitoring else { return }
                PhoneLink.shared.sendReading()
            }
        }
    }

    fileprivate func received(heartRate bpm: Double) {
        heartRate = bpm
        heartRateAt = .now
        PhoneLink.shared.sendReading()
    }

    fileprivate func failed(_ message: String) {
        status = "Stopped: \(message)"
        Task { await stop() }
    }
}

extension MonitorSession: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let type = HKQuantityType(.heartRate)
        guard collectedTypes.contains(type), let quantity = workoutBuilder.statistics(for: type)?.mostRecentQuantity() else { return }
        let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        Task { @MainActor in MonitorSession.shared.received(heartRate: bpm) }
    }
}

extension MonitorSession: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        let message = error.localizedDescription
        Task { @MainActor in MonitorSession.shared.failed(message) }
    }
}
