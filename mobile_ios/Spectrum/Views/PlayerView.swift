import SwiftUI

struct PlayerView: View {
    @Environment(PlayerViewModel.self) private var player
    @Environment(DataViewModel.self) private var data
    @Environment(\.dismiss) private var dismiss

    @Binding var showQueue: Bool
    @Binding var showLyrics: Bool

    @State private var isSeeking = false
    @State private var seekValue: Double = 0
    @State private var coverImageUrl: URL?

    private var currentTime: Double { isSeeking ? seekValue : player.currentTime }

    var body: some View {
        ZStack {
            // Background cover image
            if let song = player.currentSong {
                coverBackground(song)
            }

            AppColors.bg.opacity(0.6).ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Color.black.opacity(0.5))
                            .clipShape(Circle())
                    }
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.lg)

                Spacer()

                // Cover art
                if let song = player.currentSong {
                    CoverImageView(
                        songId: song.id,
                        imageKey: song.id,
                        imageUrl: song.coverUrl != nil ? "/covers/\(song.id)" : nil,
                        size: UIScreen.main.bounds.width - 64
                    )
                    .clipShape(RoundedRectangle(cornerRadius: AppRadius.lg))
                    .shadow(radius: 20)
                    .padding(.horizontal, 32)
                }

                Spacer()

                // Song info
                if let song = player.currentSong {
                    VStack(spacing: Spacing.xs) {
                        Text(song.title)
                            .font(.system(size: AppFont.xxl, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .lineLimit(1)

                        Text(song.artist ?? "Unknown")
                            .font(.system(size: AppFont.lg))
                            .foregroundStyle(AppColors.textMuted)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, Spacing.xxl)
                }

                // Seek bar
                VStack(spacing: Spacing.xs) {
                    Slider(
                        value: Binding(
                            get: { currentTime },
                            set: { seekValue = $0; isSeeking = true }
                        ),
                        in: 0...max(player.duration, 1),
                        onEditingChanged: { editing in
                            if !editing {
                                player.seek(seekValue)
                                isSeeking = false
                            }
                        }
                    )
                    .tint(AppColors.accent)

                    HStack {
                        Text(formatDuration(currentTime))
                            .font(.system(size: AppFont.xs))
                            .foregroundStyle(AppColors.textMuted)
                        Spacer()
                        Text(formatDuration(player.duration))
                            .font(.system(size: AppFont.xs))
                            .foregroundStyle(AppColors.textMuted)
                    }
                }
                .padding(.horizontal, Spacing.xxl)
                .padding(.top, Spacing.lg)

                // Playback controls
                HStack(spacing: 40) {
                    Button { player.playPrevious() } label: {
                        Image(systemName: "backward.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(.white)
                    }

                    Button { player.toggle() } label: {
                        Image(systemName: player.playing ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(.white)
                    }

                    Button { player.playNext() } label: {
                        Image(systemName: "forward.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(.white)
                    }
                }
                .padding(.top, Spacing.lg)

                // Bottom row
                HStack(spacing: 32) {
                    Button { player.toggleShuffle() } label: {
                        Image(systemName: "shuffle")
                            .font(.system(size: 20))
                            .foregroundStyle(player.shuffleEnabled ? AppColors.accent : AppColors.textMuted)
                    }

                    Button { showLyrics = true; dismiss() } label: {
                        Image(systemName: "text.quote")
                            .font(.system(size: 20))
                            .foregroundStyle(AppColors.textMuted)
                    }

                    Button { showQueue = true; dismiss() } label: {
                        Image(systemName: "list.bullet")
                            .font(.system(size: 20))
                            .foregroundStyle(AppColors.textMuted)
                    }

                    Button { player.toggleRepeat() } label: {
                        ZStack {
                            Image(systemName: "repeat")
                                .font(.system(size: 20))
                                .foregroundStyle(player.repeatMode != .none ? AppColors.accent : AppColors.textMuted)
                            if player.repeatMode == .song {
                                Text("1")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(AppColors.accent)
                                    .offset(y: 1)
                            }
                        }
                    }
                }
                .padding(.top, Spacing.xxl)
                .padding(.bottom, 48)
            }
        }
        .background(AppColors.bg)
        .gesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    if value.translation.height > 100 {
                        dismiss()
                    }
                }
        )
    }

    @ViewBuilder
    private func coverBackground(_ song: Song) -> some View {
        if let coverUrl = song.coverUrl {
            AsyncImage(url: URL(string: "\(Task { await APIClient.shared.getBaseUrl() })/covers/\(song.id)")) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .ignoresSafeArea()
                        .blur(radius: 40)
                        .overlay(Color.black.opacity(0.5))
                }
            }
            .ignoresSafeArea()
        }
    }
}
