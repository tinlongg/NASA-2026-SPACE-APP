import SwiftUI
import WatchKit

struct WatchRootView: View {
    @Environment(PhoneLink.self) private var link

    var body: some View {
        if let checkIn = link.checkIn {
            CheckInScreen(checkIn: checkIn)
        } else {
            MonitorScreen()
        }
    }
}

private struct MonitorScreen: View {
    @Environment(MonitorSession.self) private var monitor
    @Environment(PhoneLink.self) private var link

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    VStack(spacing: 4) {
                        Text(monitor.heartRate.map { "\(Int($0.rounded())) BPM" } ?? "— BPM")
                            .font(.system(.title, design: .rounded).weight(.semibold))
                        Text(wristText(now: context.date))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Button(monitor.isMonitoring ? "Stop monitoring" : "Start monitoring") {
                    Task { monitor.isMonitoring ? await monitor.stop() : await monitor.start() }
                }
                .tint(monitor.isMonitoring ? .gray : .green)
                Text(monitor.status).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                if let answer = link.lastAnswer {
                    Text(answer == "ok" ? "Sent: I'm OK" : "Sent: Need help").font(.caption2)
                }
            }
        }
        .navigationTitle("CrewSafety")
    }

    private func wristText(now: Date) -> String {
        guard monitor.isMonitoring else { return "Start to share heart rate and wrist movement" }
        guard let moved = monitor.movedAt else { return "No wrist movement yet" }
        return "Wrist moved \(max(0, Int(now.timeIntervalSince(moved)))) s ago"
    }
}

/// Full-screen "Are you OK?": vibrates every 5 seconds until answered or the time runs out.
private struct CheckInScreen: View {
    let checkIn: PhoneLink.CheckIn
    @Environment(PhoneLink.self) private var link

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(checkIn.deadline.timeIntervalSince(context.date).rounded(.up)))
            VStack(spacing: 6) {
                Text("Are you OK?").font(.title3.weight(.bold))
                Text("\(left) s").font(.system(.body, design: .monospaced)).foregroundStyle(.secondary)
                Button("I'm OK") { link.answer("ok") }
                    .tint(.green)
                    .font(.headline)
                Button("Need help") { link.answer("help") }
                    .tint(.red)
            }
        }
        .task(id: checkIn.id) {
            while !Task.isCancelled, link.checkIn?.id == checkIn.id {
                if checkIn.deadline <= .now { link.expire(); return }
                WKInterfaceDevice.current().play(.notification)
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }
}
