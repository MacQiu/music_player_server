import Foundation

struct PlaylogEntry: Codable {
    let id: String
    let songId: String
    let duration: Double
    let timestamp: String

    enum CodingKeys: String, CodingKey {
        case id
        case songId = "song_id"
        case duration, timestamp
    }

    init(songId: String, duration: Double) {
        self.id = UUID().uuidString.lowercased()
        self.songId = songId
        self.duration = duration
        self.timestamp = ISO8601DateFormatter().string(from: Date())
    }
}
