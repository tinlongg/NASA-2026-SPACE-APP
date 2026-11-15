import SwiftUI

@main
struct CrewSafetyApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var dashboardSync = DashboardSync()
    @State private var eventStore: EventStore
    @State private var crewStore: CrewStore
    @State private var settings: AppSettings
    @State private var services: AppServices

    init() {
        let settings = AppSettings()
        _eventStore = State(initialValue: EventStore(events: SampleData.events))
        _crewStore = State(initialValue: CrewStore(crew: SampleData.crew,
                                                   monitoredCrewMemberID: SampleData.monitoredID))
        _settings = State(initialValue: settings)
        _services = State(initialValue: ServiceFactory.makeServices(settings: settings))
        AlertNotifier.shared.install()
        WatchLink.shared.activate()
        Self.applyAppearance()
    }

    /// Graphite bars to match the website: flat surfaces, a hairline, green selection.
    private static func applyAppearance() {
        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = Brand.surface
        tab.shadowColor = Brand.line
        for item in [tab.stackedLayoutAppearance, tab.inlineLayoutAppearance, tab.compactInlineLayoutAppearance] {
            item.selected.iconColor = Brand.accent
            item.selected.titleTextAttributes = [.foregroundColor: Brand.accent]
            item.normal.iconColor = Brand.text3
            item.normal.titleTextAttributes = [.foregroundColor: Brand.text3]
        }
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .environment(eventStore)
                .environment(crewStore)
                .environment(settings)
                .environment(services)
                .environment(dashboardSync)
                .task(id: "\(settings.dashboardSyncKey)|\(scenePhase == .background)") {
                    if scenePhase != .background {
                        await dashboardSync.run(settings: settings, crew: crewStore, events: eventStore, services: services)
                    } else {
                        await syncBriefly()
                    }
                }
                .onChange(of: settings.dashboardSyncEnabled && settings.keepScreenOnWhilePaired, initial: true) { _, keepAwake in
                    UIApplication.shared.isIdleTimerDisabled = keepAwake
                }
        }
    }

    /// iOS gives a backgrounded app about 30 seconds. Keep syncing for most of that, so an alert raised
    /// just after the phone is locked still arrives, then pause until the app is opened again.
    @MainActor
    private func syncBriefly() async {
        let taskID = UIApplication.shared.beginBackgroundTask(withName: "Website alerts")
        defer { if taskID != .invalid { UIApplication.shared.endBackgroundTask(taskID) } }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await dashboardSync.run(settings: settings, crew: crewStore, events: eventStore, services: services) }
            group.addTask { try? await Task.sleep(for: .seconds(25)) }
            await group.next()
            group.cancelAll()
        }
        if settings.dashboardSyncEnabled { dashboardSync.status = "Paused in the background. Open the app to get alerts." }
    }
}
