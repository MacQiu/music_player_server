import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct UploadView: View {
    @Environment(DataViewModel.self) private var data
    @Environment(\.dismiss) private var dismiss

    @State private var audioData: Data?
    @State private var audioName = ""
    @State private var coverData: Data?
    @State private var coverName = ""
    @State private var title = ""
    @State private var artist = ""
    @State private var album = ""
    @State private var uploading = false
    @State private var statusMessage = ""
    @State private var isError = false
    @State private var showFilePicker = false
    @State private var selectedPhoto: PhotosPickerItem?

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xxl) {
                Text("Upload Song")
                    .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                    .foregroundStyle(AppColors.text)
                    .frame(maxWidth: .infinity, alignment: .leading)

                // Audio file picker
                Button { showFilePicker = true } label: {
                    HStack {
                        Image(systemName: audioData != nil ? "checkmark.circle.fill" : "doc.fill")
                            .foregroundStyle(audioData != nil ? AppColors.success : AppColors.textMuted)
                        Text(audioData != nil ? audioName : "Select Audio File")
                            .foregroundStyle(AppColors.text)
                        Spacer()
                    }
                    .padding(Spacing.lg)
                    .cardStyle()
                }

                // Cover image picker
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    HStack {
                        if let coverData, let image = UIImage(data: coverData) {
                            Image(uiImage: image)
                                .resizable()
                                .frame(width: 40, height: 40)
                                .clipShape(RoundedRectangle(cornerRadius: AppRadius.sm))
                        } else {
                            Image(systemName: "photo")
                                .foregroundStyle(AppColors.textMuted)
                                .frame(width: 40, height: 40)
                        }
                        Text(coverData != nil ? coverName : "Select Cover Image (Optional)")
                            .foregroundStyle(AppColors.text)
                        Spacer()
                    }
                    .padding(Spacing.lg)
                    .cardStyle()
                }

                // Metadata fields
                VStack(spacing: Spacing.md) {
                    metadataField("Title", text: $title)
                    metadataField("Artist", text: $artist)
                    metadataField("Album", text: $album)
                }

                // Upload button
                Button(action: upload) {
                    HStack {
                        if uploading {
                            ProgressView().tint(.white).scaleEffect(0.8)
                        }
                        Text(uploading ? "Uploading..." : "Upload")
                            .font(.system(size: AppFont.lg, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(audioData != nil ? AppColors.accent : AppColors.surface3)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
                }
                .disabled(audioData == nil || uploading)

                if !statusMessage.isEmpty {
                    Text(statusMessage)
                        .font(.system(size: AppFont.sm))
                        .foregroundStyle(isError ? AppColors.danger : AppColors.success)
                }
            }
            .padding(Spacing.lg)
        }
        .background(AppColors.bg)
        .navigationTitle("Upload")
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.audio, .mp3, UTType("public.mpeg-4-audio") ?? .audio]) { result in
            switch result {
            case .success(let url):
                guard url.startAccessingSecurityScopedResource() else { return }
                defer { url.stopAccessingSecurityScopedResource() }
                audioData = try? Data(contentsOf: url)
                audioName = url.lastPathComponent
            case .failure:
                break
            }
        }
        .onChange(of: selectedPhoto) { _, newValue in
            loadCoverImage(newValue)
        }
    }

    private func metadataField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .font(.system(size: AppFont.md))
            .foregroundStyle(AppColors.text)
            .padding(Spacing.md)
            .background(AppColors.surface2)
            .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
    }

    private func loadCoverImage(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            if let data = try? await item.loadTransferable(type: Data.self) {
                coverData = data
                coverName = "cover.jpg"
            }
        }
    }

    private func upload() {
        guard let audioData else { return }
        uploading = true
        statusMessage = ""

        var metadata: [String: String] = [:]
        if !title.isEmpty { metadata["title"] = title }
        if !artist.isEmpty { metadata["artist"] = artist }
        if !album.isEmpty { metadata["album"] = album }

        let mime = audioName.hasSuffix(".wav") ? "audio/wav" : "audio/mpeg"

        Task {
            do {
                _ = try await APIClient.shared.uploadSong(
                    audioData: audioData,
                    fileName: audioName,
                    mimeType: mime,
                    metadata: metadata,
                    coverData: coverData,
                    coverName: coverData != nil ? coverName : nil
                )
                await data.refreshSongs()
                await MainActor.run {
                    uploading = false
                    statusMessage = "Upload successful!"
                    isError = false
                    self.audioData = nil
                    audioName = ""
                    self.coverData = nil
                    coverName = ""
                    self.title = ""
                    self.artist = ""
                    self.album = ""
                }
            } catch {
                await MainActor.run {
                    uploading = false
                    statusMessage = "Upload failed: \(error.localizedDescription)"
                    isError = true
                }
            }
        }
    }
}
