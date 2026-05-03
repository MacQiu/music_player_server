import Foundation

struct StorageManager {
    private static let fm = FileManager.default

    private static var documentsDir: URL {
        fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static var songsDir: URL { documentsDir.appendingPathComponent("songs", isDirectory: true) }
    static var coversDir: URL { documentsDir.appendingPathComponent("covers", isDirectory: true) }
    static var imagesDir: URL { documentsDir.appendingPathComponent("images", isDirectory: true) }

    private static func ensureDir(_ url: URL) {
        if !fm.fileExists(atPath: url.path) {
            try? fm.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }

    private static func extFromPath(_ filePath: String?) -> String {
        guard let filePath, let dot = filePath.lastIndex(of: ".") else { return ".mp3" }
        return String(filePath[dot...])
    }

    // MARK: - Songs

    static func localSongPath(songId: String, filePath: String? = nil) -> URL {
        songsDir.appendingPathComponent("\(songId)\(extFromPath(filePath))")
    }

    static func isSongDownloaded(songId: String, filePath: String? = nil) -> Bool {
        fm.fileExists(atPath: localSongPath(songId: songId, filePath: filePath).path)
    }

    static func downloadSong(songId: String, filePath: String? = nil) async throws -> URL {
        ensureDir(songsDir)
        let localPath = localSongPath(songId: songId, filePath: filePath)
        let remoteUrl = await APIClient.shared.getDownloadUrl(songId)
        let data = try await APIClient.shared.downloadData(from: remoteUrl)
        try data.write(to: localPath)

        try? await downloadCover(songId: songId)
        try? await LyricsCache.cacheAllLyricsForSong(songId: songId)

        return localPath
    }

    static func deleteSongLocal(songId: String, filePath: String? = nil) {
        let path = localSongPath(songId: songId, filePath: filePath)
        try? fm.removeItem(at: path)
        deleteCoverLocal(songId: songId)
    }

    static func getPlayableURL(songId: String, filePath: String? = nil) async -> URL {
        let local = localSongPath(songId: songId, filePath: filePath)
        if fm.fileExists(atPath: local.path) {
            return local
        }
        let remote = await APIClient.shared.getDownloadUrl(songId)
        return URL(string: remote)!
    }

    // MARK: - Cover images

    private static func localCoverPath(songId: String) -> URL {
        coversDir.appendingPathComponent("\(songId).jpg")
    }

    @discardableResult
    static func downloadCover(songId: String) async throws -> URL {
        ensureDir(coversDir)
        let localPath = localCoverPath(songId: songId)
        let remoteUrl = await APIClient.shared.getCoverUrl(songId)
        let data = try await APIClient.shared.downloadData(from: remoteUrl)
        try data.write(to: localPath)
        return localPath
    }

    static func deleteCoverLocal(songId: String) {
        let path = localCoverPath(songId: songId)
        try? fm.removeItem(at: path)
    }

    static func getLocalCoverURL(songId: String) -> URL? {
        let path = localCoverPath(songId: songId)
        return fm.fileExists(atPath: path.path) ? path : nil
    }

    // MARK: - Generic image cache

    private static func sanitizeKey(_ key: String) -> String {
        key.replacingOccurrences(of: "[^a-zA-Z0-9_-]", with: "_", options: .regularExpression)
    }

    @discardableResult
    static func downloadImageByKey(_ key: String, remoteUrl: String) async throws -> URL {
        ensureDir(imagesDir)
        let localPath = imagesDir.appendingPathComponent("\(sanitizeKey(key)).jpg")
        let data = try await APIClient.shared.downloadData(from: remoteUrl)
        try data.write(to: localPath)
        return localPath
    }

    static func getLocalImageURL(_ key: String) -> URL? {
        let path = imagesDir.appendingPathComponent("\(sanitizeKey(key)).jpg")
        return fm.fileExists(atPath: path.path) ? path : nil
    }

    // MARK: - Sync downloaded songs

    static func syncDownloadedSongs() async {
        guard let data = UserDefaults.standard.data(forKey: "mp_cached_songs"),
              let songs = try? JSONDecoder().decode([Song].self, from: data) else { return }

        let downloaded = songs.filter { $0.isDownloaded }
        guard !downloaded.isEmpty else { return }

        await withTaskGroup(of: Void.self) { group in
            for song in downloaded {
                group.addTask {
                    try? await downloadCover(songId: song.id)
                    try? await LyricsCache.cacheAllLyricsForSong(songId: song.id)
                }
            }
        }
    }
}
