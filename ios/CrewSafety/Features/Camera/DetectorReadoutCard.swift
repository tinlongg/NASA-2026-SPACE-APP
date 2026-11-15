import SwiftUI

/// Live view of what the possible-fall detector sees: each rule's value against the threshold it must cross.
/// Pose confidence comes from the pose model; the heuristic score is not a probability and is labelled so.
struct DetectorReadoutCard: View {
    let model: CameraMonitorViewModel

    var body: some View {
        let reading = model.reading
        let t = model.thresholds
        Card {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Detector").font(.headline)
                    Spacer()
                    Text(phaseText(reading.phase))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(phaseColor(reading.phase))
                }
                meter("Pose confidence",
                      value: reading.poseConfidence, limit: 1,
                      text: reading.poseConfidence.map { "\(percent($0))" } ?? "–",
                      met: false, neutral: true)
                meter("Torso angle",
                      value: reading.torsoAngleDeg, limit: t.fallenMinTorsoAngleDeg,
                      text: "\(reading.torsoAngleDeg.map { "\(Int($0.rounded()))°" } ?? "–") of \(Int(t.fallenMinTorsoAngleDeg))°",
                      met: (reading.torsoAngleDeg ?? 0) >= t.fallenMinTorsoAngleDeg)
                meter("Hip drop",
                      value: reading.hipDrop, limit: t.minHipDropFraction,
                      text: "\(reading.hipDrop.map(percent) ?? "–") of \(percent(t.minHipDropFraction))",
                      met: (reading.hipDrop ?? 0) >= t.minHipDropFraction)
                meter("Held low",
                      value: reading.held, limit: t.lowPostureHold,
                      text: String(format: "%.1f of %.1f s", reading.held, t.lowPostureHold),
                      met: reading.held >= t.lowPostureHold)
                if let score = model.lastDetection?.score {
                    Text("Last heuristic score \(percent(score)) · not a probability")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(Theme.secondaryText)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func meter(_ label: String, value: Double?, limit: Double, text: String,
                       met: Bool, neutral: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(label).font(.subheadline)
                Spacer()
                Text(text)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(met ? Theme.attention : .secondary)
            }
            GeometryReader { geo in
                let fraction = min(1, max(0, (value ?? 0) / max(limit, 0.0001)))
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.primary.opacity(0.08))
                    Capsule()
                        .fill(neutral ? Theme.accent : (met ? Theme.attention : Theme.accent.opacity(0.7)))
                        .frame(width: geo.size.width * fraction)
                }
            }
            .frame(height: 6)
            .animation(.easeOut(duration: 0.15), value: value)
        }
    }

    private func percent(_ value: Double) -> String { "\(Int((value * 100).rounded()))%" }

    private func phaseText(_ phase: HeuristicFallDetector.Reading.Phase) -> String {
        if model.checkIn.isAwaiting { return "Checking in" }
        switch phase {
        case .noPerson: return "No person"
        case .upright: return "Upright"
        case .tilted: return "Leaning"
        case .holding: return "Low, holding"
        case .cooldown: return "Just detected"
        }
    }

    private func phaseColor(_ phase: HeuristicFallDetector.Reading.Phase) -> Color {
        if model.checkIn.isAwaiting { return Theme.alert }
        switch phase {
        case .holding: return Theme.attention
        case .cooldown: return Theme.alert
        default: return .secondary
        }
    }
}
