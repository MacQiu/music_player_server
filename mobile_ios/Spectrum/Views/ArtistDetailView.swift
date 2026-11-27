import SwiftUI
import PhotosUI

struct ArtistDetailView: View {
    let artistName: String

    @Environment(PlayerViewModel.self) private var player
    @Environment(DataViewModel.self) private var data

    @State private var selectedPhoto: PhotosPickerItem?

    private var artist: Artist? {
        data.artists.first(where: { $0.name == artistName })
    }

    private var artistSongs: [Song] {
        data.songs.filter { $0.artist == artistName }
    }

    private var albums: [String] {
        let allAlbums = artistSongs.compactMap(\.album).filter { !$0.isEmpty }
        return Array(Set(allAlbums)).sorted()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Hero banner
                ZStack(alignment: .bottomLeading) {
                    if let artist, artist.imageUrl != nil {
                        CoverImageView(
                            songId: nil,
                            imageKey: artistName,
                            imageUrl: artist.imageUrl,
                            size: UIScreen.main.bounds.width
                        )
                        .frame(height: 280)
                        .clipped()
                        .overlay(
                            LinearGradient(
                                colors: [.clear, AppColors.bg],
                                startPoint: .center,
                                endPoint: .bottom
                            )
                        )
                    } else {
                        Rectangle()
                            .fill(AppColors.surface2)
                            .frame(height: 200)
                            .overlay(
                                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                                    VStack(spacing: Spacing.sm) {
                                        Image(systemName: "camera.fill")
                                            .font(.system(size: 28))
                                            .foregroundStyle(AppColors.textMuted)
                                        Text("Add Image")
                                            .font(.system(size: AppFont.sm))
                                            .foregroundStyle(AppColors.textMuted)
                                    }
                                }
                            )
                    }

                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(artistName)
                            .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                        Text("\(artistSongs.count) songs")
                            .font(.system(size: AppFont.sm))
                            .foregroundStyle(AppColors.textMuted)
                    }
                    .padding(Spacing.lg)
                }

                // Play All button
                HStack {
                    Button {
                        if let first = artistSongs.first {
                            player.playSong(first, contextSongs: artistSongs)
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
                    Spacer()
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)

                // Albums horizontal scroll
                if !albums.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Albums")
                            .font(.system(size: AppFont.xl, weight: .bold, design: .rounded))
                            .foregroundStyle(AppColors.text)
                            .padding(.horizontal, Spacing.lg)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Spacing.md) {
                                ForEach(albums, id: \.self) { album in
                                    let albumSongs = artistSongs.filter { $0.album == album }
                                    VStack(alignment: .leading, spacing: Spacing.xs) {
                                        if let firstSong = albumSongs.first {
                                            CoverImageView(
                                                songId: firstSong.id,
                                                imageKey: firstSong.id,
                                                imageUrl: firstSong.coverUrl != nil ? "/covers/\(firstSong.id)" : nil,
                                                size: 100
                                            )
                                            .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
                                        }
                                        Text(album)
                                            .font(.system(size: AppFont.sm))
                                            .foregroundStyle(AppColors.text)
                                            .lineLimit(1)
                                            .frame(width: 100, alignment: .leading)
                                    }
                                }
                            }
                            .padding(.horizontal, Spacing.lg)
                        }
                    }
                    .padding(.bottom, Spacing.lg)
                }

                // Popular tracks
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("Songs")
                        .font(.system(size: AppFont.xl, weight: .bold, design: .rounded))
                        .foregroundStyle(AppColors.text)
                        .padding(.horizontal, Spacing.lg)

                    ForEach(artistSongs) { song in
                        SongRowView(song: song) {
                            player.playSong(song, contextSongs: artistSongs)
                        }
                        .padding(.horizontal, Spacing.lg)
                    }
                }

                Spacer(minLength: 120)
            }
        }
        .background(AppColors.bg)
        .navigationBarBackButtonHidden(false)
        .onChange(of: selectedPhoto) { _, newValue in
            uploadArtistImage(newValue)
        }
    }

    private func uploadArtistImage(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
            _ = try? await APIClient.shared.uploadArtistImage(
                name: artistName,
                imageData: data,
                imageName: "\(artistName).jpg"
            )
            await self.data.refreshArtists()
            self.data.bumpImgVersion()
        }
    }
}
