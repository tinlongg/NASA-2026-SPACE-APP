import SwiftUI

/// Stub created by Developer 1 so the app compiles. Developer 5 replaces this file
/// with the real banner (event details, acknowledge button, haptic).
struct AlertBannerView: View {
    @Environment(EventStore.self) private var eventStore

    var body: some View {
        let count = eventStore.activeAlerts.count
        if count > 0 {
            Text(count == 1 ? "1 unacknowledged alert" : "\(count) unacknowledged alerts")
                .font(.footnote.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.s)
                .foregroundStyle(.white)
                .background(Color.red)
        }
    }
}
