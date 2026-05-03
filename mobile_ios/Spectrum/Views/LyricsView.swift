import SwiftUI

struct LRCLine: Identifiable {
    let id = UUID()
    let time: Double
    let text: String
}

struct LyricsView: View {
    @Environment(PlayerViewModel.self) private var player
    @Environment(DataViewModel.self) private var data
    @Environment(\.dismiss) private var dismiss

    @State private var sets: [APIClient.LyricSet] = []
    @State private var activeSetId: String?
    @State private var lyricsText = ""
    @State private var lines: [LRCLine] = []
    @State private var colorMap: [String: Any] = [:]
    @State private var legend: [String: String] = [:]
    @State private var showLegend = false
    @State private var isEditing = false
    @State private var editText = ""
    @State private var loading = true

    private var currentLineIndex: Int {
        guard !lines.isEmpty else { return -1 }
        let t = player.currentTime
        var idx = -1
        for (i, line) in lines.enumerated() {
            if t >= line.time { idx = i }
            else { break }
        }
        return idx
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Set tabs
                if sets.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.sm) {
                            ForEach(sets) { set in
                                Button {
                                    activeSetId = set.id
                                    Task { await loadSetText(set.id) }
                                } label: {
                                    Text(set.label)
                                        .font(.system(size: AppFont.sm, weight: .medium))
                                        .padding(.horizontal, Spacing.md)
                                        .padding(.vertical, Spacing.sm)
                                        .background(activeSetId == set.id ? AppColors.accent : AppColors.surface2)
                                        .foregroundStyle(activeSetId == set.id ? .white : AppColors.text)
                                        .clipShape(Capsule())
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.sm)
                    }
                }

                if loading {
                    Spacer()
                    ProgressView().tint(AppColors.accent)
                    Spacer()
                } else if isEditing {
                    editorView
                } else if lines.isEmpty {
                    Spacer()
                    Text("No lyrics available")
                        .font(.system(size: AppFont.lg))
                        .foregroundStyle(AppColors.textMuted)
                    Spacer()
                } else {
                    // Synced lyrics display
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: Spacing.sm) {
                                ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
                                    let isActive = index == currentLineIndex
                                    let lineColor = colorForLine(index)

                                    Text(line.text)
                                        .font(.system(size: isActive ? AppFont.xxl : AppFont.lg, weight: isActive ? .bold : .regular, design: .rounded))
                                        .foregroundStyle(lineColor ?? (isActive ? AppColors.text : AppColors.textMuted))
                                        .opacity(isActive ? 1 : 0.6)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.horizontal, Spacing.lg)
                                        .padding(.vertical, Spacing.xs)
                                        .id(index)
                                        .onTapGesture {
                                            player.seek(line.time)
                                        }
                                        .animation(.easeInOut(duration: 0.3), value: isActive)
                                }
                            }
                            .padding(.vertical, Spacing.lg)
                            .padding(.bottom, 100)
                        }
                        .onChange(of: currentLineIndex) { _, newIndex in
                            if newIndex >= 0 {
                                withAnimation {
                                    proxy.scrollTo(newIndex, anchor: .center)
                                }
                            }
                        }
                    }
                }

                // Legend panel
                if showLegend, !legend.isEmpty {
                    legendPanel
                }
            }
            .background(AppColors.bg)
            .navigationTitle(player.currentSong?.title ?? "Lyrics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(AppColors.accent)
                }
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: Spacing.md) {
                        if !legend.isEmpty {
                            Button {
                                showLegend.toggle()
                            } label: {
                                Image(systemName: "person.2.fill")
                                    .foregroundStyle(showLegend ? AppColors.accent : AppColors.textMuted)
                            }
                        }
                        Button {
                            if isEditing {
                                saveEdits()
                            } else {
                                editText = lyricsText
                                isEditing = true
                            }
                        } label: {
                            Image(systemName: isEditing ? "checkmark" : "pencil")
                                .foregroundStyle(AppColors.accent)
                        }
                    }
                }
            }
            .toolbarBackground(AppColors.surface, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .task { await loadLyrics() }
    }

    // MARK: - Editor

    private var editorView: some View {
        VStack(spacing: 0) {
            TextEditor(text: $editText)
                .font(.system(size: AppFont.md, design: .monospaced))
                .foregroundStyle(AppColors.text)
                .scrollContentBackground(.hidden)
                .background(AppColors.surface)
                .padding(Spacing.md)

            HStack {
                Button("Stamp") {
                    stampTimestamp()
                }
                .font(.system(size: AppFont.md, weight: .semibold))
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.sm)
                .background(AppColors.accent)
                .foregroundStyle(.white)
                .clipShape(Capsule())

                Spacer()

                Button("Cancel") {
                    isEditing = false
                }
                .foregroundStyle(AppColors.danger)
            }
            .padding(Spacing.lg)
        }
    }

    // MARK: - Legend panel

    private var legendPanel: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Singers")
                .font(.system(size: AppFont.md, weight: .semibold))
                .foregroundStyle(AppColors.text)

            ForEach(Array(legend.keys.sorted()), id: \.self) { colorName in
                HStack(spacing: Spacing.sm) {
                    Circle()
                        .fill(SingerColors.color(for: colorName))
                        .frame(width: 12, height: 12)
                    Text(legend[colorName] ?? colorName)
                        .font(.system(size: AppFont.sm))
                        .foregroundStyle(AppColors.text)
                }
            }
        }
        .padding(Spacing.lg)
        .background(AppColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
        .padding(.horizontal, Spacing.lg)
        .padding(.bottom, Spacing.sm)
    }

    // MARK: - Data loading

    private func loadLyrics() async {
        guard let song = player.currentSong else { loading = false; return }

        // Try cache first
        if let cachedSets = LyricsCache.getCachedLyricSets(songId: song.id) {
            let decoded = cachedSets.compactMap { dict -> APIClient.LyricSet? in
                guard let id = dict["id"] as? String,
                      let label = dict["label"] as? String,
                      let pos = dict["position"] as? Int else { return nil }
                return APIClient.LyricSet(id: id, label: label, position: pos)
            }
            if !decoded.isEmpty {
                sets = decoded
                activeSetId = decoded.first?.id
                if let setId = activeSetId {
                    if let cached = LyricsCache.getCachedLyricText(songId: song.id, setId: setId) {
                        lyricsText = cached
                        lines = parseLRC(cached)
                    }
                    if let colors = LyricsCache.getCachedColors(songId: song.id, setId: setId) {
                        colorMap = colors
                    }
                }
                if let leg = LyricsCache.getCachedLegend(songId: song.id) as? [String: String] {
                    legend = leg
                }
                loading = false
                return
            }
        }

        // Fetch from server
        guard data.online else { loading = false; return }

        do {
            let response = try await APIClient.shared.getLyricSets(song.id)
            sets = response.sets
            if let first = sets.first {
                activeSetId = first.id
                await loadSetText(first.id)
            }
            if let leg = try? await APIClient.shared.getLegend(song.id) as? [String: String] {
                legend = leg
            }
        } catch {}

        loading = false
    }

    private func loadSetText(_ setId: String) async {
        guard let song = player.currentSong else { return }

        if let cached = LyricsCache.getCachedLyricText(songId: song.id, setId: setId) {
            lyricsText = cached
            lines = parseLRC(cached)
            if let colors = LyricsCache.getCachedColors(songId: song.id, setId: setId) {
                colorMap = colors
            }
            return
        }

        guard data.online else { return }
        do {
            let response = try await APIClient.shared.getLyricSetText(song.id, setId: setId)
            lyricsText = response.lyrics
            lines = parseLRC(response.lyrics)
            if let colors = try? await APIClient.shared.getSetColors(song.id, setId: setId) {
                colorMap = colors
            }
        } catch {}
    }

    // MARK: - LRC Parsing

    private func parseLRC(_ text: String) -> [LRCLine] {
        let pattern = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/
        var result: [LRCLine] = []

        for line in text.components(separatedBy: "\n") {
            if let match = try? pattern.firstMatch(in: line) {
                let mins = Double(match.1) ?? 0
                let secs = Double(match.2) ?? 0
                let ms = Double(match.3) ?? 0
                let msDivisor = (match.3).count == 3 ? 1000.0 : 100.0
                let time = mins * 60 + secs + ms / msDivisor
                let text = String(match.4).trimmingCharacters(in: .whitespaces)
                result.append(LRCLine(time: time, text: text))
            }
        }

        return result.sorted { $0.time < $1.time }
    }

    private func colorForLine(_ index: Int) -> Color? {
        let key = String(index)
        if let colorName = colorMap[key] as? String {
            return SingerColors.color(for: colorName)
        }
        return nil
    }

    // MARK: - Editor actions

    private func stampTimestamp() {
        let time = player.currentTime
        let mins = Int(time) / 60
        let secs = Int(time) % 60
        let centis = Int((time - Double(Int(time))) * 100)
        let stamp = String(format: "[%02d:%02d.%02d]", mins, secs, centis)

        let editLines = editText.components(separatedBy: "\n")
        var stamped = false
        var result: [String] = []

        for line in editLines {
            if !stamped && !line.hasPrefix("[") {
                result.append("\(stamp)\(line)")
                stamped = true
            } else {
                result.append(line)
            }
        }

        editText = result.joined(separator: "\n")
    }

    private func saveEdits() {
        guard let song = player.currentSong, let setId = activeSetId else { return }
        isEditing = false
        lyricsText = editText
        lines = parseLRC(editText)

        Task {
            _ = try? await APIClient.shared.updateLyricSet(songId: song.id, setId: setId, lyrics: editText)
            LyricsCache.cacheLyricText(songId: song.id, setId: setId, text: editText)
        }
    }
}
