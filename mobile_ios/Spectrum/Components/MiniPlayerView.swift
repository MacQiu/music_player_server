import SwiftUI

struct MiniPlayerView: View {
    @Environment(PlayerViewModel.self) private var player

    var onTap: () -> Void
    var onQueueTap: () -> Void

    private var progress: Double {
        guard player.duration > 0 else { return 0 }
        return player.currentTime / player.duration
    }

    var body: some View {
        VStack(spacing: 0) {
            // Progress strip
            GeometryReader { geo in
                Rectangle()
                    .fill(AppColors.accent)
                    .frame(width: geo.size.width * progress, height: 2)
            }
            .frame(height: 2)

            HStack(spacing: Spacing.md) {
                // Cover
                if let song = player.currentSong {
                    CoverImageView(
                        songId: song.id,
                        imageKey: song.id,
                        imageUrl: song.coverUrl != nil ? "/covers/\(song.id)" : nil,
                        size: 40
                    )
                    .clipShape(RoundedRectangle(cornerRadius: AppRadius.sm))
                }

                // Title
                VStack(alignment: .leading, spacing: 1) {
                    Text(player.currentSong?.title ?? "")
                        .font(.system(size: AppFont.sm, weight: .medium))
                        .foregroundStyle(AppColors.text)
                        .lineLimit(1)
                    Text(player.currentSong?.artist ?? "")
                        .font(.system(size: AppFont.xs))
                        .foregroundStyle(AppColors.textMuted)
                        .lineLimit(1)
                }

                Spacer()

                // Play/Pause
                Button { player.toggle() } label: {
                    Image(systemName: player.playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(AppColors.text)
                        .frame(width: 36, height: 36)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.sm)
        }
        .background(AppColors.surface)
        .onTapGesture { onTap() }
    }
}
