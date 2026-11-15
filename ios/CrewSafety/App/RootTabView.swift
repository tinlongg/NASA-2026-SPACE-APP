import SwiftUI

struct RootTabView: View {
    @Environment(EventStore.self) private var eventStore
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var account = AppAccount()

    var body: some View {
        VStack(spacing: 0) {
            // The banner sits above the tab view so it never covers a screen's navigation bar.
            AlertBannerView()
            if account.isAdmin, let username = account.username {
                Text("@\(username) · Administrator")
                    .font(.caption).frame(maxWidth: .infinity).padding(6)
                    .background(.thinMaterial)
            }
            tabs
        }
        .environment(account)
        .task(id: "\(settings.dashboardBaseURL)|\(scenePhase == .active)") {
            if scenePhase == .active { await account.track(baseURL: settings.dashboardBaseURL) }
        }
    }

    private var tabs: some View {
        TabView {
            MissionView()
                .tabItem { Label("Mission", systemImage: "sparkles") }
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "person.3.fill") }
            CameraMonitorView()
                .tabItem { Label("Monitor", systemImage: "video.fill") }
            AlertsView()
                .tabItem { Label("Alerts", systemImage: "bell.fill") }
                .badge(eventStore.activeAlerts.count)
            WellnessJournalView()
                .tabItem { Label("Journal", systemImage: "book.closed.fill") }
        }
    }
}
