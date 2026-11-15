import SwiftUI

/// Live view of what the no-movement detector sees: each value against the threshold it works with.
/// Pose confidence comes from the pose model; the other values come from the heuristic.
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
                      text: reading.poseConfidence.map { "\(Int(($0 * 100).rounded()))%" } ?? "–",
                      met: false, neutral: true)
                meter("Movement",
                      value: reading.motion, limit: t.moveThreshold,
                      text: "\(reading.motion.map { String(format: "%.2f", $0) } ?? "–") of \(String(format: "%.2f", t.moveThreshold))",
                      met: false, neutral: true)
                meter("Still for",
                      value: reading.stillFor, limit: t.stillDuration,
                      text: String(format: "%.0f of %.0f s", reading.stillFor, t.stillDuration),
                      met: reading.stillFor >= t.stillDuration)
                Text("Movement is the largest joint shift since the last motion, in torso lengths. Drifting does not count.")
                    .font(.caption)
                    .foregroundStyle(Theme.secondaryText)
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

    private func phaseText(_ phase: InactivityDetector.Reading.Phase) -> String {
        if model.checkIn.isAwaiting { return "Checking in" }
        switch phase {
        case .noPerson: return "No person"
        case .moving: return "Moving"
        case .still: return "Holding still"
        case .alerted: return "Alerted · waiting for movement"
        }
    }

    private func phaseColor(_ phase: InactivityDetector.Reading.Phase) -> Color {
        if model.checkIn.isAwaiting { return Theme.alert }
        switch phase {
        case .still: return Theme.attention
        case .alerted: return Theme.alert
        default: return .secondary
        }
    }
}
