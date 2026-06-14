import SwiftUI

enum Rating: String, Codable, CaseIterable {
    case good = "good"
    case fair = "fair"
    case bad  = "bad"

    var label: String {
        switch self {
        case .good: return "○"
        case .fair: return "△"
        case .bad:  return "×"
        }
    }

    var description: String {
        switch self {
        case .good: return "良い"
        case .fair: return "普通"
        case .bad:  return "悪い"
        }
    }

    var color: Color {
        switch self {
        case .good: return .green
        case .fair: return .orange
        case .bad:  return .red
        }
    }

    var backgroundColor: Color {
        switch self {
        case .good: return Color.green.opacity(0.15)
        case .fair: return Color.orange.opacity(0.15)
        case .bad:  return Color.red.opacity(0.15)
        }
    }

    var icon: String {
        switch self {
        case .good: return "checkmark.circle.fill"
        case .fair: return "minus.circle.fill"
        case .bad:  return "xmark.circle.fill"
        }
    }
}
