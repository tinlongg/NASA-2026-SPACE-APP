import SwiftUI

struct SettingsSheet: View {
    @Environment(AppSettings.self) private var settings
    @Environment(DashboardSync.self) private var dashboardSync
    @Environment(AppAccount.self) private var account
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                Section("CrewSafety account") {
                    Text(account.username.map { "@\($0)" } ?? "Not signed in")
                    Text(account.isAdmin ? "Administrator across the app and website" : "Sign in through Mission to use your website account throughout the app.")
                        .font(.footnote)
                }
                Section {
                    DisclosureGroup("Advanced: website address") {
                        TextField("https://your-dashboard.example", text: $settings.dashboardBaseURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .disabled(settings.dashboardSyncEnabled)
                    }
                    SecureField("Website pairing code", text: $settings.dashboardPairingCode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(settings.dashboardSyncEnabled)
                    Toggle("Share with website dashboard", isOn: $settings.dashboardSyncEnabled)
                    Toggle("Include Watch health summary", isOn: $settings.shareHealthSummary)
                    Text(dashboardSync.status).font(.footnote)
                    if let date = dashboardSync.lastSynced {
                        Text("Last synced: \(date.formatted(date: .omitted, time: .standard))").font(.caption)
                    }
                } header: {
                    Text("Website connection")
                } footer: {
                    Text("Open the website, create a pairing session, and enter its code here. The website address is already set; change it under Advanced only to test against another server. Shares crew names, safety events and labeled telemetry while this app is open. Website acknowledgements sync back. Video and journal stay outside this connection. The Watch health summary is off by default: when on, it sends five daily averages (heart rate, resting heart rate, heart rate variability, breathing rate, blood oxygen) with your usual range and the astronaut range, once you have turned on the comparison on the Dashboard. ECG and raw readings are never sent. Pairing is not saved when the app closes.")
                }
                Section {
                    Toggle("Talk with the voice agent", isOn: $settings.voiceAgentEnabled)
                } header: {
                    Text("Voice check-in")
                } footer: {
                    Text("Off by default. When on, the Are you OK? check-in becomes a live conversation with an ElevenLabs voice agent, and your microphone audio is sent to ElevenLabs while the check-in is open. It uses the website address in Advanced. If it cannot connect, the recorded question and on-device listening are used instead.")
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
