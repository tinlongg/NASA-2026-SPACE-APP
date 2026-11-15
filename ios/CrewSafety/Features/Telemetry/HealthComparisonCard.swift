import HealthKit
import Observation
import SwiftUI

@MainActor @Observable
final class HealthComparisonModel {
    private(set) var snapshot: HealthSnapshot?
    private(set) var comparisons: [MetricComparison] = []
    private(set) var isLoading = false
    @ObservationIgnored private let provider: any HealthReadingsProviding

    init(provider: (any HealthReadingsProviding)? = nil) {
        self.provider = provider ?? (HKHealthStore.isHealthDataAvailable() ? HealthKitReadingsProvider() : SimulatedHealthReadingsProvider())
    }

    func load(now: Date = .now) async {
        guard !isLoading else { return }
        isLoading = true
        let loaded = await provider.load(now: now)
        snapshot = loaded
        comparisons = HealthComparison.compareAll(loaded.readings, now: now)
        isLoading = false
    }
}

/// Dashboard card: each Watch measurement next to the wearer's own usual range and, where a figure
/// has been read from a published source, the ranges reported for adults on Earth and for astronauts in flight.
struct HealthComparisonCard: View {
    /// Health access is asked for only after the wearer taps the button; later launches load by themselves.
    @AppStorage("healthComparisonEnabled") private var enabled = false
    @State private var model = HealthComparisonModel()

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    Text("Watch comparison").font(.headline)
                    if model.snapshot?.simulated == true { SimulatedBadge() }
                    Spacer()
                    if enabled, model.snapshot != nil {
                        Button { Task { await model.load() } } label: { Image(systemName: "arrow.clockwise") }
                            .disabled(model.isLoading)
                            .accessibilityLabel("Refresh readings")
                    }
                }
                if let snapshot = model.snapshot {
                    if snapshot.simulated {
                        Text("No Watch readings were found in Health, or access was not allowed, so these numbers are generated.")
                            .font(.footnote)
                            .foregroundStyle(Theme.secondaryText)
                    }
                    ForEach(model.comparisons) { comparison in
                        MetricRow(comparison: comparison, now: snapshot.loadedAt)
                        Divider()
                    }
                    ECGRow(ecg: snapshot.ecg)
                    Divider()
                    sources
                } else if model.isLoading {
                    ProgressView("Reading Health…").frame(maxWidth: .infinity)
                } else {
                    Text("Compares heart rate, heart rate variability, resting heart rate, breathing rate and blood oxygen with your own last \(HealthComparison.historyWindowDays) days, with published figures for adults on Earth, and with astronaut figures from NASA's Life Sciences Data Archive and a space-station study. It also shows your latest ECG recording.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.secondaryText)
                    Button {
                        enabled = true
                        Task { await model.load() }
                    } label: {
                        Text("Compare my Watch readings").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
                Text("A description of numbers, not a health assessment. Readings stay on this iPhone unless you turn on the Watch health summary in Settings, and they never decide an alert.")
                    .font(.footnote)
                    .foregroundStyle(Theme.secondaryText)
            }
        }
        .task { if enabled, model.snapshot == nil { await model.load() } }
    }

    private var sources: some View {
        let missing = HealthMetric.allCases.filter { HealthComparison.reference(for: $0) == nil }.map { $0.title.lowercased() }
        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            sourceList("Figures for adults on Earth", HealthComparison.everydayReferences)
            Text("These studies are large, but most used other devices and age groups than yours.")
                .font(.caption)
                .foregroundStyle(Theme.secondaryText)
            sourceList("Astronaut figures", HealthComparison.spaceflightReferences).padding(.top, Theme.Spacing.s)
            Text("These are small groups (6 to 10 astronauts).\(missing.isEmpty ? "" : " No astronaut figure has been found for \(missing.joined(separator: ", ")).")")
                .font(.caption)
                .foregroundStyle(Theme.secondaryText)
            Text("None of these figures has yet been checked by a second person.")
                .font(.caption)
                .foregroundStyle(Theme.secondaryText)
                .padding(.top, Theme.Spacing.s)
        }
    }

    private func sourceList(_ title: String, _ references: [PublishedReference]) -> some View {
        var used: [ReferenceSource] = []
        for reference in references where !used.contains(reference.source) { used.append(reference.source) }
        return VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(title).font(.caption.weight(.semibold))
            ForEach(used, id: \.id) { source in
                Text(source.citation).font(.caption).foregroundStyle(Theme.secondaryText)
                Link("Open the source (\(source.licence))", destination: source.url).font(.caption)
            }
        }
    }
}

private struct MetricRow: View {
    let comparison: MetricComparison
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(comparison.metric.title).font(.subheadline.weight(.medium))
                Spacer(minLength: Theme.Spacing.s)
                if let value = comparison.value {
                    Text(comparison.metric.format(value)).font(.body.weight(.medium).monospacedDigit())
                } else {
                    Text("No reading").font(.subheadline).foregroundStyle(Theme.secondaryText)
                }
            }
            if let day = comparison.day {
                Text("\(comparison.metric.note), \(HealthComparison.dayLabel(day, now: now))")
                    .font(.caption)
                    .foregroundStyle(Theme.tertiaryText)
            }
            line(symbol: symbol(comparison.baselineStanding), text: comparison.baselineSentence)
            if comparison.value != nil {
                published(comparison.everyday, standing: comparison.everydayStanding, sentence: comparison.everydaySentence)
                published(comparison.reference, standing: comparison.referenceStanding, sentence: comparison.referenceSentence)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// One published figure: the comparison sentence, then how it was measured and why it differs from the Watch.
    @ViewBuilder
    private func published(_ reference: PublishedReference?, standing: Standing?, sentence: String) -> some View {
        line(symbol: symbol(standing), text: sentence)
        if let reference {
            Text("\(reference.setting). \(reference.caveat)")
                .font(.caption)
                .foregroundStyle(Theme.tertiaryText)
                .padding(.leading, 24)
        }
    }

    /// Direction only. No colour coding: above or below is not labelled good or bad.
    private func symbol(_ standing: Standing?) -> String {
        switch standing {
        case .below: "arrow.down"
        case .above: "arrow.up"
        case .within: "equal"
        case nil: "minus"
        }
    }

    private func line(symbol: String, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Image(systemName: symbol).font(.caption.weight(.semibold)).frame(width: 16).accessibilityHidden(true)
            Text(text).font(.footnote)
        }
        .foregroundStyle(Theme.secondaryText)
    }
}

private struct ECGRow: View {
    let ecg: ECGSummary?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text("Latest ECG recording").font(.subheadline.weight(.medium))
                Spacer(minLength: Theme.Spacing.s)
                Text(ecg?.label ?? "None found").font(ecg == nil ? .subheadline : .body.weight(.medium))
                    .foregroundStyle(ecg == nil ? Theme.secondaryText : Theme.primaryText)
            }
            if let ecg {
                Text("\(ecg.recordedAt.formatted(date: .abbreviated, time: .shortened))\(ecg.averageHeartRate.map { " · average \(Int($0.rounded())) bpm" } ?? "")")
                    .font(.caption)
                    .foregroundStyle(Theme.tertiaryText)
            }
            Text("Apple Watch does not stream ECG. This is Apple's own label for the last 30-second recording taken in the ECG app; it is a label, not a level, so there is nothing to rank against other people.")
                .font(.footnote)
                .foregroundStyle(Theme.secondaryText)
        }
        .accessibilityElement(children: .combine)
    }
}
