import SwiftUI

struct CoverImageView: View {
    @Environment(DataViewModel.self) private var data

    let songId: String?
    let imageKey: String
    let imageUrl: String?
    let size: CGFloat

    @State private var localURL: URL?
    @State private var loaded = false

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: AppRadius.md)
            .fill(AppColors.surface2)
            .frame(width: size, height: size)
            .overlay {
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.3))
                    .foregroundStyle(AppColors.textMuted)
            }
    }

    var body: some View {
        Group {
            if let localURL {
                AsyncImage(url: localURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                            .frame(width: size, height: size)
                            .clipped()
                    default:
                        placeholder
                    }
                }
            } else if !data.online || imageUrl == nil {
                placeholder
            } else {
                let fullUrl = buildFullUrl()
                AsyncImage(url: URL(string: fullUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                            .frame(width: size, height: size)
                            .clipped()
                            .onAppear { cacheImage(fullUrl) }
                    case .failure:
                        placeholder
                    default:
                        placeholder
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .task {
            resolveLocal()
        }
        .id("\(imageKey)_\(data.imgVersion)")
    }

    private func resolveLocal() {
        if let songId {
            localURL = StorageManager.getLocalCoverURL(songId: songId)
        } else {
            localURL = StorageManager.getLocalImageURL(imageKey)
        }
    }

    private func buildFullUrl() -> String {
        guard let imageUrl else { return "" }
        if imageUrl.hasPrefix("http") { return imageUrl }
        let base = UserDefaults.standard.string(forKey: "mp_server_url") ?? ""
        return "\(base)\(imageUrl)"
    }

    private func cacheImage(_ urlString: String) {
        Task {
            if let songId {
                try? await StorageManager.downloadCover(songId: songId)
            } else {
                try? await StorageManager.downloadImageByKey(imageKey, remoteUrl: urlString)
            }
        }
    }
}
