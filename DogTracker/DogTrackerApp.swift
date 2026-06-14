import SwiftUI
import SwiftData

@main
struct DogTrackerApp: App {
    @State private var dataManager = DataManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(dataManager)
        }
        .modelContainer(for: DogSession.self)
    }
}
