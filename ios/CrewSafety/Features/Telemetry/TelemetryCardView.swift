import SwiftUI

/// Stub created by Developer 1 so the app compiles. Developer 5 replaces this file
/// with the Swift Charts card. Shows no numbers, so nothing can be mistaken for a reading.
struct TelemetryCardView: View {
    let crewMemberID: UUID

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack {
                    Text("Heart rate").font(.headline)
                    SimulatedBadge()
                }
                Text("Simulated telemetry chart is not built yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
