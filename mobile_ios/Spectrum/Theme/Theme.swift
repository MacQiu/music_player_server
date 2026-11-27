import SwiftUI

enum AppColors {
    static let bg = Color(red: 0.071, green: 0.071, blue: 0.071)           // #121212
    static let surface = Color(red: 0.094, green: 0.094, blue: 0.094)      // #181818
    static let surface2 = Color(red: 0.157, green: 0.157, blue: 0.157)     // #282828
    static let surface3 = Color(red: 0.2, green: 0.2, blue: 0.2)           // #333333
    static let accent = Color(red: 0.114, green: 0.725, blue: 0.329)       // #1DB954
    static let accentHover = Color(red: 0.118, green: 0.843, blue: 0.376)  // #1ED760
    static let text = Color.white
    static let textMuted = Color(red: 0.702, green: 0.702, blue: 0.702)    // #B3B3B3
    static let danger = Color(red: 0.937, green: 0.267, blue: 0.267)       // #EF4444
    static let success = Color(red: 0.114, green: 0.725, blue: 0.329)      // #1DB954
    static let border = Color.white.opacity(0.1)
}

enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
}

enum AppRadius {
    static let sm: CGFloat = 4
    static let md: CGFloat = 8
    static let lg: CGFloat = 10
    static let round: CGFloat = 999
}

enum AppFont {
    static let xs: CGFloat = 11
    static let sm: CGFloat = 12
    static let md: CGFloat = 14
    static let lg: CGFloat = 16
    static let xl: CGFloat = 18
    static let xxl: CGFloat = 22
    static let title: CGFloat = 24
}

enum SingerColors {
    static let palette: [(name: String, color: Color)] = [
        ("red", Color(red: 1, green: 0.231, blue: 0.188)),
        ("maroon", Color(red: 0.69, green: 0.188, blue: 0.188)),
        ("orange", Color(red: 1, green: 0.584, blue: 0.188)),
        ("yellow", Color(red: 1, green: 0.878, blue: 0.275)),
        ("lime green", Color(red: 0.475, green: 0.878, blue: 0.318)),
        ("forest green", Color(red: 0.188, green: 0.627, blue: 0.318)),
        ("teal", Color(red: 0.188, green: 0.753, blue: 0.651)),
        ("cyan", Color(red: 0.275, green: 0.816, blue: 0.941)),
        ("blue", Color(red: 0.318, green: 0.506, blue: 1)),
        ("navy blue", Color(red: 0.188, green: 0.275, blue: 0.69)),
        ("magenta", Color(red: 0.941, green: 0.318, blue: 0.627)),
        ("purple", Color(red: 0.627, green: 0.318, blue: 0.878)),
        ("violet", Color(red: 0.753, green: 0.506, blue: 1)),
        ("peach", Color(red: 1, green: 0.753, blue: 0.627)),
        ("light grey", Color(red: 0.784, green: 0.784, blue: 0.784)),
    ]

    static func color(for name: String) -> Color {
        palette.first(where: { $0.name == name })?.color ?? .white
    }
}

extension View {
    func cardStyle() -> some View {
        self
            .background(AppColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
    }
}

func formatDuration(_ seconds: Double?) -> String {
    guard let seconds, seconds.isFinite, seconds > 0 else { return "0:00" }
    let mins = Int(seconds) / 60
    let secs = Int(seconds) % 60
    return "\(mins):\(String(format: "%02d", secs))"
}

func formatListeningTime(_ seconds: Double) -> String {
    let hours = Int(seconds) / 3600
    let mins = (Int(seconds) % 3600) / 60
    if hours > 0 {
        return "\(hours)h \(mins)m"
    }
    return "\(mins)m"
}
