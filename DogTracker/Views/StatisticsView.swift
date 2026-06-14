import SwiftUI
import SwiftData
import Charts

struct StatisticsView: View {
    @Query(sort: \DogSession.startTime, order: .reverse) private var sessions: [DogSession]
    @State private var chartMode: ChartMode = .monthly
    @State private var chartType: ChartType = .bar
    @State private var selectedDate = Date()

    enum ChartMode: String, CaseIterable { case monthly = "月別"; case yearly = "年別" }
    enum ChartType: String, CaseIterable { case bar = "棒グラフ"; case line = "折れ線" }

    private var calendar: Calendar { .current }
    private var completed: [DogSession] { sessions.filter { $0.isCompleted } }

    private var periodSessions: [DogSession] {
        let g: Calendar.Component = chartMode == .monthly ? .month : .year
        return completed.filter { calendar.isDate($0.startTime, equalTo: selectedDate, toGranularity: g) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // コントロール
                    VStack(spacing: 10) {
                        Picker("期間", selection: $chartMode) {
                            ForEach(ChartMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)

                        Picker("グラフ種別", selection: $chartType) {
                            ForEach(ChartType.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding(.horizontal)

                    // 期間ナビゲーター
                    HStack {
                        Button(action: navigateBack) { Image(systemName: "chevron.left").font(.headline) }
                        Spacer()
                        Text(periodTitle).font(.headline)
                        Spacer()
                        Button(action: navigateForward) { Image(systemName: "chevron.right").font(.headline) }
                            .disabled(isCurrentPeriod)
                    }
                    .padding(.horizontal)

                    // グラフ
                    chartSection
                        .frame(height: 220)
                        .padding(.horizontal)

                    // 評価分布
                    ratingDistribution

                    // 集計
                    summarySection
                }
                .padding(.top)
            }
            .navigationTitle("統計")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Chart

    @ViewBuilder
    private var chartSection: some View {
        if chartMode == .monthly {
            let data = monthlyData
            Chart {
                ForEach(data, id: \.day) { item in
                    if chartType == .bar {
                        BarMark(x: .value("日", item.day), y: .value("時間", item.hours))
                            .foregroundStyle(Color.brown.gradient)
                            .cornerRadius(3)
                    } else {
                        LineMark(x: .value("日", item.day), y: .value("時間", item.hours))
                            .foregroundStyle(Color.brown)
                            .interpolationMethod(.catmullRom)
                        AreaMark(x: .value("日", item.day), y: .value("時間", item.hours))
                            .foregroundStyle(Color.brown.opacity(0.15).gradient)
                            .interpolationMethod(.catmullRom)
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: 5)) { v in
                    AxisValueLabel { Text("\(v.as(Int.self) ?? 0)") }
                }
            }
            .chartYAxisLabel("時間 (h)")
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        } else {
            let data = yearlyData
            Chart {
                ForEach(data, id: \.month) { item in
                    if chartType == .bar {
                        BarMark(x: .value("月", "\(item.month)月"), y: .value("時間", item.hours))
                            .foregroundStyle(Color.brown.gradient)
                            .cornerRadius(3)
                    } else {
                        LineMark(x: .value("月", "\(item.month)月"), y: .value("時間", item.hours))
                            .foregroundStyle(Color.brown)
                            .interpolationMethod(.catmullRom)
                        AreaMark(x: .value("月", "\(item.month)月"), y: .value("時間", item.hours))
                            .foregroundStyle(Color.brown.opacity(0.15).gradient)
                            .interpolationMethod(.catmullRom)
                    }
                }
            }
            .chartYAxisLabel("時間 (h)")
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    // MARK: - Rating Distribution

    private var ratingDistribution: some View {
        let rated = periodSessions.filter { $0.rating != nil }
        return VStack(alignment: .leading, spacing: 12) {
            Text("評価の分布")
                .font(.headline)
                .padding(.horizontal)

            HStack(spacing: 12) {
                ForEach(Rating.allCases, id: \.self) { rating in
                    let count = rated.filter { $0.rating == rating }.count
                    RatingStatCard(rating: rating, count: count, total: rated.count)
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Summary

    private var summarySection: some View {
        let total   = periodSessions.reduce(0) { $0 + $1.duration }
        let avg     = periodSessions.isEmpty ? 0 : total / Double(periodSessions.count)
        let maxDur  = periodSessions.max(by: { $0.duration < $1.duration })?.duration ?? 0

        return VStack(alignment: .leading, spacing: 12) {
            Text("集計")
                .font(.headline)
                .padding(.horizontal)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                StatCell(title: "合計回数",  value: "\(periodSessions.count)回",  icon: "number.circle.fill",      color: .brown)
                StatCell(title: "合計時間",  value: fmt(total),                   icon: "clock.fill",              color: .blue)
                StatCell(title: "平均時間",  value: fmt(avg),                     icon: "chart.bar.fill",          color: .green)
                StatCell(title: "最長記録",  value: fmt(maxDur),                  icon: "trophy.fill",             color: .orange)
            }
            .padding(.horizontal)
            .padding(.bottom)
        }
    }

    // MARK: - Data

    private var monthlyData: [(day: Int, hours: Double)] {
        let daysInMonth = calendar.range(of: .day, in: .month, for: selectedDate)?.count ?? 30
        return (1...daysInMonth).map { day in
            let h = periodSessions
                .filter { calendar.component(.day, from: $0.startTime) == day }
                .reduce(0) { $0 + $1.durationHours }
            return (day: day, hours: h)
        }
    }

    private var yearlyData: [(month: Int, hours: Double)] {
        return (1...12).map { month in
            let h = periodSessions
                .filter { calendar.component(.month, from: $0.startTime) == month }
                .reduce(0) { $0 + $1.durationHours }
            return (month: month, hours: h)
        }
    }

    // MARK: - Helpers

    private var periodTitle: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = chartMode == .monthly ? "yyyy年M月" : "yyyy年"
        return f.string(from: selectedDate)
    }

    private var isCurrentPeriod: Bool {
        let g: Calendar.Component = chartMode == .monthly ? .month : .year
        return calendar.isDate(selectedDate, equalTo: Date(), toGranularity: g)
    }

    private func navigateBack() {
        let c: Calendar.Component = chartMode == .monthly ? .month : .year
        selectedDate = calendar.date(byAdding: c, value: -1, to: selectedDate) ?? selectedDate
    }

    private func navigateForward() {
        let c: Calendar.Component = chartMode == .monthly ? .month : .year
        selectedDate = calendar.date(byAdding: c, value: 1, to: selectedDate) ?? selectedDate
    }

    private func fmt(_ seconds: TimeInterval) -> String {
        let h = Int(seconds) / 3600, m = Int(seconds) % 3600 / 60
        return h > 0 ? "\(h)h\(m)m" : "\(m)分"
    }
}

// MARK: - Sub-components

struct RatingStatCard: View {
    let rating: Rating
    let count: Int
    let total: Int

    var body: some View {
        VStack(spacing: 6) {
            Text(rating.label).font(.title)
            Text("\(count)回")
                .font(.headline).foregroundStyle(rating.color)
            Text(total == 0 ? "---" : "\(Int(Double(count) / Double(total) * 100))%")
                .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(rating.backgroundColor)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct StatCell: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(color).font(.title2)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.subheadline).bold()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
