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
        let settings = AppSettings(museMode: .demo, museBaseURL: AppConfig.museBaseURL)
        _eventStore = State(initialValue: EventStore(events: SampleData.events))
        _crewStore = State(initialValue: CrewStore(crew: SampleData.crew,
                                                   monitoredCrewMemberID: SampleData.monitoredID))
        _settings = State(initialValue: settings)
        _services = State(initialValue: ServiceFactory.makeServices(settings: settings))
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(eventStore)
                .environment(crewStore)
                .environment(settings)
                .environment(services)
                .environment(dashboardSync)
                .task(id: "\(settings.dashboardSyncKey)|\(scenePhase == .active)") {
                    if scenePhase == .active {
                        await dashboardSync.run(settings: settings, crew: crewStore, events: eventStore, services: services)
                    } else {
                        dashboardSync.status = "Paused while app is in the background"
                    }
                }
                .onChange(of: settings.museMode) { rebuildMuse() }
                .onChange(of: settings.museBaseURL) { rebuildMuse() }
        }
    }

    private func rebuildMuse() {
        services.muse = ServiceFactory.makeMuse(settings: settings)
    }
}
