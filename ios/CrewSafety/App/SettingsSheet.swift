import SwiftUI

struct SettingsSheet: View {
    @Environment(AppSettings.self) private var settings
    @Environment(DashboardSync.self) private var dashboardSync
    @Environment(\.dismiss) private var dismiss
    @State private var urlText = ""
    @State private var urlIsInvalid = false

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
                    Text(dashboardSync.status).font(.footnote)
                    if let date = dashboardSync.lastSynced {
                        Text("Last synced: \(date.formatted(date: .omitted, time: .standard))").font(.caption)
                    }
                } header: {
                    Text("Website connection")
                } footer: {
                    Text("Open the website, create a pairing session, and enter its code here. Shares crew names, safety events and labeled telemetry while this app is open. Website acknowledgements sync back. Video, journal and chat stay outside this connection. Pairing is not saved when the app closes.")
                }
                Section {
                    Picker("MUSE mode", selection: $settings.museMode) {
                        Text("Demo").tag(MuseMode.demo)
                        Text("Live").tag(MuseMode.live)
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("MUSE assistant")
                } footer: {
                    Text("Demo uses precomputed answers bundled with the app and labels them. Live sends your question to the backend below.")
                }

                Section {
                    TextField("http://192.168.1.20:8000", text: $urlText)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(applyURL)
                    if urlIsInvalid {
                        Text("Enter a full http or https address.")
                            .font(.footnote)
                            .foregroundStyle(Theme.critical)
                    }
                } header: {
                    Text("Backend address")
                } footer: {
                    Text("MUSE sends only the question you type. Website sharing above is controlled separately. Camera video and journal entries stay on this device.")
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
                    Button("Done") {
                        applyURL()
                        if !urlIsInvalid { dismiss() }
                    }
                }
            }
            .onAppear { urlText = settings.museBaseURL?.absoluteString ?? "" }
        }
    }

    private func applyURL() {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            urlIsInvalid = false
            settings.museBaseURL = nil
            return
        }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https", url.host != nil else {
            urlIsInvalid = true
            return
        }
        urlIsInvalid = false
        settings.museBaseURL = url
    }
}
