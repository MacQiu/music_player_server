import SwiftUI

struct HomeView: View {
    @Environment(PlayerViewModel.self) private var player
    @Environment(DataViewModel.self) private var data
    @State private var showCreatePlaylist = false
    @State private var newPlaylistName = ""

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    private var topTracks: [Song] {
        guard let analytics = data.analytics else { return [] }
        return analytics.topSongs.prefix(5).compactMap { top in
            data.songs.first(where: { $0.id == top.songId })
        }
    }

    private var topArtists: [Artist] {
        guard let analytics = data.analytics else { return [] }
        let names = analytics.topArtists.prefix(10).map(\.artist)
        return names.compactMap { name in
            data.artists.first(where: { $0.name == name })
        }
    }

    private var userPlaylists: [Playlist] {
        data.playlists.filter { !($0.name.hasPrefix("Your ") && $0.name.hasSuffix(" Playback")) }
    }

    private var wrappedPlaylists: [Playlist] {
        data.playlists.filter { $0.name.hasPrefix("Your ") && $0.name.hasSuffix(" Playback") }
    }

    private var recommendations: [Song] {
        data.analytics?.recommendations ?? []
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Spacing.xxl) {
                Text(greeting)
                    .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                    .foregroundStyle(AppColors.text)
                    .padding(.horizontal, Spacing.lg)

                // Top tracks
                if !topTracks.isEmpty {
                    sectionHeader("Recently Played")
                    ForEach(topTracks) { song in
                        SongRowView(song: song) {
                            player.playSong(song, contextSongs: topTracks)
                        }
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                // Artists
                if !topArtists.isEmpty {
                    sectionHeader("Artists")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.md) {
                            ForEach(topArtists) { artist in
                                NavigationLink(value: "artist/\(artist.name)") {
                                    artistCard(artist)
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                // Playlists
                if !userPlaylists.isEmpty {
                    sectionHeader("Playlists")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.md) {
                            ForEach(userPlaylists) { playlist in
                                NavigationLink(value: "playlist/\(playlist.id)") {
                                    playlistCard(playlist)
                                }
                            }

                            Button(action: { showCreatePlaylist = true }) {
                                VStack(spacing: Spacing.sm) {
                                    RoundedRectangle(cornerRadius: AppRadius.md)
                                        .fill(AppColors.surface2)
                                        .frame(width: 120, height: 120)
                                        .overlay {
                                            Image(systemName: "plus")
                                                .font(.system(size: 28))
                                                .foregroundStyle(AppColors.textMuted)
                                        }
                                    Text("New Playlist")
                                        .font(.system(size: AppFont.sm))
                                        .foregroundStyle(AppColors.textMuted)
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                // Wrapped playlists
                if !wrappedPlaylists.isEmpty {
                    sectionHeader("Wrapped")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.md) {
                            ForEach(wrappedPlaylists) { playlist in
                                NavigationLink(value: "playlist/\(playlist.id)") {
                                    playlistCard(playlist)
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                // Recommendations
                if !recommendations.isEmpty {
                    sectionHeader("Recommended")
                    ForEach(recommendations) { song in
                        SongRowView(song: song) {
                            player.playSong(song, contextSongs: data.songs)
                        }
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                Spacer(minLength: 120)
            }
            .padding(.top, Spacing.lg)
        }
        .background(AppColors.bg)
        .refreshable {
            await data.refreshAll()
        }
        .alert("New Playlist", isPresented: $showCreatePlaylist) {
            TextField("Playlist name", text: $newPlaylistName)
            Button("Create") { createPlaylist() }
            Button("Cancel", role: .cancel) { newPlaylistName = "" }
        }
    }

    // MARK: - Subviews

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: AppFont.xl, weight: .bold, design: .rounded))
            .foregroundStyle(AppColors.text)
            .padding(.horizontal, Spacing.lg)
    }

    private func artistCard(_ artist: Artist) -> some View {
        VStack(spacing: Spacing.sm) {
            CoverImageView(
                songId: nil,
                imageKey: artist.name,
                imageUrl: artist.imageUrl,
                size: 100
            )
            .clipShape(Circle())

            Text(artist.name)
                .font(.system(size: AppFont.sm))
                .foregroundStyle(AppColors.text)
                .lineLimit(1)
                .frame(width: 100)
        }
    }

    private func playlistCard(_ playlist: Playlist) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            CoverImageView(
                songId: nil,
                imageKey: "playlist_\(playlist.id)",
                imageUrl: playlist.coverUrl,
                size: 120
            )
            .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))

            Text(playlist.name)
                .font(.system(size: AppFont.sm))
                .foregroundStyle(AppColors.text)
                .lineLimit(1)
                .frame(width: 120, alignment: .leading)

            Text("\(playlist.songCount) songs")
                .font(.system(size: AppFont.xs))
                .foregroundStyle(AppColors.textMuted)
        }
    }

    private func createPlaylist() {
        guard !newPlaylistName.isEmpty else { return }
        Task {
            _ = try? await APIClient.shared.createPlaylist(name: newPlaylistName)
            newPlaylistName = ""
            await data.refreshPlaylists()
        }
    }
}
