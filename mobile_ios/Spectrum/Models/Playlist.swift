import Foundation

struct Playlist: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var name: String
    var createdAt: String?
    var songCount: Int
    var coverUrl: String?
    var isWrapped: Bool?
    var songs: [Song]?

    enum CodingKeys: String, CodingKey {
        case id, name, songs
        case createdAt = "created_at"
        case songCount = "song_count"
        case coverUrl = "cover_url"
        case isWrapped = "is_wrapped"
    }
}
