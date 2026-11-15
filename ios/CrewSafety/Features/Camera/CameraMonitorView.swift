import SwiftUI
import UIKit

struct CameraMonitorView: View {
    @Environment(EventStore.self) private var eventStore
    @Environment(CrewStore.self) private var crewStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var model = CameraMonitorViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    viewport
                    statusRow
                    if model.isActive { DetectorReadoutCard(model: model) }
                    if model.mode == .webCamera { easyDetectionToggle }
                    controls
                    if let message = model.cameraError {
                        Text(message).font(.footnote).foregroundStyle(Theme.alert)
                    }
                    if let detection = model.lastDetection {
                        detectionCard(detection)
                    }
                    Text("Possible-fall detection is a heuristic and will make mistakes. It is not a diagnosis. Video is analysed on this device and is not stored or sent.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(Theme.Spacing.l)
            }
            .background(Theme.screenBackground)
            .navigationTitle("Monitor")
        }
        .fullScreenCover(isPresented: Binding(get: { model.checkIn.isAwaiting }, set: { _ in })) {
            CheckInView(model: model)
        }
        .onAppear {
            model.attach(eventStore: eventStore, crewStore: crewStore)
            model.refreshAccess()
        }
        .onDisappear { model.stop() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { model.stop() }
        }
    }

    // MARK: Pieces

    private var boxColor: Color {
        switch model.boxState {
        case .tracking: Theme.accent
        case .holding: Theme.attention
        case .checkingIn: Theme.alert
        }
    }

    private var viewport: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Theme.cornerRadius).fill(Color.black)
            switch model.mode {
            case .live:
                ZStack {
                    CameraPreviewView(session: model.camera.session)
                    AspectFillPoseOverlay(frame: model.latestFrame, aspectRatio: model.latestAspectRatio,
                                          boxColor: boxColor, mirrored: CameraService.device?.position == .front)
                }
                .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
            case .replay:
                PoseCanvas(frame: model.latestFrame, aspectRatio: model.latestAspectRatio, boxColor: boxColor)
                    .padding(Theme.Spacing.s)
            case .webCamera:
                if model.webCameraStatus == .receiving {
                    PoseCanvas(frame: model.latestFrame, aspectRatio: model.latestAspectRatio, boxColor: boxColor)
                        .padding(Theme.Spacing.s)
                } else {
                    webCameraPlaceholder
                }
            case .idle:
                idlePlaceholder
            }
            if model.mode != .live && model.mode != .idle {
                VStack {
                    HStack {
                        SimulatedBadge(text: model.mode == .webCamera ? "Web camera" : "Replay")
                        Spacer()
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.m)
                // The viewport is always black, so the badge uses its dark-mode colors.
                .environment(\.colorScheme, .dark)
            }
        }
        .frame(height: 380)
    }

    @ViewBuilder private var idlePlaceholder: some View {
        switch model.access {
        case .denied:
            VStack(spacing: Theme.Spacing.m) {
                EmptyStateView(title: "Camera access is off", systemImage: "video.slash",
                               message: "Allow camera access in Settings to monitor live. Replay still works.")
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .buttonStyle(.borderedProminent)
            }
            .foregroundStyle(.white)
        case .unavailable:
            EmptyStateView(title: "No camera on this device", systemImage: "video.slash",
                           message: "Live monitoring needs an iPhone camera. Use Replay to run a pose sequence through the detector.")
                .foregroundStyle(.white)
        case .unknown, .authorized:
            EmptyStateView(title: "Not monitoring", systemImage: "video",
                           message: "Place the phone upright on a stand with the whole body in view, then start monitoring.")
                .foregroundStyle(.white)
        }
    }

    private var webCameraPlaceholder: some View {
        let failed: Bool = { if case .failed = model.webCameraStatus { return true } else { return false } }()
        return EmptyStateView(
            title: failed ? "Relay not reachable" : "Waiting for the web camera",
            systemImage: "web.camera",
            message: failed
                ? "On the Mac, run node webcam/server.js, then choose Web camera again."
                : "On the Mac, open http://localhost:8765 and start the camera. Stand back so your whole body is in view.")
            .foregroundStyle(.white)
    }

    private var easyDetectionToggle: some View {
        @Bindable var model = model
        return Card {
            Toggle(isOn: $model.easyTestDetection) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text("Easy test detection").font(.headline)
                    Text(model.easyTestDetection
                         ? "Bend your knees a little, lean far to one side and hold for a second. Testing only."
                         : "Standard thresholds, the same as the iPhone camera. A real, fast fall is needed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(Theme.accent)
        }
    }

    private var statusRow: some View {
        let alerting = model.showsDetectionFlash
        return HStack(spacing: Theme.Spacing.s) {
            Circle()
                .fill(alerting ? Theme.alert : (model.isActive ? Theme.nominal : Color.secondary))
                .frame(width: 10, height: 10)
            Text(model.statusText)
                .font(.headline)
                .foregroundStyle(alerting ? Theme.alert : Color.primary)
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Monitoring status: \(model.statusText)")
    }

    private var controls: some View {
        HStack(spacing: Theme.Spacing.m) {
            if model.isActive {
                Button(role: .destructive) {
                    model.stop()
                } label: {
                    Label("Stop", systemImage: "stop.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            } else {
                Button {
                    Task { await model.startLive() }
                } label: {
                    Label("Start monitoring", systemImage: "video.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.access == .unavailable || model.access == .denied)

                Menu {
                    Button {
                        Task { await model.startWebCamera() }
                    } label: {
                        Label("Web camera on this Mac", systemImage: "web.camera")
                    }
                    Section("Replay a recording") {
                        ForEach(model.fixtures) { fixture in
                            Button(fixture.displayName) { Task { await model.startReplay(fixture) } }
                        }
                    }
                } label: {
                    Label("Test", systemImage: "play.rectangle").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
        .controlSize(.large)
    }

    private func detectionCard(_ detection: FallDetection) -> some View {
        Card {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack {
                    Text("Last possible fall").font(.headline)
                    if let source = model.lastDetectionSource, source != .liveCamera {
                        SimulatedBadge(text: source.displayName)
                    }
                }
                Text(detection.explanation).font(.subheadline)
                Text("Heuristic score \(Int((detection.score * 100).rounded()))% · not a probability")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let outcome = model.lastOutcome {
                    Text(outcome.summary)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(outcomeColor(outcome))
                    Text(outcomeNote(outcome))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func outcomeColor(_ outcome: CheckInOutcome) -> Color {
        if case .respondedOK = outcome { return Theme.nominal }
        return Theme.alert
    }

    private func outcomeNote(_ outcome: CheckInOutcome) -> String {
        switch outcome {
        case .respondedOK: "Logged in Alerts history. No alert was raised."
        case .requestedHelp, .noResponse: "A critical alert was raised. Review and acknowledge it in the Alerts tab."
        }
    }
}
