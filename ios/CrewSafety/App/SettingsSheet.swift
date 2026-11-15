import SwiftUI

struct SettingsSheet: View {
    @Environment(AppSettings.self) private var settings
    @Environment(DashboardSync.self) private var dashboardSync
    @Environment(AppAccount.self) private var account
    @Environment(\.dismiss) private var dismiss
    @State private var aboutTapCount = 0
    @State private var isShowingBiodome = false

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
                    Toggle("Keep screen on while paired", isOn: $settings.keepScreenOnWhilePaired)
                    Text(dashboardSync.status).font(.footnote)
                    if let date = dashboardSync.lastSynced {
                        Text("Last synced: \(date.formatted(date: .omitted, time: .standard))").font(.caption)
                    }
                } header: {
                    Text("Website connection")
                } footer: {
                    Text("Open the website, create a pairing session, and enter its code here. The website address is already set; change it under Advanced only to test against another server. Shares crew names, safety events and labeled telemetry while this app is open. Website acknowledgements sync back. Video and journal stay outside this connection. The Watch health summary is off by default: when on, it sends five daily averages (heart rate, resting heart rate, heart rate variability, breathing rate, blood oxygen) with your usual range and the astronaut range, once you have turned on the comparison on the Dashboard. ECG and raw readings are never sent. Pairing is not saved when the app closes. When the website camera sees someone stop moving, this iPhone shows a notification. That only works while this app is open, or for about 30 seconds after you leave it, so turn on Keep screen on and leave the app open on a charger.")
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
                        .contentShape(Rectangle())
                        .onTapGesture(perform: tapAbout)
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
        .sheet(isPresented: $isShowingBiodome) {
            OrbitalBiodomeView(url: MissionWebURL.make(from: settings.dashboardBaseURL))
        }
    }

    /// A small hidden doorway: five taps on the About copy open Pip's habitat.
    private func tapAbout() {
        aboutTapCount += 1
        guard aboutTapCount >= 5 else { return }
        aboutTapCount = 0
        isShowingBiodome = true
    }
}

/// The existing website mission/habitat page, presented from the About easter egg.
struct OrbitalBiodomeView: View {
    let url: URL?
    @Environment(\.dismiss) private var dismiss
    @State private var loading = true
    @State private var failure: String?
    @State private var attempt = UUID()

    var body: some View {
        NavigationStack {
            Group {
                if let url {
                    ZStack {
                        MissionBrowser(url: url, loading: $loading, failure: $failure)
                            .id(attempt)
                        if loading {
                            ProgressView("Opening the biodome…")
                                .padding()
                                .background(.regularMaterial)
                        }
                        if let failure {
                            VStack(spacing: 12) {
                                Text(failure)
                                Button("Try again") {
                                    self.failure = nil
                                    loading = true
                                    attempt = UUID()
                                }
                            }
                            .padding()
                            .background(.regularMaterial)
                        }
                    }
                } else {
                    ContentUnavailableView("Biodome unavailable", systemImage: "network",
                                           description: Text("Set an HTTPS dashboard address in Settings to visit Pip's habitat."))
                }
            }
            .navigationTitle("Orbital Biodome")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

/// Adds the same Settings entry point to every top-level screen.
/// Settings stays a sheet so it does not take a sixth tab from the core workflow.
struct SettingsToolbar: ViewModifier {
    @State private var isShowingSettings = false

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isShowingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Settings")
                }
            }
            .sheet(isPresented: $isShowingSettings) {
                SettingsSheet()
            }
    }
}

extension View {
    func settingsToolbar() -> some View {
        modifier(SettingsToolbar())
    }
}
