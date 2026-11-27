import Foundation

struct PlaylogQueue {
    private static let queueKey = "mp_playlog_queue"

    private static func getQueue() -> [PlaylogEntry] {
        guard let data = UserDefaults.standard.data(forKey: queueKey),
              let queue = try? JSONDecoder().decode([PlaylogEntry].self, from: data) else {
            return []
        }
        return queue
    }

    private static func saveQueue(_ queue: [PlaylogEntry]) {
        if let data = try? JSONEncoder().encode(queue) {
            UserDefaults.standard.set(data, forKey: queueKey)
        }
    }

    static func enqueue(songId: String, duration: Double) {
        var queue = getQueue()
        queue.append(PlaylogEntry(songId: songId, duration: duration))
        saveQueue(queue)
    }

    static func flushQueue() async throws -> Int {
        let queue = getQueue()
        guard !queue.isEmpty else { return 0 }

        let batch = Array(queue.prefix(50))
        _ = try await APIClient.shared.syncLogs(batch)
        let remaining = Array(queue.dropFirst(batch.count))
        saveQueue(remaining)
        return batch.count
    }

    static func flushAll() async {
        var flushed = 1
        while flushed > 0 {
            flushed = (try? await flushQueue()) ?? 0
        }
    }

    static func queueSize() -> Int {
        getQueue().count
    }
}
