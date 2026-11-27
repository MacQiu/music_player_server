import SwiftUI

struct MainTabView: View {
    @Environment(PlayerViewModel.self) private var player
    @State private var selectedTab = 0
    @State private var showPlayer = false
    @State private var showQueue = false
    @State private var showLyrics = false

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                TabView(selection: $selectedTab) {
                    HomeView()
                        .tag(0)
                        .tabItem {
                            Label("Home", systemImage: "house.fill")
                        }

                    LibraryView()
                        .tag(1)
                        .tabItem {
                            Label("Library", systemImage: "books.vertical.fill")
                        }

                    AnalyticsView()
                        .tag(2)
                        .tabItem {
                            Label("Analytics", systemImage: "chart.bar.fill")
                        }

                    SyncView()
                        .tag(3)
                        .tabItem {
                            Label("Sync", systemImage: "arrow.triangle.2.circlepath")
                        }
                }
                .tint(AppColors.accent)

                if player.currentSong != nil {
                    VStack(spacing: 0) {
                        MiniPlayerView(
                            onTap: { showPlayer = true },
                            onQueueTap: { showQueue = true }
                        )
                        .padding(.bottom, 49)
                    }
                }
            }
            .navigationDestination(for: String.self) { route in
                if route.hasPrefix("playlist/") {
                    let id = String(route.dropFirst("playlist/".count))
                    PlaylistDetailView(playlistId: id)
                } else if route.hasPrefix("artist/") {
                    let name = String(route.dropFirst("artist/".count))
                    ArtistDetailView(artistName: name)
                }
            }
        }
        .fullScreenCover(isPresented: $showPlayer) {
            PlayerView(
                showQueue: $showQueue,
                showLyrics: $showLyrics
            )
        }
        .sheet(isPresented: $showQueue) {
            QueueView()
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showLyrics) {
            LyricsView()
                .presentationDetents([.large])
        }
    }
}
