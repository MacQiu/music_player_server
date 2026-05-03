import Foundation

actor APIClient {
    static let shared = APIClient()

    private let serverKey = "mp_server_url"
    private let timeout: TimeInterval = 3
    private var baseUrl: String = ""
    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 3
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)
        self.baseUrl = UserDefaults.standard.string(forKey: serverKey) ?? ""
    }

    func loadServerUrl() -> String {
        baseUrl = UserDefaults.standard.string(forKey: serverKey) ?? ""
        return baseUrl
    }

    func saveServerUrl(_ url: String) {
        let trimmed = url.replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        baseUrl = trimmed
        UserDefaults.standard.set(trimmed, forKey: serverKey)
    }

    func getBaseUrl() -> String { baseUrl }

    // MARK: - Generic request

    private func request<T: Decodable>(_ method: String, _ path: String, body: Data? = nil, isFormData: Bool = false, boundary: String? = nil) async throws -> T {
        guard let url = URL(string: "\(baseUrl)\(path)") else {
            throw APIError.invalidURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = timeout

        if let body {
            req.httpBody = body
            if isFormData, let boundary {
                req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            } else {
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
        }

        let (data, response) = try await session.data(for: req)

        guard let http = response as? HTTPURLResponse else {
            throw APIError.requestFailed("No HTTP response")
        }

        guard http.statusCode >= 200, http.statusCode < 300 else {
            if let errBody = try? JSONDecoder().decode([String: String].self, from: data),
               let msg = errBody["error"] {
                throw APIError.requestFailed(msg)
            }
            throw APIError.requestFailed("Request failed (\(http.statusCode))")
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func requestRaw(_ method: String, _ path: String, body: Data? = nil, isFormData: Bool = false, boundary: String? = nil) async throws -> [String: Any] {
        guard let url = URL(string: "\(baseUrl)\(path)") else {
            throw APIError.invalidURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = timeout

        if let body {
            req.httpBody = body
            if isFormData, let boundary {
                req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            } else {
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
        }

        let (data, response) = try await session.data(for: req)

        guard let http = response as? HTTPURLResponse else {
            throw APIError.requestFailed("No HTTP response")
        }

        guard http.statusCode >= 200, http.statusCode < 300 else {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = json["error"] as? String {
                throw APIError.requestFailed(msg)
            }
            throw APIError.requestFailed("Request failed (\(http.statusCode))")
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return json
    }

    // MARK: - Multipart helper

    private func multipartData(boundary: String, fields: [(String, String)] = [], files: [(name: String, filename: String, mime: String, data: Data)] = []) -> Data {
        var body = Data()
        let crlf = "\r\n"

        for (key, value) in fields {
            body.append("--\(boundary)\(crlf)".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\(crlf)\(crlf)".data(using: .utf8)!)
            body.append("\(value)\(crlf)".data(using: .utf8)!)
        }

        for file in files {
            body.append("--\(boundary)\(crlf)".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(file.name)\"; filename=\"\(file.filename)\"\(crlf)".data(using: .utf8)!)
            body.append("Content-Type: \(file.mime)\(crlf)\(crlf)".data(using: .utf8)!)
            body.append(file.data)
            body.append(crlf.data(using: .utf8)!)
        }

        body.append("--\(boundary)--\(crlf)".data(using: .utf8)!)
        return body
    }

    // MARK: - Core

    func ping() async throws -> [String: Any] {
        try await requestRaw("GET", "/ping")
    }

    func getSongs() async throws -> [Song] {
        try await request("GET", "/songs")
    }

    func uploadSong(audioData: Data, fileName: String, mimeType: String, metadata: [String: String] = [:], coverData: Data? = nil, coverName: String? = nil) async throws -> [String: Any] {
        let boundary = UUID().uuidString
        var fields: [(String, String)] = []
        if let t = metadata["title"] { fields.append(("title", t)) }
        if let a = metadata["artist"] { fields.append(("artist", a)) }
        if let al = metadata["album"] { fields.append(("album", al)) }

        var files: [(name: String, filename: String, mime: String, data: Data)] = [
            (name: "file", filename: fileName, mime: mimeType, data: audioData)
        ]
        if let coverData, let coverName {
            files.append((name: "cover", filename: coverName, mime: "image/jpeg", data: coverData))
        }

        let body = multipartData(boundary: boundary, fields: fields, files: files)
        return try await requestRaw("POST", "/upload", body: body, isFormData: true, boundary: boundary)
    }

    func reorderLibrary(songIds: [String]) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: ["song_ids": songIds])
        return try await requestRaw("PUT", "/songs/order", body: body)
    }

    func deleteSong(_ songId: String) async throws -> [String: Any] {
        try await requestRaw("DELETE", "/songs/\(songId)")
    }

    func getDownloadUrl(_ songId: String) -> String {
        "\(baseUrl)/download/\(songId)"
    }

    // MARK: - Cover images

    func getCoverUrl(_ songId: String) -> String {
        "\(baseUrl)/covers/\(songId)"
    }

    func uploadCover(songId: String, imageData: Data, imageName: String) async throws -> [String: Any] {
        let boundary = UUID().uuidString
        let body = multipartData(boundary: boundary, files: [
            (name: "cover", filename: imageName, mime: "image/jpeg", data: imageData)
        ])
        return try await requestRaw("POST", "/songs/\(songId)/cover", body: body, isFormData: true, boundary: boundary)
    }

    func deleteCoverFile(_ filename: String) async throws -> [String: Any] {
        let encoded = filename.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? filename
        return try await requestRaw("DELETE", "/covers/file/\(encoded)")
    }

    // MARK: - Artists

    func getArtists() async throws -> [Artist] {
        try await request("GET", "/artists")
    }

    func getArtistImageUrl(_ name: String) -> String {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        return "\(baseUrl)/artist-image/\(encoded)"
    }

    func uploadArtistImage(name: String, imageData: Data, imageName: String) async throws -> [String: Any] {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let boundary = UUID().uuidString
        let body = multipartData(boundary: boundary, files: [
            (name: "image", filename: imageName, mime: "image/jpeg", data: imageData)
        ])
        return try await requestRaw("POST", "/artists/\(encoded)/image", body: body, isFormData: true, boundary: boundary)
    }

    // MARK: - Playlists

    func getPlaylists() async throws -> [Playlist] {
        try await request("GET", "/playlists")
    }

    func createPlaylist(name: String) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: ["name": name])
        return try await requestRaw("POST", "/playlists", body: body)
    }

    func getPlaylist(_ playlistId: String) async throws -> Playlist {
        try await request("GET", "/playlists/\(playlistId)")
    }

    func updatePlaylist(_ playlistId: String, name: String) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: ["name": name])
        return try await requestRaw("PUT", "/playlists/\(playlistId)", body: body)
    }

    func deletePlaylist(_ playlistId: String) async throws -> [String: Any] {
        try await requestRaw("DELETE", "/playlists/\(playlistId)")
    }

    func addSongToPlaylist(_ playlistId: String, songId: String) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: ["song_id": songId])
        return try await requestRaw("POST", "/playlists/\(playlistId)/songs", body: body)
    }

    func removeSongFromPlaylist(_ playlistId: String, songId: String) async throws -> [String: Any] {
        try await requestRaw("DELETE", "/playlists/\(playlistId)/songs/\(songId)")
    }

    func reorderPlaylistSongs(_ playlistId: String, songIds: [String]) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: ["song_ids": songIds])
        return try await requestRaw("PUT", "/playlists/\(playlistId)/songs", body: body)
    }

    // MARK: - Play logs

    func postPlaylog(songId: String, duration: Double) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: [
            "song_id": songId,
            "duration": duration,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ] as [String: Any])
        return try await requestRaw("POST", "/playlog", body: body)
    }

    func syncLogs(_ logs: [PlaylogEntry]) async throws -> [String: Any] {
        let encoded = try JSONEncoder().encode(["logs": logs])
        return try await requestRaw("POST", "/sync", body: encoded)
    }

    // MARK: - Analytics

    func getAnalytics() async throws -> AnalyticsData {
        try await request("GET", "/analytics")
    }

    func getWrappedAnalytics(year: Int) async throws -> WrappedAnalytics {
        try await request("GET", "/analytics/wrapped?year=\(year)")
    }

    // MARK: - Lyrics

    struct LyricSetsResponse: Codable {
        let sets: [LyricSet]
    }

    struct LyricSet: Codable, Identifiable {
        let id: String
        let label: String
        let position: Int
    }

    struct LyricTextResponse: Codable {
        let songId: String?
        let setId: String?
        let lyrics: String

        enum CodingKeys: String, CodingKey {
            case songId = "song_id"
            case setId = "set_id"
            case lyrics
        }
    }

    func getLyricSets(_ songId: String) async throws -> LyricSetsResponse {
        try await request("GET", "/lyrics/\(songId)")
    }

    func getLyricSetText(_ songId: String, setId: String) async throws -> LyricTextResponse {
        try await request("GET", "/lyrics/\(songId)/\(setId)")
    }

    func createLyricSet(songId: String, label: String, lyrics: String, autoSyncFrom: String? = nil) async throws -> [String: Any] {
        var dict: [String: Any] = ["label": label, "lyrics": lyrics]
        if let autoSyncFrom { dict["auto_sync_from"] = autoSyncFrom }
        let body = try JSONSerialization.data(withJSONObject: dict)
        return try await requestRaw("POST", "/lyrics/\(songId)", body: body)
    }

    func updateLyricSet(songId: String, setId: String, lyrics: String? = nil, label: String? = nil) async throws -> [String: Any] {
        var dict: [String: Any] = [:]
        if let lyrics { dict["lyrics"] = lyrics }
        if let label { dict["label"] = label }
        let body = try JSONSerialization.data(withJSONObject: dict)
        return try await requestRaw("PUT", "/lyrics/\(songId)/\(setId)", body: body)
    }

    func deleteLyricSet(songId: String, setId: String) async throws -> [String: Any] {
        try await requestRaw("DELETE", "/lyrics/\(songId)/\(setId)")
    }

    func getSetColors(_ songId: String, setId: String) async throws -> [String: Any] {
        try await requestRaw("GET", "/lyrics/\(songId)/\(setId)/colors")
    }

    func saveSetColors(_ songId: String, setId: String, colorMap: [String: Any]) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: colorMap)
        return try await requestRaw("PUT", "/lyrics/\(songId)/\(setId)/colors", body: body)
    }

    func getLegend(_ songId: String) async throws -> [String: Any] {
        try await requestRaw("GET", "/lyrics/\(songId)/legend")
    }

    func saveLegend(_ songId: String, legend: [String: Any]) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: legend)
        return try await requestRaw("PUT", "/lyrics/\(songId)/legend", body: body)
    }

    // MARK: - Download flag

    func toggleDownload(songId: String, downloaded: Bool) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: ["downloaded": downloaded])
        return try await requestRaw("PUT", "/songs/\(songId)/download", body: body)
    }

    // MARK: - Wrapped

    func createWrappedPlaylist(year: Int) async throws -> [String: Any] {
        try await requestRaw("POST", "/wrapped/\(year)/playlist")
    }

    // MARK: - Download data

    func downloadData(from urlString: String) async throws -> Data {
        guard let url = URL(string: urlString) else { throw APIError.invalidURL }
        let (data, _) = try await session.data(from: url)
        return data
    }
}

enum APIError: LocalizedError {
    case invalidURL
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .requestFailed(let msg): return msg
        }
    }
}
