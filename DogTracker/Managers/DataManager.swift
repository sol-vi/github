import Foundation
import SwiftData
import Observation

@Observable
final class DataManager {
    var isTracking = false
    var elapsedTime: TimeInterval = 0
    private(set) var currentSessionID: UUID?

    private var timer: Timer?
    private let defaults = UserDefaults.standard
    private let sessionIDKey = "activeSessionID"
    private let sessionStartKey = "activeSessionStart"

    init() {
        if let savedIDStr = defaults.string(forKey: sessionIDKey),
           let savedID = UUID(uuidString: savedIDStr),
           let savedStart = defaults.object(forKey: sessionStartKey) as? Date {
            currentSessionID = savedID
            isTracking = true
            elapsedTime = Date().timeIntervalSince(savedStart)
            startTimer()
        }
    }

    func startTracking(context: ModelContext) {
        let session = DogSession(startTime: Date())
        context.insert(session)
        try? context.save()

        currentSessionID = session.id
        defaults.set(session.id.uuidString, forKey: sessionIDKey)
        defaults.set(session.startTime, forKey: sessionStartKey)
        isTracking = true
        elapsedTime = 0
        startTimer()
    }

    func stopTracking(context: ModelContext) -> DogSession? {
        guard let id = currentSessionID else { return nil }

        let idCopy = id
        let descriptor = FetchDescriptor<DogSession>(
            predicate: #Predicate { $0.id == idCopy }
        )
        let session = (try? context.fetch(descriptor))?.first
        session?.endTime = Date()
        session?.duration = elapsedTime

        isTracking = false
        currentSessionID = nil
        defaults.removeObject(forKey: sessionIDKey)
        defaults.removeObject(forKey: sessionStartKey)
        stopTimer()
        try? context.save()
        return session
    }

    var formattedTime: String {
        let h = Int(elapsedTime) / 3600
        let m = Int(elapsedTime) % 3600 / 60
        let s = Int(elapsedTime) % 60
        return String(format: "%02d:%02d:%02d", h, m, s)
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.elapsedTime += 1
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
}
