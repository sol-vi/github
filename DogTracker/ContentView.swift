import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            TimerView()
                .tabItem {
                    Label("タイマー", systemImage: "timer")
                }
                .tag(0)

            HistoryView()
                .tabItem {
                    Label("履歴", systemImage: "calendar")
                }
                .tag(1)

            StatisticsView()
                .tabItem {
                    Label("統計", systemImage: "chart.bar.fill")
                }
                .tag(2)

            SettingsView()
                .tabItem {
                    Label("設定", systemImage: "gearshape.fill")
                }
                .tag(3)
        }
        .tint(.brown)
    }
}
