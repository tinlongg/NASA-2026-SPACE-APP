import SwiftUI

struct RootTabView: View {
    @Environment(EventStore.self) private var eventStore

    var body: some View {
        VStack(spacing: 0) {
            // The banner sits above the tab view so it never covers a screen's navigation bar.
            AlertBannerView()
            tabs
        }
    }

    private var tabs: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "person.3.fill") }
            CameraMonitorView()
                .tabItem { Label("Monitor", systemImage: "video.fill") }
            AlertsView()
                .tabItem { Label("Alerts", systemImage: "bell.fill") }
                .badge(eventStore.activeAlerts.count)
            MuseChatView()
                .tabItem { Label("MUSE", systemImage: "bubble.left.and.text.bubble.right.fill") }
            WellnessJournalView()
                .tabItem { Label("Journal", systemImage: "book.closed.fill") }
        }
    }
}
