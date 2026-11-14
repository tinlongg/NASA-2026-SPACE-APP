import SwiftUI

struct SettingsSheet: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State private var urlText = ""
    @State private var urlIsInvalid = false

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
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
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("Backend address")
                } footer: {
                    Text("Only the question you type is sent. Camera video and journal entries stay on this device.")
                }

                Section("About") {
                    Text("Prototype for a simulated crew. Not a medical device. Detections are possible falls, not diagnoses.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
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
