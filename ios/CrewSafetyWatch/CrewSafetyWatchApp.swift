import SwiftUI
import HealthKit
import WatchKit

/// Lets the iPhone start monitoring: HKHealthStore.startWatchApp opens this app with a workout configuration.
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in await MonitorSession.shared.start() }
    }
}

@main
struct CrewSafetyWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environment(MonitorSession.shared)
                .environment(PhoneLink.shared)
        }
    }
}
