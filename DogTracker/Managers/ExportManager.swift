import Foundation

enum ExportManager {
    static func generateCSV(sessions: [DogSession]) -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.locale = Locale(identifier: "ja_JP")
        dateFormatter.dateFormat = "yyyy/MM/dd"

        let timeFormatter = DateFormatter()
        timeFormatter.locale = Locale(identifier: "ja_JP")
        timeFormatter.dateFormat = "HH:mm:ss"

        var lines = ["日付,開始時刻,終了時刻,時間（分）,評価,メモ"]

        for session in sessions.filter({ $0.isCompleted }).sorted(by: { $0.startTime < $1.startTime }) {
            let date  = dateFormatter.string(from: session.startTime)
            let start = timeFormatter.string(from: session.startTime)
            let end   = session.endTime.map { timeFormatter.string(from: $0) } ?? ""
            let mins  = String(format: "%.1f", session.durationMinutes)
            let rating = session.rating?.label ?? ""
            let memo  = "\"\(session.memo.replacingOccurrences(of: "\"", with: "\"\""))\""
            lines.append("\(date),\(start),\(end),\(mins),\(rating),\(memo)")
        }

        return lines.joined(separator: "\n")
    }

    static func exportURL(sessions: [DogSession]) -> URL? {
        let csv = generateCSV(sessions: sessions)
        let bom = "\u{FEFF}" // UTF-8 BOM（Excel/Google Sheets対応）

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd_HHmmss"
        let filename = "dog_tracker_\(formatter.string(from: Date())).csv"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)

        do {
            try (bom + csv).write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            return nil
        }
    }
}
