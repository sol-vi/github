import Foundation

/// Google Sheets API 連携
///
/// セットアップ手順:
/// 1. https://console.cloud.google.com でプロジェクトを作成
/// 2. Google Sheets API を有効化
/// 3. OAuth 2.0 クライアントID（iOS用）を作成
/// 4. Bundle ID を登録
/// 5. Swift Package Manager で GoogleSignIn を追加
/// 6. Info.plist に URL スキームを設定
///
/// 簡易運用: CSVエクスポート → Google Drive にアップロード →
///           Google Sheets で「データ」→「CSVをインポート」
final class GoogleSheetsManager {
    static let shared = GoogleSheetsManager()

    private var spreadsheetId = "YOUR_SPREADSHEET_ID"
    private init() {}

    /// アクセストークン取得後にセッションデータを1行追記する
    func appendSession(_ session: DogSession, accessToken: String) async throws {
        guard let url = URL(string:
            "https://sheets.googleapis.com/v4/spreadsheets/\(spreadsheetId)/values/A1:append?valueInputOption=USER_ENTERED"
        ) else { throw URLError(.badURL) }

        let dateFormatter = DateFormatter()
        dateFormatter.locale = Locale(identifier: "ja_JP")
        dateFormatter.dateFormat = "yyyy/MM/dd"

        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm:ss"

        let row: [Any] = [
            dateFormatter.string(from: session.startTime),
            timeFormatter.string(from: session.startTime),
            session.endTime.map { timeFormatter.string(from: $0) } ?? "",
            String(format: "%.1f", session.durationMinutes),
            session.rating?.label ?? "",
            session.memo
        ]

        let body: [String: Any] = [
            "range": "A1",
            "majorDimension": "ROWS",
            "values": [row]
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
    }
}
