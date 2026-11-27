import Foundation

@Observable
final class DataViewModel {
    var songs: [Song] = []
    var analytics: AnalyticsData?
    var analyticsLoading = false
    var playlists: [Playlist] = []
    var artists: [Artist] = []
    var online = false
    var error: String?
    var imgVersion = 0

    private var pingTimer: Timer?
    private var wasOnline = false

    private let cacheSongs = "mp_cached_songs"
    private let cachePlaylists = "mp_cached_playlists"
    private let cacheArtists = "mp_cached_artists"
    private let cacheAnalytics = "mp_cached_analytics"

    init() {
        loadCachedData()
        startPingTimer()
        Task {
            await refreshAll()
        }
    }

    // MARK: - Cache

    private func loadCachedData() {
        if let s: [Song] = loadCached(cacheSongs), !s.isEmpty { songs = s }
        if let p: [Playlist] = loadCached(cachePlaylists), !p.isEmpty { playlists = p }
        if let a: [Artist] = loadCached(cacheArtists), !a.isEmpty { artists = a }
        if let an: AnalyticsData = loadCached(cacheAnalytics) { analytics = an }
    }

    private func loadCached<T: Decodable>(_ key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func saveCache<T: Encodable>(_ key: String, value: T) {
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    // MARK: - Refresh

    func refreshSongs() async {
        do {
            let data = try await APIClient.shared.getSongs()
            await MainActor.run {
                songs = data
                saveCache(cacheSongs, value: data)
                error = nil
            }
        } catch {
            await MainActor.run {
                self.error = "Failed to load songs: \(error.localizedDescription)"
            }
        }
    }

    func refreshAnalytics() async {
        if analytics == nil {
            await MainActor.run { analyticsLoading = true }
        }
        do {
            let data = try await APIClient.shared.getAnalytics()
            await MainActor.run {
                analytics = data
                saveCache(cacheAnalytics, value: data)
                analyticsLoading = false
            }
        } catch {
            await MainActor.run { analyticsLoading = false }
        }
    }

    func refreshPlaylists() async {
        do {
            let data = try await APIClient.shared.getPlaylists()
            await MainActor.run {
                playlists = data
                saveCache(cachePlaylists, value: data)
            }
        } catch {}
    }

    func refreshArtists() async {
        do {
            let data = try await APIClient.shared.getArtists()
            await MainActor.run {
                artists = data
                saveCache(cacheArtists, value: data)
            }
        } catch {}
    }

    func refreshAll() async {
        async let s: () = refreshSongs()
        async let a: () = refreshAnalytics()
        async let p: () = refreshPlaylists()
        async let ar: () = refreshArtists()
        _ = await (s, a, p, ar)
    }

    func bumpImgVersion() {
        imgVersion += 1
    }

    func updateLocalAnalytics(patch: AnalyticsData) {
        guard var current = analytics else { return }
        current.totalListeningTime += patch.totalListeningTime
        current.totalPlays += patch.totalPlays
        analytics = current
        saveCache(cacheAnalytics, value: current)
    }

    // MARK: - Online detection

    private func startPingTimer() {
        checkOnline()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            self?.checkOnline()
        }
    }

    private func checkOnline() {
        Task {
            do {
                _ = try await APIClient.shared.ping()
                let justCameOnline = !wasOnline
                wasOnline = true
                await MainActor.run { online = true }

                await PlaylogQueue.flushAll()

                if justCameOnline {
                    await refreshAll()
                    Task { await StorageManager.syncDownloadedSongs() }
                }
            } catch {
                wasOnline = false
                await MainActor.run { online = false }
            }
        }
    }
}
