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
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                        Text("Heart rate").font(.headline)
                        if simulated || samples.isEmpty { SimulatedBadge() }
                        Spacer()
                        if let latest = samples.last {
                            Text(latest.timestamp.missionTimestamp)
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                    if samples.isEmpty {
                        Text("No telemetry available")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        if let latest = samples.last?.heartRateBPM {
                            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.xs) {
                                Text("\(Int(latest.rounded()))")
                                    .font(.system(size: 34, weight: .medium, design: .monospaced))
                                Text("bpm · last 30 min")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        chart(samples)
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

    private func chart(_ samples: [TelemetrySample]) -> some View {
        let start = samples.first?.timestamp ?? .now
        let end = samples.last?.timestamp ?? .now
        return Chart {
            // Typical resting range, drawn as a quiet reference band.
            RectangleMark(xStart: .value("Start", start), xEnd: .value("End", end),
                          yStart: .value("Low", 60), yEnd: .value("High", 90))
                .foregroundStyle(Color.primary.opacity(0.04))
            ForEach(samples) { sample in
                if let bpm = sample.heartRateBPM {
                    AreaMark(x: .value("Time", sample.timestamp), yStart: .value("Base", 50), yEnd: .value("Heart rate", bpm))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.18), Theme.accent.opacity(0)],
                                                        startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("Time", sample.timestamp), y: .value("Heart rate", bpm))
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(Theme.accent)
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .chartYScale(domain: 50...100)
        .chartYAxis {
            AxisMarks(position: .trailing, values: [60, 75, 90]) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [2, 3])).foregroundStyle(Theme.hairline)
                AxisValueLabel().font(.caption2.monospacedDigit()).foregroundStyle(Color.secondary)
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .minute, count: 10)) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(Theme.hairline)
                AxisValueLabel(format: Date.VerbatimFormatStyle(
                    format: "\(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)",
                    timeZone: TimeZone(identifier: "GMT")!, calendar: Calendar(identifier: .gregorian)))
                    .font(.caption2.monospacedDigit()).foregroundStyle(Color.secondary)
            }
        }
        .frame(height: 160)
    }

    private func accessibilityText(_ samples: [TelemetrySample]) -> String {
        guard let latest = samples.last?.heartRateBPM else { return "Simulated heart rate. No data." }
        return "Simulated heart rate, \(Int(latest.rounded())) beats per minute. Generated for demonstration."
    }
}
