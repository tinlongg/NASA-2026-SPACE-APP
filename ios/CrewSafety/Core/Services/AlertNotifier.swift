import UserNotifications

/// Posts local notifications for alerts that need a person's attention, such as no answer after a possible fall.
/// Notifications also show while the app is open, so the alert is never silent.
final class AlertNotifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = AlertNotifier()

    /// Call once at launch so notifications show in the foreground too.
    func install() {
        UNUserNotificationCenter.current().delegate = self
    }

    /// Asks for permission the first time. Later calls return the stored answer without a prompt.
    @discardableResult
    func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Posts now, or after `delay` seconds. Reusing an `id` replaces the pending notification.
    func post(id: String = UUID().uuidString, title: String, body: String, after delay: TimeInterval? = nil) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .defaultCritical
        content.interruptionLevel = .timeSensitive
        let trigger = delay.map { UNTimeIntervalNotificationTrigger(timeInterval: max(1, $0), repeats: false) }
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request)
    }

    func cancel(id: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
        async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}
