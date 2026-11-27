import Foundation

struct Artist: Codable, Identifiable, Equatable, Hashable {
    var id: String { name }
    let name: String
    var imagePath: String?
    var imageUrl: String?
    var imagePosition: String?
    var imagePositionMobile: String?
    var createdAt: String?
    var songCount: Int

    enum CodingKeys: String, CodingKey {
        case name
        case imagePath = "image_path"
        case imageUrl = "image_url"
        case imagePosition = "image_position"
        case imagePositionMobile = "image_position_mobile"
        case createdAt = "created_at"
        case songCount = "song_count"
    }
}
