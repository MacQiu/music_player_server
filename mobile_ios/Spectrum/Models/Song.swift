import Foundation

struct Song: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var title: String
    var artist: String?
    var album: String?
    var duration: Double?
    var filePath: String?
    var coverPath: String?
    var coverUrl: String?
    var sortOrder: Int?
    var downloaded: Int?
    var dateAdded: String?
    var playCount: Int?
    var totalTime: Double?
    var position: Int?

    var isDownloaded: Bool { (downloaded ?? 0) != 0 }

    enum CodingKeys: String, CodingKey {
        case id, title, artist, album, duration, position
        case filePath = "file_path"
        case coverPath = "cover_path"
        case coverUrl = "cover_url"
        case sortOrder = "sort_order"
        case downloaded
        case dateAdded = "date_added"
        case playCount = "play_count"
        case totalTime = "total_time"
    }
}
