import Foundation

struct AnalyticsData: Codable {
    var topSongs: [TopSong]
    var topArtists: [TopArtist]
    var totalListeningTime: Double
    var totalPlays: Int
    var recommendations: [Song]
    var playHistory: [DayPlay]

    enum CodingKeys: String, CodingKey {
        case topSongs = "top_songs"
        case topArtists = "top_artists"
        case totalListeningTime = "total_listening_time"
        case totalPlays = "total_plays"
        case recommendations
        case playHistory = "play_history"
    }
}

struct TopSong: Codable, Identifiable {
    var id: String { songId }
    let songId: String
    let title: String
    let artist: String?
    let playCount: Int
    let totalTime: Double

    enum CodingKeys: String, CodingKey {
        case songId = "song_id"
        case title, artist
        case playCount = "play_count"
        case totalTime = "total_time"
    }
}

struct TopArtist: Codable, Identifiable {
    var id: String { artist }
    let artist: String
    let playCount: Int
    let totalTime: Double

    enum CodingKeys: String, CodingKey {
        case artist
        case playCount = "play_count"
        case totalTime = "total_time"
    }
}

struct DayPlay: Codable, Identifiable {
    var id: String { date }
    let date: String
    let plays: Int
    let time: Double
}

struct WrappedAnalytics: Codable {
    let year: Int
    var topSongs: [TopSong]
    var topArtists: [TopArtist]
    var totalPlays: Int
    var totalListeningTime: Double

    enum CodingKeys: String, CodingKey {
        case year
        case topSongs = "top_songs"
        case topArtists = "top_artists"
        case totalPlays = "total_plays"
        case totalListeningTime = "total_listening_time"
    }
}
