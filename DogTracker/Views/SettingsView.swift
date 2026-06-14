import SwiftUI
import SwiftData

struct SettingsView: View {
    @Query private var sessions: [DogSession]
    @Environment(\.modelContext) private var modelContext

    @State private var exportURL: URL? = nil
    @State private var showShareSheet = false
    @State private var showDeleteConfirm = false

    private var completed: [DogSession] { sessions.filter { $0.isCompleted } }

    var body: some View {
        NavigationStack {
            List {
                // エクスポート
                Section("データのエクスポート") {
                    Button {
                        exportCSV()
                    } label: {
                        Label("CSVでエクスポート", systemImage: "square.and.arrow.up")
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Label("Google Sheetsへのインポート方法",
                              systemImage: "info.circle")
                            .font(.subheadline)
                        Text("""
                        1. 「CSVでエクスポート」でファイルを保存
                        2. Google Drive にアップロード
                        3. Google Sheets で開く（自動変換されます）
                        """)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                // アプリ情報
                Section("アプリについて") {
                    InfoRow(label: "バージョン", value: "1.0.0")
                    InfoRow(label: "総記録件数", value: "\(completed.count)件")
                    InfoRow(label: "最古の記録", value: oldestDateText)
                }

                // 危険ゾーン
                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("全データを削除", systemImage: "trash")
                    }
                }
            }
            .navigationTitle("設定")
            .sheet(isPresented: $showShareSheet) {
                if let url = exportURL {
                    ShareSheet(activityItems: [url])
                }
            }
            .confirmationDialog("全データを削除しますか？",
                                isPresented: $showDeleteConfirm,
                                titleVisibility: .visible) {
                Button("削除する", role: .destructive) { deleteAll() }
                Button("キャンセル", role: .cancel) {}
            } message: {
                Text("この操作は元に戻せません。")
            }
        }
    }

    private var oldestDateText: String {
        guard let oldest = completed.min(by: { $0.startTime < $1.startTime }) else { return "---" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "yyyy年M月d日"
        return f.string(from: oldest.startTime)
    }

    private func exportCSV() {
        if let url = ExportManager.exportURL(sessions: completed) {
            exportURL = url
            showShareSheet = true
        }
    }

    private func deleteAll() {
        sessions.forEach { modelContext.delete($0) }
        try? modelContext.save()
    }
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundStyle(.secondary)
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
