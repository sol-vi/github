import SwiftUI
import SwiftData

struct TimerView: View {
    @Environment(DataManager.self) private var dataManager
    @Environment(\.modelContext) private var modelContext

    @State private var completedSession: DogSession? = nil
    @State private var showRatingSheet = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()

                dogIcon

                Spacer().frame(height: 48)

                // タイマー表示
                Text(dataManager.formattedTime)
                    .font(.system(size: 68, weight: .ultraLight, design: .monospaced))
                    .foregroundStyle(dataManager.isTracking ? Color.primary : Color.secondary)
                    .contentTransition(.numericText())
                    .animation(.default, value: dataManager.formattedTime)

                Spacer().frame(height: 56)

                // スタート / ストップ ボタン
                Button(action: toggleTracking) {
                    ZStack {
                        Circle()
                            .fill(
                                (dataManager.isTracking ? Color.red : Color.brown).gradient
                            )
                            .frame(width: 120, height: 120)
                            .shadow(
                                color: (dataManager.isTracking ? Color.red : Color.brown).opacity(0.35),
                                radius: 16, y: 6
                            )

                        Image(systemName: dataManager.isTracking ? "stop.fill" : "play.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.white)
                            .offset(x: dataManager.isTracking ? 0 : 4)
                    }
                }
                .buttonStyle(.plain)

                Spacer().frame(height: 16)

                Text(dataManager.isTracking ? "タップして終了" : "タップして開始")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()
                Spacer()
            }
            .navigationTitle("わんこのお留守番")
            .navigationBarTitleDisplayMode(.large)
        }
        .sheet(isPresented: $showRatingSheet, onDismiss: { completedSession = nil }) {
            if let session = completedSession {
                RatingView(session: session)
            }
        }
    }

    private var dogIcon: some View {
        VStack(spacing: 10) {
            Text("🐕")
                .font(.system(size: 80))
                .scaleEffect(dataManager.isTracking ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true),
                           value: dataManager.isTracking)

            Text(dataManager.isTracking ? "お留守番中…" : "おうちで待ってるよ")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func toggleTracking() {
        if dataManager.isTracking {
            if let session = dataManager.stopTracking(context: modelContext) {
                completedSession = session
                showRatingSheet = true
            }
        } else {
            dataManager.startTracking(context: modelContext)
        }
    }
}
