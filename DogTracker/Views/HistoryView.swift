import SwiftUI
import SwiftData

struct HistoryView: View {
    @Query(sort: \DogSession.startTime, order: .reverse) private var sessions: [DogSession]
    @State private var viewMode: ViewMode = .monthly
    @State private var selectedDate = Date()

    enum ViewMode: String, CaseIterable {
        case monthly = "月別"
        case yearly  = "年別"
    }

    private var calendar: Calendar { .current }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("表示", selection: $viewMode) {
                    ForEach(ViewMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding()

                periodNavigator

                Divider()

                if viewMode == .monthly {
                    MonthlyHistoryView(sessions: currentSessions)
                } else {
                    YearlyHistoryView(sessions: currentSessions,
                                      year: calendar.component(.year, from: selectedDate))
                }
            }
            .navigationTitle("履歴")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    private var periodNavigator: some View {
        HStack {
            Button(action: navigateBack) {
                Image(systemName: "chevron.left").font(.headline)
            }
            Spacer()
            Text(headerTitle).font(.headline)
            Spacer()
            Button(action: navigateForward) {
                Image(systemName: "chevron.right").font(.headline)
            }
            .disabled(isCurrentPeriod)
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    private var headerTitle: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = viewMode == .monthly ? "yyyy年M月" : "yyyy年"
        return f.string(from: selectedDate)
    }

    private var isCurrentPeriod: Bool {
        let g: Calendar.Component = viewMode == .monthly ? .month : .year
        return calendar.isDate(selectedDate, equalTo: Date(), toGranularity: g)
    }

    private var currentSessions: [DogSession] {
        let g: Calendar.Component = viewMode == .monthly ? .month : .year
        return sessions.filter { calendar.isDate($0.startTime, equalTo: selectedDate, toGranularity: g) }
    }

    private func navigateBack() {
        let c: Calendar.Component = viewMode == .monthly ? .month : .year
        selectedDate = calendar.date(byAdding: c, value: -1, to: selectedDate) ?? selectedDate
    }

    private func navigateForward() {
        let c: Calendar.Component = viewMode == .monthly ? .month : .year
        selectedDate = calendar.date(byAdding: c, value: 1, to: selectedDate) ?? selectedDate
    }
}

// MARK: - 月別リスト

struct MonthlyHistoryView: View {
    let sessions: [DogSession]
    private var calendar: Calendar { .current }

    private var completed: [DogSession] { sessions.filter { $0.isCompleted } }

    private var byDay: [Date: [DogSession]] {
        Dictionary(grouping: completed) { calendar.startOfDay(for: $0.startTime) }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    SummaryCard(title: "合計回数",
                                value: "\(completed.count)回",
                                icon: "repeat", color: .brown)
                    SummaryCard(title: "合計時間",
                                value: formatTotal(completed.reduce(0) { $0 + $1.duration }),
                                icon: "clock", color: .blue)
                }
                .listRowInsets(.init())
                .listRowBackground(Color.clear)
            }

            if completed.isEmpty {
                Section {
                    HStack {
                        Spacer()
                        VStack(spacing: 8) {
                            Image(systemName: "calendar.badge.exclamationmark")
                                .font(.largeTitle).foregroundStyle(.secondary)
                            Text("この月の記録はありません")
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                        Spacer()
                    }
                }
            } else {
                ForEach(byDay.keys.sorted(by: >), id: \.self) { day in
                    Section(header: Text(formatDay(day))) {
                        ForEach(byDay[day]!.sorted(by: { $0.startTime > $1.startTime }), id: \.id) {
                            SessionRow(session: $0)
                        }
                    }
                }
            }
        }
    }

    private func formatDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "M月d日（E）"
        return f.string(from: date)
    }

    private func formatTotal(_ seconds: TimeInterval) -> String {
        let h = Int(seconds) / 3600, m = Int(seconds) % 3600 / 60
        return h > 0 ? "\(h)h\(m)m" : "\(m)分"
    }
}

// MARK: - 年別リスト

struct YearlyHistoryView: View {
    let sessions: [DogSession]
    let year: Int
    private var calendar: Calendar { .current }

    private var byMonth: [Int: [DogSession]] {
        Dictionary(grouping: sessions.filter { $0.isCompleted }) {
            calendar.component(.month, from: $0.startTime)
        }
    }

    private var maxHours: Double {
        (1...12).map { byMonth[$0, default: []].reduce(0) { $0 + $1.durationHours } }.max() ?? 1
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    let completed = sessions.filter { $0.isCompleted }
                    SummaryCard(title: "合計回数",
                                value: "\(completed.count)回",
                                icon: "repeat", color: .brown)
                    SummaryCard(title: "平均時間",
                                value: avgTime(completed),
                                icon: "clock.arrow.circlepath", color: .blue)
                }
                .listRowInsets(.init())
                .listRowBackground(Color.clear)
            }

            Section("月別集計") {
                ForEach(1...12, id: \.self) { month in
                    let ms = byMonth[month, default: []]
                    let total = ms.reduce(0) { $0 + $1.duration }
                    let barRatio = maxHours > 0 ? CGFloat(total / 3600 / maxHours) : 0

                    HStack(spacing: 12) {
                        Text("\(month)月")
                            .font(.headline)
                            .frame(width: 36, alignment: .leading)

                        VStack(alignment: .leading, spacing: 2) {
                            if ms.isEmpty {
                                Text("記録なし").font(.caption).foregroundStyle(.secondary)
                            } else {
                                Text("\(ms.count)回").font(.caption).foregroundStyle(.secondary)
                                Text(formatDuration(total)).font(.subheadline).bold().foregroundStyle(.brown)
                            }
                        }

                        Spacer()

                        GeometryReader { geo in
                            HStack(alignment: .bottom, spacing: 0) {
                                Spacer()
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(Color.brown)
                                    .frame(width: 12, height: max(4, geo.size.height * barRatio))
                            }
                        }
                        .frame(width: 80, height: 28)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func avgTime(_ sessions: [DogSession]) -> String {
        guard !sessions.isEmpty else { return "---" }
        let avg = sessions.reduce(0) { $0 + $1.duration } / Double(sessions.count)
        return formatDuration(avg)
    }

    private func formatDuration(_ s: TimeInterval) -> String {
        let h = Int(s) / 3600, m = Int(s) % 3600 / 60
        return h > 0 ? "\(h)時間\(m)分" : "\(m)分"
    }
}

// MARK: - 共通コンポーネント

struct SessionRow: View {
    let session: DogSession
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(timeRange)
                        .font(.caption).foregroundStyle(.secondary)
                    Text(session.formattedDuration)
                        .font(.headline).foregroundStyle(.brown)
                }
                Spacer()
                if let rating = session.rating {
                    Text(rating.label)
                        .font(.title2)
                        .padding(6)
                        .background(rating.backgroundColor)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            if isExpanded, !session.memo.isEmpty {
                Text(session.memo)
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if !session.memo.isEmpty { withAnimation { isExpanded.toggle() } }
        }
    }

    private var timeRange: String {
        let f = DateFormatter(); f.dateFormat = "HH:mm"
        let s = f.string(from: session.startTime)
        let e = session.endTime.map { f.string(from: $0) } ?? "--:--"
        return "\(s) 〜 \(e)"
    }
}

struct SummaryCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.title3).foregroundStyle(color)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.headline)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
