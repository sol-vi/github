import SwiftUI
import SwiftData

struct RatingView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let session: DogSession

    @State private var selectedRating: Rating? = nil
    @State private var memo = ""
    @FocusState private var memoFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    // 完了サマリー
                    summaryCard

                    // 評価ボタン
                    ratingSection

                    // メモ入力
                    memoSection

                    // 保存 / スキップ
                    actionButtons
                }
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") { dismiss() }
                }
            }
            .onTapGesture { memoFocused = false }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var summaryCard: some View {
        VStack(spacing: 8) {
            Text("🐾 お留守番完了！")
                .font(.title2).bold()

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Label(formattedDate(session.startTime), systemImage: "calendar")
                        .font(.caption).foregroundStyle(.secondary)
                    Label(session.formattedDuration, systemImage: "clock")
                        .font(.title3).bold().foregroundStyle(.brown)
                }
                Spacer()
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color.brown.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    private var ratingSection: some View {
        VStack(spacing: 16) {
            Text("今日のお留守番はどうでしたか？")
                .font(.headline)

            HStack(spacing: 14) {
                ForEach(Rating.allCases, id: \.self) { rating in
                    RatingButton(rating: rating, isSelected: selectedRating == rating) {
                        withAnimation(.spring(response: 0.3)) {
                            selectedRating = selectedRating == rating ? nil : rating
                        }
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private var memoSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("一言メモ")
                .font(.headline)

            TextField("今日の様子を記録しましょう（任意）", text: $memo, axis: .vertical)
                .lineLimit(3...6)
                .padding(12)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .focused($memoFocused)
        }
        .padding(.horizontal)
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            Button(action: saveAndDismiss) {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                    Text("保存する")
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.brown)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(selectedRating == nil)
            .opacity(selectedRating == nil ? 0.5 : 1)

            Button("スキップ") { dismiss() }
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal)
    }

    private func saveAndDismiss() {
        session.rating = selectedRating
        session.memo = memo
        try? modelContext.save()
        dismiss()
    }

    private func formattedDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "M月d日（E）"
        return f.string(from: date)
    }
}

struct RatingButton: View {
    let rating: Rating
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Text(rating.label)
                    .font(.system(size: 40))
                Text(rating.description)
                    .font(.caption)
                    .fontWeight(isSelected ? .bold : .regular)
                    .foregroundStyle(isSelected ? rating.color : .secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(isSelected ? rating.backgroundColor : Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isSelected ? rating.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}
