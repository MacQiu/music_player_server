import SwiftUI

struct SongRowView: View {
    let song: Song
    var isSelected: Bool? = nil
    var showWrappedStats: Bool = false
    var onTap: () -> Void
    var onLongPress: (() -> Void)? = nil
    var onMenu: (() -> Void)? = nil

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Spacing.md) {
                // Selection indicator
                if let isSelected {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(isSelected ? AppColors.accent : AppColors.textMuted)
                        .font(.system(size: 20))
                }

                // Cover
                CoverImageView(
                    songId: song.id,
                    imageKey: song.id,
                    imageUrl: song.coverUrl != nil ? "/covers/\(song.id)" : nil,
                    size: 48
                )
                .clipShape(RoundedRectangle(cornerRadius: AppRadius.sm))

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(song.title)
                        .font(.system(size: AppFont.md))
                        .foregroundStyle(AppColors.text)
                        .lineLimit(1)

                    HStack(spacing: Spacing.xs) {
                        Text(song.artist ?? "Unknown")
                            .font(.system(size: AppFont.sm))
                            .foregroundStyle(AppColors.textMuted)
                            .lineLimit(1)

                        if !song.isDownloaded {
                            Text("· Not Downloaded")
                                .font(.system(size: AppFont.xs))
                                .foregroundStyle(AppColors.textMuted.opacity(0.6))
                        }
                    }

                    if showWrappedStats {
                        HStack(spacing: Spacing.sm) {
                            if let pc = song.playCount {
                                Text("\(pc) plays")
                                    .font(.system(size: AppFont.xs))
                                    .foregroundStyle(AppColors.accent)
                            }
                            if let tt = song.totalTime {
                                Text(formatListeningTime(tt))
                                    .font(.system(size: AppFont.xs))
                                    .foregroundStyle(AppColors.textMuted)
                            }
                        }
                    }
                }

                Spacer()

                Text(formatDuration(song.duration))
                    .font(.system(size: AppFont.sm))
                    .foregroundStyle(AppColors.textMuted)

                if let onMenu {
                    Button { onMenu() } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 16))
                            .foregroundStyle(AppColors.textMuted)
                            .frame(width: 28, height: 28)
                    }
                }
            }
            .padding(.vertical, Spacing.sm)
            .opacity(song.isDownloaded ? 1 : 0.7)
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5).onEnded { _ in
                onLongPress?()
            }
        )
    }
}
