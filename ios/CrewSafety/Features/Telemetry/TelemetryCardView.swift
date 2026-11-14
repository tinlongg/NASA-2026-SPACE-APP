import Charts
import SwiftUI

/// Simulated heart-rate chart. The Simulated badge is part of the header and always visible.
struct TelemetryCardView: View {
    let crewMemberID: UUID
    @Environment(AppServices.self) private var services
    private let window: TimeInterval = 30 * 60

    var body: some View {
        TimelineView(.periodic(from: .now, by: SimulatedTelemetryProvider.step)) { context in
            let samples = services.telemetry.samples(for: crewMemberID, last: window, now: context.date)
            let simulated = samples.contains { $0.source == .simulated }
            Card {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    HStack {
                        Text("Heart rate").font(.headline)
                        if simulated || samples.isEmpty { SimulatedBadge() }
                        Spacer()
                        if let latest = samples.last?.heartRateBPM {
                            Text("\(Int(latest.rounded())) bpm")
                                .font(.title3.weight(.semibold))
                                .monospacedDigit()
                        }
                    }
                    if samples.isEmpty {
                        Text("No telemetry available.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Chart(samples) { sample in
                            if let bpm = sample.heartRateBPM {
                                LineMark(x: .value("Time", sample.timestamp), y: .value("Heart rate", bpm))
                                    .interpolationMethod(.catmullRom)
                                    .foregroundStyle(.pink)
                            }
                        }
                        .chartYScale(domain: 50...100)
                        .chartXAxis { AxisMarks(values: .stride(by: .minute, count: 10)) { _ in
                            AxisGridLine(); AxisValueLabel(format: .dateTime.hour().minute())
                        } }
                        .frame(height: 140)
                        Text("Generated values for demonstration. Not measured from any person.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityText(samples))
        }
    }

    private func accessibilityText(_ samples: [TelemetrySample]) -> String {
        guard let latest = samples.last?.heartRateBPM else { return "Simulated heart rate. No data." }
        return "Simulated heart rate, \(Int(latest.rounded())) beats per minute. Generated for demonstration."
    }
}
