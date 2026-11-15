import SwiftUI

struct MuseChatView: View {
    @Environment(AppServices.self) private var services
    @Environment(AppSettings.self) private var settings
    @State private var model = MuseChatViewModel()
    @FocusState private var inputFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if settings.museMode == .demo {
                    HStack(spacing: Theme.Spacing.s) {
                        SimulatedBadge(text: "Demo mode")
                        Text("Answers are precomputed, not live.")
                            .font(.caption)
                            .foregroundStyle(Theme.secondaryText)
                        Spacer()
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.s)
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: Theme.Spacing.m) {
                            if model.messages.isEmpty && model.error == nil && !model.isLoading {
                                EmptyStateView(title: "Ask MUSE", systemImage: "bubble.left.and.text.bubble.right",
                                               message: "Ask about stress, isolation, sleep or exercise on long missions. Answers come only from the team's curated NASA documents and list their sources.")
                                    .padding(.top, Theme.Spacing.xl)
                            }
                            ForEach(model.messages) { message in
                                MessageBubble(message: message,
                                              isUngrounded: model.ungroundedMessageIDs.contains(message.id))
                                    .id(message.id)
                            }
                            if model.isLoading {
                                HStack(spacing: Theme.Spacing.s) {
                                    ProgressView()
                                    Text("Looking through the research…").font(.subheadline).foregroundStyle(Theme.secondaryText)
                                }
                                .id("loading")
                            }
                            if let error = model.error {
                                errorCard(error).id("error")
                            }
                        }
                        .padding(Theme.Spacing.l)
                    }
                    .onChange(of: model.messages.count) {
                        if let last = model.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                    .onChange(of: model.error) {
                        if model.error != nil { withAnimation { proxy.scrollTo("error", anchor: .bottom) } }
                    }
                }
                inputBar
            }
            .background(Theme.screenBackground)
            .navigationTitle("MUSE")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var inputBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            if model.isOverLength {
                Text("Questions are limited to 500 characters.").font(.caption).foregroundStyle(Theme.critical)
            }
            HStack(alignment: .bottom, spacing: Theme.Spacing.s) {
                TextField("Ask a wellness question", text: $model.draft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .focused($inputFocused)
                Button {
                    inputFocused = false
                    Task { await model.send(using: services.muse) }
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title)
                }
                .disabled(!model.canSend)
                .accessibilityLabel("Send question")
            }
            Text("General information only. Not medical advice or emergency guidance.")
                .font(.caption2)
                .foregroundStyle(Theme.secondaryText)
        }
        .padding(Theme.Spacing.m)
        .background(Theme.cardBackground)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.cardBorder).frame(height: 1)
        }
    }

    private func errorCard(_ error: MuseError) -> some View {
        Card {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Label(MuseChatViewModel.title(for: error), systemImage: "exclamationmark.circle")
                    .font(.headline)
                    .foregroundStyle(Theme.critical)
                Text(MuseChatViewModel.detail(for: error)).font(.subheadline).foregroundStyle(Theme.secondaryText)
                if error != .invalidQuestion {
                    Button("Retry") { Task { await model.retry(using: services.muse) } }
                        .buttonStyle(.bordered)
                }
            }
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage
    let isUngrounded: Bool

    var body: some View {
        if message.role == .user {
            HStack {
                Spacer(minLength: 40)
                Text(message.content)
                    .padding(Theme.Spacing.m)
                    .foregroundStyle(Theme.onAccent)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: Theme.cornerRadius))
            }
        } else {
            Card {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    if message.answerSource == .precomputed { SimulatedBadge(text: "Demo mode · precomputed") }
                    Text(message.content)
                    if isUngrounded {
                        Label("No supporting source found", systemImage: "questionmark.circle")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.warning)
                    }
                    if !message.citations.isEmpty {
                        Divider()
                        Text("Sources").font(.caption.weight(.semibold)).foregroundStyle(Theme.secondaryText)
                        ForEach(message.citations, id: \.self) { citation in
                            Link(destination: citation.url) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(citation.title).font(.footnote.weight(.semibold)).multilineTextAlignment(.leading)
                                    if let section = citation.sectionOrPage, !section.isEmpty {
                                        Text(section).font(.caption).foregroundStyle(Theme.secondaryText)
                                    }
                                }
                            }
                        }
                    }
                    if let disclaimer = message.disclaimer, !disclaimer.isEmpty {
                        Text(disclaimer).font(.caption2).foregroundStyle(Theme.secondaryText)
                    }
                }
            }
        }
    }
}
