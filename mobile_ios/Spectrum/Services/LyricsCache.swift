import Foundation

struct LyricsCache {
    private static let fm = FileManager.default

    private static var lyricsDir: URL {
        fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("lyrics", isDirectory: true)
    }

    private static func songDir(_ songId: String) -> URL {
        lyricsDir.appendingPathComponent(songId, isDirectory: true)
    }

    private static func ensureDir(_ url: URL) {
        if !fm.fileExists(atPath: url.path) {
            try? fm.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }

    // MARK: - Lyric sets

    static func cacheLyricSets(songId: String, sets: [[String: Any]]) {
        let dir = songDir(songId)
        ensureDir(dir)
        let path = dir.appendingPathComponent("sets.json")
        if let data = try? JSONSerialization.data(withJSONObject: sets) {
            try? data.write(to: path)
        }
    }

    static func getCachedLyricSets(songId: String) -> [[String: Any]]? {
        let path = songDir(songId).appendingPathComponent("sets.json")
        guard let data = try? Data(contentsOf: path),
              let sets = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return nil
        }
        return sets
    }

    // MARK: - Lyric text

    static func cacheLyricText(songId: String, setId: String, text: String) {
        let dir = songDir(songId)
        ensureDir(dir)
        let path = dir.appendingPathComponent("text_\(setId).txt")
        try? text.write(to: path, atomically: true, encoding: .utf8)
    }

    static func getCachedLyricText(songId: String, setId: String) -> String? {
        let path = songDir(songId).appendingPathComponent("text_\(setId).txt")
        return try? String(contentsOf: path, encoding: .utf8)
    }

    // MARK: - Colors

    static func cacheColors(songId: String, setId: String, colorMap: [String: Any]) {
        let dir = songDir(songId)
        ensureDir(dir)
        let path = dir.appendingPathComponent("colors_\(setId).json")
        if let data = try? JSONSerialization.data(withJSONObject: colorMap) {
            try? data.write(to: path)
        }
    }

    static func getCachedColors(songId: String, setId: String) -> [String: Any]? {
        let path = songDir(songId).appendingPathComponent("colors_\(setId).json")
        guard let data = try? Data(contentsOf: path),
              let map = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return map
    }

    // MARK: - Legend

    static func cacheLegend(songId: String, legend: [String: Any]) {
        let dir = songDir(songId)
        ensureDir(dir)
        let path = dir.appendingPathComponent("legend.json")
        if let data = try? JSONSerialization.data(withJSONObject: legend) {
            try? data.write(to: path)
        }
    }

    static func getCachedLegend(songId: String) -> [String: Any]? {
        let path = songDir(songId).appendingPathComponent("legend.json")
        guard let data = try? Data(contentsOf: path),
              let legend = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return legend
    }

    // MARK: - Cache all lyrics for a song

    static func cacheAllLyricsForSong(songId: String) async throws {
        let setsResponse = try await APIClient.shared.getLyricSets(songId)
        let sets = setsResponse.sets
        guard !sets.isEmpty else { return }

        let setsDict = sets.map { s -> [String: Any] in
            ["id": s.id, "label": s.label, "position": s.position]
        }
        cacheLyricSets(songId: songId, sets: setsDict)

        await withTaskGroup(of: Void.self) { group in
            for s in sets {
                group.addTask {
                    if let textResponse = try? await APIClient.shared.getLyricSetText(songId, setId: s.id) {
                        cacheLyricText(songId: songId, setId: s.id, text: textResponse.lyrics)
                    }
                    if let colors = try? await APIClient.shared.getSetColors(songId, setId: s.id) {
                        cacheColors(songId: songId, setId: s.id, colorMap: colors)
                    }
                }
            }
        }

        if let legend = try? await APIClient.shared.getLegend(songId) {
            cacheLegend(songId: songId, legend: legend)
        }
    }
}
