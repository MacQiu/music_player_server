import SwiftUI

struct PlaylistDetailView: View {
    let playlistId: String

    @Environment(PlayerViewModel.self) private var player
    @Environment(DataViewModel.self) private var data
    @Environment(\.dismiss) private var dismiss

    @State private var playlist: Playlist?
    @State private var songs: [Song] = []
    @State private var isWrapped = false
    @State private var isEditing = false
    @State private var editName = ""
    @State private var selectedSongs: Set<String> = []
    @State private var isSelecting = false
    @State private var showDeleteConfirm = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Hero
                ZStack(alignment: .bottomLeading) {
                    if let firstSong = songs.first {
                        CoverImageView(
                            songId: firstSong.id,
                            imageKey: firstSong.id,
                            imageUrl: firstSong.coverUrl != nil ? "/covers/\(firstSong.id)" : nil,
                            size: UIScreen.main.bounds.width
                        )
                        .frame(height: 240)
                        .clipped()
                        .overlay(
                            LinearGradient(
                                colors: [.clear, AppColors.bg],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                    } else {
                        Rectangle()
                            .fill(AppColors.surface2)
                            .frame(height: 240)
                    }

                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        if isEditing, !isWrapped {
                            TextField("Playlist name", text: $editName)
                                .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                                .onSubmit { renamePlaylist() }
                        } else {
                            Text(playlist?.name ?? "Playlist")
                                .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                        }
                        Text("\(songs.count) songs")
                            .font(.system(size: AppFont.sm))
                            .foregroundStyle(AppColors.textMuted)
                    }
                    .padding(Spacing.lg)
                }

                // Action buttons
                HStack(spacing: Spacing.md) {
                    Button {
                        if let first = songs.first {
                            player.playSong(first, contextSongs: songs)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "play.fill")
                            Text("Play All")
                        }
                        .font(.system(size: AppFont.md, weight: .semibold))
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.sm)
                        .background(AppColors.accent)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                    }

                    if !isWrapped {
                        Button {
                            isEditing.toggle()
                            editName = playlist?.name ?? ""
                        } label: {
                            Image(systemName: isEditing ? "checkmark" : "pencil")
                                .font(.system(size: 16))
                                .foregroundStyle(AppColors.textMuted)
                                .frame(width: 36, height: 36)
                                .background(AppColors.surface2)
                                .clipShape(Circle())
                        }

                        Button { showDeleteConfirm = true } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 16))
                                .foregroundStyle(AppColors.danger)
                                .frame(width: 36, height: 36)
                                .background(AppColors.surface2)
                                .clipShape(Circle())
                        }
                    }

                    Spacer()
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)

                // Song list
                LazyVStack(spacing: 0) {
                    ForEach(Array(songs.enumerated()), id: \.element.id) { index, song in
                        HStack {
                            SongRowView(
                                song: song,
                                isSelected: isSelecting ? selectedSongs.contains(song.id) : nil,
                                showWrappedStats: isWrapped,
                                onTap: {
                                    if isSelecting {
                                        toggleSelection(song.id)
                                    } else {
                                        player.playSong(song, contextSongs: songs)
                                    }
                                },
                                onLongPress: {
                                    if !isWrapped, !isSelecting {
                                        isSelecting = true
                                        selectedSongs.insert(song.id)
                                    }
                                }
                            )

                            if !isWrapped, !isSelecting {
                                Button {
                                    removeSong(song)
                                } label: {
                                    Image(systemName: "minus.circle")
                                        .foregroundStyle(AppColors.danger)
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                Spacer(minLength: 120)
            }
        }
        .background(AppColors.bg)
        .navigationBarBackButtonHidden(false)
        .task { await loadPlaylist() }
        .alert("Delete Playlist?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) { deletePlaylist() }
            Button("Cancel", role: .cancel) {}
        }
        .overlay(alignment: .bottom) {
            if isSelecting {
                SelectionBarView(
                    count: selectedSongs.count,
                    totalCount: songs.count,
                    onSelectAll: { selectedSongs = Set(songs.map(\.id)) },
                    onDeselectAll: { selectedSongs.removeAll() },
                    actions: [("Remove", { batchRemove() })],
                    onDismiss: { isSelecting = false; selectedSongs.removeAll() }
                )
            }
        }
    }

    private func loadPlaylist() async {
        do {
            let p = try await APIClient.shared.getPlaylist(playlistId)
            await MainActor.run {
                playlist = p
                songs = p.songs ?? []
                isWrapped = p.isWrapped ?? false
            }
        } catch {}
    }

    private func renamePlaylist() {
        guard !editName.isEmpty else { return }
        Task {
            _ = try? await APIClient.shared.updatePlaylist(playlistId, name: editName)
            await loadPlaylist()
            await data.refreshPlaylists()
            isEditing = false
        }
    }

    private func removeSong(_ song: Song) {
        Task {
            _ = try? await APIClient.shared.removeSongFromPlaylist(playlistId, songId: song.id)
            await loadPlaylist()
            await data.refreshPlaylists()
        }
    }

    private func deletePlaylist() {
        Task {
            _ = try? await APIClient.shared.deletePlaylist(playlistId)
            await data.refreshPlaylists()
            dismiss()
        }
    }

    private func batchRemove() {
        Task {
            for songId in selectedSongs {
                _ = try? await APIClient.shared.removeSongFromPlaylist(playlistId, songId: songId)
            }
            selectedSongs.removeAll()
            isSelecting = false
            await loadPlaylist()
            await data.refreshPlaylists()
        }
    }

    private func toggleSelection(_ id: String) {
        if selectedSongs.contains(id) { selectedSongs.remove(id) }
        else { selectedSongs.insert(id) }
    }
}
