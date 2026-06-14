import Foundation
import SwiftData

@Model
final class DogSession {
    var id: UUID
    var startTime: Date
    var endTime: Date?
    var duration: TimeInterval
    var ratingRaw: String?
    var memo: String

    init(startTime: Date) {
        self.id = UUID()
        self.startTime = startTime
        self.endTime = nil
        self.duration = 0
        self.ratingRaw = nil
        self.memo = ""
    }

    var rating: Rating? {
        get { ratingRaw.flatMap { Rating(rawValue: $0) } }
        set { ratingRaw = newValue?.rawValue }
    }

    var isCompleted: Bool {
        endTime != nil
    }

    var durationHours: Double {
        duration / 3600
    }

    var durationMinutes: Double {
        duration / 60
    }

    var formattedDuration: String {
        let hours = Int(duration) / 3600
        let minutes = Int(duration) % 3600 / 60
        let seconds = Int(duration) % 60
        if hours > 0 {
            return String(format: "%d時間%02d分", hours, minutes)
        } else if minutes > 0 {
            return String(format: "%d分%02d秒", minutes, seconds)
        } else {
            return String(format: "%d秒", seconds)
        }
    }
}
