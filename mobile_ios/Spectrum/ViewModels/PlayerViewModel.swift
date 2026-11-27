import Foundation
import Combine

enum RepeatMode: String { case none, playlist, song }

@Observable
final class PlayerViewModel {
    // MARK: - State
    var playing = false
    var currentTime: Double = 0
    var duration: Double = 0
    var currentSong: Song?
    var sourceList: [Song] = []
    var sourceIndex: Int = -1
    var manualQueue: [Song] = []
    var repeatMode: RepeatMode = .none
    var shuffleEnabled = false

    private let engine = AudioEngine()
    private var logTimer: Timer?
    private var loggedTime: Double = 0
    private var shouldAutoPlay = false
    private var originalSource: [Song]?
    private var resumed = false
    private var saveTimer: Timer?

    private let resumeKey = "mp_resume"

    init() {
        engine.didFinish = { [weak self] in
            self?.handleSongEnd()
        }
        startObservingEngine()
    }

    private func startObservingEngine() {
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.playing = self.engine.isPlaying
            self.currentTime = self.engine.currentTime
            self.duration = self.engine.duration
        }
    }

    // MARK: - Song loading

    private func loadSong(_ song: Song, autoPlay: Bool, seekTo: Double? = nil) {
        loggedTime = 0

        Task {
            let url = await StorageManager.getPlayableURL(songId: song.id, filePath: song.filePath)
            await MainActor.run {
                engine.loop = repeatMode == .song
                engine.replace(url: url, autoPlay: autoPlay, seekTo: seekTo)
                updateNowPlayingInfo(song: song)
            }
        }

        startLogTimer()
        startSaveTimer()
    }

    private func updateNowPlayingInfo(song: Song) {
        Task {
            var artworkData: Data?
            if song.coverUrl != nil {
                let coverUrl = await APIClient.shared.getCoverUrl(song.id)
                artworkData = try? await APIClient.shared.downloadData(from: coverUrl)
            }
            await MainActor.run {
                engine.updateNowPlayingInfo(
                    title: song.title,
                    artist: song.artist ?? "Unknown",
                    album: song.album ?? "",
                    duration: song.duration ?? 0,
                    artworkData: artworkData
                )
            }
        }
    }

    // MARK: - Play log interval

    private func startLogTimer() {
        logTimer?.invalidate()
        logTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.sendLog()
        }
    }

    private func sendLog() {
        guard let song = currentSong else { return }
        let elapsed = currentTime - loggedTime
        if elapsed >= 5 {
            PlaylogQueue.enqueue(songId: song.id, duration: elapsed)
            loggedTime = currentTime
        }
    }

    // MARK: - Resume persistence

    private func startSaveTimer() {
        saveTimer?.invalidate()
        saveTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            self?.saveResume()
        }
    }

    private func saveResume() {
        guard let song = currentSong else { return }
        let dict: [String: Any] = ["songId": song.id, "position": currentTime]
        if let data = try? JSONSerialization.data(withJSONObject: dict) {
            UserDefaults.standard.set(data, forKey: resumeKey)
        }
    }

    func restoreResume(songs: [Song]) {
        guard !resumed, !songs.isEmpty else { return }
        resumed = true

        guard let data = UserDefaults.standard.data(forKey: resumeKey),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let songId = dict["songId"] as? String,
              let position = dict["position"] as? Double,
              let song = songs.first(where: { $0.id == songId }) else { return }

        currentSong = song
        sourceList = songs
        sourceIndex = songs.firstIndex(where: { $0.id == songId }) ?? 0
        shouldAutoPlay = false
        loadSong(song, autoPlay: false, seekTo: position)
    }

    // MARK: - Actions

    func playSong(_ song: Song, contextSongs: [Song]? = nil) {
        let list = contextSongs ?? sourceList
        let idx = list.firstIndex(where: { $0.id == song.id }) ?? 0
        sourceList = list
        sourceIndex = idx
        currentSong = song
        manualQueue = []
        if contextSongs != nil {
            shuffleEnabled = false
            originalSource = nil
        }
        shouldAutoPlay = true
        loadSong(song, autoPlay: true)
    }

    func toggle() {
        engine.togglePlayPause()
    }

    func seek(_ time: Double) {
        engine.seek(to: time)
    }

    func playNext() {
        sendLog()
        playNextInner()
    }

    func playPrevious() {
        if currentTime > 3 {
            seek(0)
            return
        }
        if sourceIndex > 0 {
            let prevIdx = sourceIndex - 1
            sourceIndex = prevIdx
            currentSong = sourceList[prevIdx]
            shouldAutoPlay = true
            loadSong(sourceList[prevIdx], autoPlay: true)
        }
    }

    func addToQueue(_ song: Song) {
        manualQueue.append(song)
    }

    func removeFromQueue(at index: Int) {
        guard manualQueue.indices.contains(index) else { return }
        manualQueue.remove(at: index)
    }

    func reorderQueue(from: Int, to: Int) {
        guard manualQueue.indices.contains(from) else { return }
        let item = manualQueue.remove(at: from)
        manualQueue.insert(item, at: min(to, manualQueue.count))
    }

    func toggleRepeat() {
        switch repeatMode {
        case .none: repeatMode = .playlist
        case .playlist: repeatMode = .song
        case .song: repeatMode = .none
        }
        engine.loop = repeatMode == .song
    }

    func toggleShuffle() {
        if !shuffleEnabled {
            originalSource = sourceList
            let before = Array(sourceList.prefix(through: sourceIndex))
            var after = Array(sourceList.suffix(from: sourceIndex + 1))
            after.shuffle()
            sourceList = before + after
        } else {
            if let orig = originalSource {
                sourceList = orig
                sourceIndex = orig.firstIndex(where: { $0.id == currentSong?.id }) ?? 0
                originalSource = nil
            }
        }
        shuffleEnabled.toggle()
    }

    func jumpToQueueIndex(_ index: Int, section: String) {
        switch section {
        case "above":
            sourceIndex = index
            currentSong = sourceList[index]
        case "manual":
            let song = manualQueue[index]
            manualQueue.remove(at: index)
            currentSong = song
        case "below":
            let actualIdx = sourceIndex + 1 + index
            sourceIndex = actualIdx
            currentSong = sourceList[actualIdx]
        default: break
        }
        shouldAutoPlay = true
        if let song = currentSong {
            loadSong(song, autoPlay: true)
        }
    }

    // MARK: - Queue logic

    private func handleSongEnd() {
        sendLog()
        if repeatMode == .song { return }
        playNextInner()
    }

    private func playNextInner() {
        if !manualQueue.isEmpty {
            let next = manualQueue.removeFirst()
            currentSong = next
            shouldAutoPlay = true
            loadSong(next, autoPlay: true)
            return
        }

        let nextIdx = sourceIndex + 1
        if nextIdx < sourceList.count {
            sourceIndex = nextIdx
            currentSong = sourceList[nextIdx]
            shouldAutoPlay = true
            loadSong(sourceList[nextIdx], autoPlay: true)
        } else if repeatMode == .playlist, !sourceList.isEmpty {
            sourceIndex = 0
            currentSong = sourceList[0]
            shouldAutoPlay = true
            loadSong(sourceList[0], autoPlay: true)
        } else {
            playing = false
        }
    }
}
