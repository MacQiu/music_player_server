import SwiftUI

enum LibraryFilter: String, CaseIterable {
    case all = "All"
    case playlists = "Playlists"
    case artists = "Artists"
    case wrapped = "Wrapped"
    case songs = "Songs"
}

enum SongSort: String, CaseIterable {
    case title = "Title"
    case artist = "Artist"
    case duration = "Duration"
}

struct LibraryView: View {
    @Environment(PlayerViewModel.self) private var player
    @Environment(DataViewModel.self) private var data

    @State private var filter: LibraryFilter = .all
    @State private var search = ""
    @State private var songSort: SongSort = .title
    @State private var sortAscending = true
    @State private var selectedSongs: Set<String> = []
    @State private var isSelecting = false
    @State private var showSongMenu: Song?
    @State private var showAddToPlaylist: Song?

    private var filteredSongs: [Song] {
        var list = data.songs
        if !search.isEmpty {
            let q = search.lowercased()
            list = list.filter {
                $0.title.lowercased().contains(q) ||
                ($0.artist?.lowercased().contains(q) ?? false) ||
                ($0.album?.lowercased().contains(q) ?? false)
            }
        }
        switch songSort {
        case .title: list.sort { sortAscending ? $0.title.localizedCompare($1.title) == .orderedAscending : $0.title.localizedCompare($1.title) == .orderedDescending }
        case .artist: list.sort { sortAscending ? ($0.artist ?? "").localizedCompare($1.artist ?? "") == .orderedAscending : ($0.artist ?? "").localizedCompare($1.artist ?? "") == .orderedDescending }
        case .duration: list.sort { sortAscending ? ($0.duration ?? 0) < ($1.duration ?? 0) : ($0.duration ?? 0) > ($1.duration ?? 0) }
        }
        return list
    }

    private var filteredPlaylists: [Playlist] {
        let q = search.lowercased()
        return data.playlists.filter { p in
            !p.name.hasPrefix("Your ") && (q.isEmpty || p.name.lowercased().contains(q))
        }
    }

    private var filteredArtists: [Artist] {
        let q = search.lowercased()
        return data.artists.filter { q.isEmpty || $0.name.lowercased().contains(q) }
    }

    private var filteredWrapped: [Playlist] {
        return data.playlists.filter { $0.name.hasPrefix("Your ") && $0.name.hasSuffix(" Playback") }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Search bar
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(AppColors.textMuted)
                TextField("Search library", text: $search)
                    .foregroundStyle(AppColors.text)
                    .autocorrectionDisabled()
                if !search.isEmpty {
                    Button { search = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(AppColors.textMuted)
                    }
                }
            }
            .padding(Spacing.md)
            .background(AppColors.surface2)
            .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.sm)

            // Filter chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.sm) {
                    ForEach(LibraryFilter.allCases, id: \.self) { f in
                        Button {
                            filter = f
                            isSelecting = false
                            selectedSongs.removeAll()
                        } label: {
                            Text(f.rawValue)
                                .font(.system(size: AppFont.sm, weight: .medium))
                                .padding(.horizontal, Spacing.md)
                                .padding(.vertical, Spacing.sm)
                                .background(filter == f ? AppColors.accent : AppColors.surface2)
                                .foregroundStyle(filter == f ? .white : AppColors.text)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.sm)
            }

            // Sort pills for Songs filter
            if filter == .songs {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.sm) {
                        ForEach(SongSort.allCases, id: \.self) { s in
                            Button {
                                if songSort == s {
                                    sortAscending.toggle()
                                } else {
                                    songSort = s
                                    sortAscending = true
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Text(s.rawValue)
                                    if songSort == s {
                                        Image(systemName: sortAscending ? "chevron.up" : "chevron.down")
                                            .font(.system(size: 10))
                                    }
                                }
                                .font(.system(size: AppFont.xs, weight: .medium))
                                .padding(.horizontal, Spacing.sm)
                                .padding(.vertical, Spacing.xs)
                                .background(songSort == s ? AppColors.accent.opacity(0.3) : AppColors.surface3)
                                .foregroundStyle(AppColors.text)
                                .clipShape(Capsule())
                            }
                        }
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.sm)
                }
            }

            // Content
            ScrollView {
                LazyVStack(spacing: 0) {
                    switch filter {
                    case .all:
                        mixedList
                    case .playlists:
                        ForEach(filteredPlaylists) { playlist in
                            NavigationLink(value: "playlist/\(playlist.id)") {
                                playlistRow(playlist)
                            }
                        }
                    case .artists:
                        ForEach(filteredArtists) { artist in
                            NavigationLink(value: "artist/\(artist.name)") {
                                artistRow(artist)
                            }
                        }
                    case .wrapped:
                        ForEach(filteredWrapped) { playlist in
                            NavigationLink(value: "playlist/\(playlist.id)") {
                                playlistRow(playlist)
                            }
                        }
                    case .songs:
                        ForEach(filteredSongs) { song in
                            songRow(song)
                        }
                    }
                }
                .padding(.bottom, 120)
            }

            if isSelecting {
                SelectionBarView(
                    count: selectedSongs.count,
                    totalCount: filteredSongs.count,
                    onSelectAll: { selectedSongs = Set(filteredSongs.map(\.id)) },
                    onDeselectAll: { selectedSongs.removeAll() },
                    actions: [
                        ("Add to Playlist", { batchAddToPlaylist() }),
                        ("Download", { batchDownload() }),
                        ("Delete Local", { batchDeleteLocal() }),
                    ],
                    onDismiss: {
                        isSelecting = false
                        selectedSongs.removeAll()
                    }
                )
            }
        }
        .background(AppColors.bg)
        .refreshable {
            await data.refreshAll()
        }
        .confirmationDialog("Song Actions", isPresented: Binding(
            get: { showSongMenu != nil },
            set: { if !$0 { showSongMenu = nil } }
        )) {
            if let song = showSongMenu {
                Button("Play") { player.playSong(song, contextSongs: data.songs) }
                Button("Add to Queue") { player.addToQueue(song) }
                Button("Add to Playlist") { showAddToPlaylist = song }
                Button(song.isDownloaded ? "Remove Download" : "Download") {
                    toggleDownload(song)
                }
                Button("Cancel", role: .cancel) {}
            }
        }
        .sheet(item: $showAddToPlaylist) { song in
            addToPlaylistSheet(song: song)
        }
    }

    // MARK: - Rows

    @ViewBuilder
    private var mixedList: some View {
        ForEach(filteredPlaylists) { playlist in
            NavigationLink(value: "playlist/\(playlist.id)") {
                playlistRow(playlist)
            }
        }
        ForEach(filteredArtists) { artist in
            NavigationLink(value: "artist/\(artist.name)") {
                artistRow(artist)
            }
        }
        ForEach(filteredSongs) { song in
            songRow(song)
        }
    }

    private func songRow(_ song: Song) -> some View {
        SongRowView(
            song: song,
            isSelected: isSelecting ? selectedSongs.contains(song.id) : nil,
            onTap: {
                if isSelecting {
                    toggleSelection(song.id)
                } else {
                    player.playSong(song, contextSongs: filteredSongs)
                }
            },
            onLongPress: {
                if !isSelecting {
                    isSelecting = true
                    selectedSongs.insert(song.id)
                }
            },
            onMenu: { showSongMenu = song }
        )
        .padding(.horizontal, Spacing.lg)
    }

    private func playlistRow(_ playlist: Playlist) -> some View {
        HStack(spacing: Spacing.md) {
            CoverImageView(songId: nil, imageKey: "playlist_\(playlist.id)", imageUrl: playlist.coverUrl, size: 48)
                .clipShape(RoundedRectangle(cornerRadius: AppRadius.sm))

            VStack(alignment: .leading, spacing: 2) {
                Text(playlist.name)
                    .font(.system(size: AppFont.md))
                    .foregroundStyle(AppColors.text)
                Text("Playlist · \(playlist.songCount) songs")
                    .font(.system(size: AppFont.sm))
                    .foregroundStyle(AppColors.textMuted)
            }
            Spacer()
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
    }

    private func artistRow(_ artist: Artist) -> some View {
        HStack(spacing: Spacing.md) {
            CoverImageView(songId: nil, imageKey: artist.name, imageUrl: artist.imageUrl, size: 48)
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(artist.name)
                    .font(.system(size: AppFont.md))
                    .foregroundStyle(AppColors.text)
                Text("Artist · \(artist.songCount) songs")
                    .font(.system(size: AppFont.sm))
                    .foregroundStyle(AppColors.textMuted)
            }
            Spacer()
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.sm)
    }

    // MARK: - Actions

    private func toggleSelection(_ id: String) {
        if selectedSongs.contains(id) {
            selectedSongs.remove(id)
        } else {
            selectedSongs.insert(id)
        }
    }

    private func toggleDownload(_ song: Song) {
        Task {
            if song.isDownloaded {
                StorageManager.deleteSongLocal(songId: song.id, filePath: song.filePath)
            } else {
                _ = try? await StorageManager.downloadSong(songId: song.id, filePath: song.filePath)
            }
            _ = try? await APIClient.shared.toggleDownload(songId: song.id, downloaded: !song.isDownloaded)
            await data.refreshSongs()
        }
    }

    private func batchAddToPlaylist() {}
    private func batchDownload() {
        let songs = data.songs.filter { selectedSongs.contains($0.id) }
        Task {
            for song in songs {
                _ = try? await StorageManager.downloadSong(songId: song.id, filePath: song.filePath)
                _ = try? await APIClient.shared.toggleDownload(songId: song.id, downloaded: true)
            }
            await data.refreshSongs()
            isSelecting = false
            selectedSongs.removeAll()
        }
    }
    private func batchDeleteLocal() {
        let songs = data.songs.filter { selectedSongs.contains($0.id) }
        Task {
            for song in songs {
                StorageManager.deleteSongLocal(songId: song.id, filePath: song.filePath)
                _ = try? await APIClient.shared.toggleDownload(songId: song.id, downloaded: false)
            }
            await data.refreshSongs()
            isSelecting = false
            selectedSongs.removeAll()
        }
    }

    private func addToPlaylistSheet(song: Song) -> some View {
        NavigationStack {
            List(data.playlists.filter { !($0.isWrapped ?? false) }) { playlist in
                Button {
                    Task {
                        _ = try? await APIClient.shared.addSongToPlaylist(playlist.id, songId: song.id)
                        await data.refreshPlaylists()
                        showAddToPlaylist = nil
                    }
                } label: {
                    Text(playlist.name)
                        .foregroundStyle(AppColors.text)
                }
                .listRowBackground(AppColors.surface)
            }
            .scrollContentBackground(.hidden)
            .background(AppColors.bg)
            .navigationTitle("Add to Playlist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showAddToPlaylist = nil }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

