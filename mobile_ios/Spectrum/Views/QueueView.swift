import SwiftUI

struct QueueView: View {
    @Environment(PlayerViewModel.self) private var player
    @Environment(\.dismiss) private var dismiss

    private var aboveItems: [Song] {
        guard player.sourceIndex > 0 else { return [] }
        return Array(player.sourceList.prefix(player.sourceIndex))
    }

    private var belowItems: [Song] {
        guard player.sourceIndex + 1 < player.sourceList.count else { return [] }
        return Array(player.sourceList.suffix(from: player.sourceIndex + 1))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    // Previously played
                    if !aboveItems.isEmpty {
                        sectionHeader("Previously Played")
                        ForEach(Array(aboveItems.enumerated()), id: \.element.id) { index, song in
                            queueRow(song, dimmed: true) {
                                player.jumpToQueueIndex(index, section: "above")
                            }
                        }
                    }

                    // Now playing
                    if let current = player.currentSong {
                        sectionHeader("Now Playing")
                        queueRow(current, highlight: true) {}
                    }

                    // Manual queue
                    if !player.manualQueue.isEmpty {
                        sectionHeader("Added to Queue")
                        ForEach(Array(player.manualQueue.enumerated()), id: \.element.id) { index, song in
                            HStack {
                                queueRow(song) {
                                    player.jumpToQueueIndex(index, section: "manual")
                                }
                                Button {
                                    player.removeFromQueue(at: index)
                                } label: {
                                    Image(systemName: "minus.circle.fill")
                                        .foregroundStyle(AppColors.danger)
                                }
                                .padding(.trailing, Spacing.lg)
                            }
                        }
                    }

                    // Playing next
                    if !belowItems.isEmpty {
                        sectionHeader("Playing Next")
                        ForEach(Array(belowItems.enumerated()), id: \.element.id) { index, song in
                            queueRow(song) {
                                player.jumpToQueueIndex(index, section: "below")
                            }
                        }
                    }
                }
                .padding(.bottom, 40)
            }
            .background(AppColors.bg)
            .navigationTitle("Queue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(AppColors.accent)
                }
            }
            .toolbarBackground(AppColors.surface, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: AppFont.sm, weight: .semibold))
            .foregroundStyle(AppColors.textMuted)
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.lg)
            .padding(.bottom, Spacing.sm)
    }

    private func queueRow(_ song: Song, dimmed: Bool = false, highlight: Bool = false, onTap: @escaping () -> Void) -> some View {
        Button(action: onTap) {
            HStack(spacing: Spacing.md) {
                CoverImageView(songId: song.id, imageKey: song.id, imageUrl: song.coverUrl != nil ? "/covers/\(song.id)" : nil, size: 40)
                    .clipShape(RoundedRectangle(cornerRadius: AppRadius.sm))

                VStack(alignment: .leading, spacing: 2) {
                    Text(song.title)
                        .font(.system(size: AppFont.md))
                        .foregroundStyle(highlight ? AppColors.accent : (dimmed ? AppColors.textMuted : AppColors.text))
                        .lineLimit(1)
                    Text(song.artist ?? "Unknown")
                        .font(.system(size: AppFont.sm))
                        .foregroundStyle(AppColors.textMuted)
                        .lineLimit(1)
                }
                Spacer()
                Text(formatDuration(song.duration))
                    .font(.system(size: AppFont.sm))
                    .foregroundStyle(AppColors.textMuted)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.sm)
            .opacity(dimmed ? 0.6 : 1)
        }
    }
}
