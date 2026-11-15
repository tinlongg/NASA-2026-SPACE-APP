import SwiftUI

/// Full-screen "Are you OK?" prompt shown after a possible fall. Large targets, readable from the floor.
struct CheckInView: View {
    let model: CameraMonitorViewModel

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { _ in
            let remaining = model.checkInRemaining
            let total = CameraMonitorViewModel.checkInDuration
            VStack(spacing: Theme.Spacing.xl) {
                Spacer(minLength: 0)
                VStack(spacing: Theme.Spacing.s) {
                    Text("Possible fall detected")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.alert)
                    Text("Are you OK?")
                        .font(.system(size: 40, weight: .semibold))
                }
                .accessibilityElement(children: .combine)

                ZStack {
                    Circle().stroke(Theme.hairline, lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: total > 0 ? remaining / total : 0)
                        .stroke(Theme.alert, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.25), value: remaining)
                    VStack(spacing: 2) {
                        Text("\(Int(remaining.rounded(.up)))")
                            .font(.system(size: 56, weight: .medium))
                            .monospacedDigit()
                        Text("seconds")
                            .font(.subheadline)
                            .foregroundStyle(Theme.secondaryText)
                    }
                }
                .frame(width: 200, height: 200)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(Int(remaining.rounded(.up))) seconds left to answer")

                Text("If there's no answer, the crew is alerted when the timer runs out")
                    .font(.subheadline)
                    .foregroundStyle(Theme.secondaryText)
                    .multilineTextAlignment(.center)

                voiceStatus

                Spacer(minLength: 0)

                VStack(spacing: Theme.Spacing.m) {
                    Button {
                        model.respondOK()
                    } label: {
                        Text("I'm OK").font(.title3.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.accent)

                    Button(role: .destructive) {
                        model.requestHelp()
                    } label: {
                        Text("I need help").font(.title3.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .tint(Theme.alert)
                }
                .controlSize(.large)
            }
            .padding(Theme.Spacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.screenBackground)
        }
        .interactiveDismissDisabled()
    }

    private var voiceStatus: some View {
        VStack(spacing: Theme.Spacing.xs) {
            Label(model.isListening ? "Listening · say \"I'm okay\" or \"help\"" : "Tap a button to answer",
                  systemImage: model.isListening ? "mic" : "hand.tap")
                .font(.subheadline)
                .foregroundStyle(Theme.secondaryText)
            if let heard = model.heardText, !heard.isEmpty {
                Text("Heard \"\(heard)\"")
                    .font(.caption)
                    .foregroundStyle(Theme.secondaryText)
                    .lineLimit(2)
            }
        }
        .multilineTextAlignment(.center)
    }
}
