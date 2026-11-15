import SwiftUI

struct SettingsSheet: View {
    @Environment(AppSettings.self) private var settings
    @Environment(DashboardSync.self) private var dashboardSync
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                Section {
                    TextField("https://your-dashboard.example", text: $settings.dashboardBaseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(settings.dashboardSyncEnabled)
                    SecureField("Website pairing code", text: $settings.dashboardPairingCode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(settings.dashboardSyncEnabled)
                    Toggle("Share with website dashboard", isOn: $settings.dashboardSyncEnabled)
                    Toggle("Keep screen on while paired", isOn: $settings.keepScreenOnWhilePaired)
                    Text(dashboardSync.status).font(.footnote)
                    if let date = dashboardSync.lastSynced {
                        Text("Last synced: \(date.formatted(date: .omitted, time: .standard))").font(.caption)
                    }
                } header: {
                    Text("Website connection")
                } footer: {
                    Text("Open the website, create a pairing session, and enter its code here. Shares crew names, safety events and labeled telemetry while this app is open. Website acknowledgements sync back. Video and journal stay outside this connection. Pairing is not saved when the app closes. When the website camera sees someone stop moving, this iPhone shows a notification. That only works while this app is open, or for about 30 seconds after you leave it, so turn on Keep screen on and leave the app open on a charger.")
                }
                Section("About") {
                    Text("Prototype for a simulated crew. Not a medical device. Detections mean a crew member stopped moving, not a diagnosis.")
                        .font(.footnote)
                        .foregroundStyle(Theme.secondaryText)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.screenBackground)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
