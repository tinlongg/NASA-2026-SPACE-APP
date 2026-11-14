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
                    controls
                    if let message = model.cameraError {
                        Text(message).font(.footnote).foregroundStyle(.red)
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

    private var viewport: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Theme.cornerRadius).fill(Color.black)
            switch model.mode {
            case .live:
                CameraPreviewView(session: model.camera.session)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
            case .replay:
                PoseCanvas(frame: model.replayFrame, aspectRatio: model.replayAspectRatio)
                    .padding(Theme.Spacing.s)
            case .idle:
                idlePlaceholder
            }
            if case .replay = model.mode {
                VStack {
                    HStack {
                        SimulatedBadge(text: "Replay")
                        Spacer()
                    }
                    Spacer()
                }
                .padding(Theme.Spacing.m)
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

    private var statusRow: some View {
        let alerting = model.showsDetectionFlash
        return HStack(spacing: Theme.Spacing.s) {
            Circle()
                .fill(alerting ? Color.red : (model.isActive ? Color.green : Color.secondary))
                .frame(width: 10, height: 10)
            Text(model.statusText)
                .font(.headline)
                .foregroundStyle(alerting ? Color.red : Color.primary)
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
                    ForEach(model.fixtures) { fixture in
                        Button(fixture.displayName) { model.startReplay(fixture) }
                    }
                } label: {
                    Label("Replay", systemImage: "play.rectangle").frame(maxWidth: .infinity)
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
                Text("An alert was recorded. Review and acknowledge it in the Alerts tab.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
