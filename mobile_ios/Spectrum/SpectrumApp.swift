import SwiftUI

@main
struct SpectrumApp: App {
    @State private var playerVM = PlayerViewModel()
    @State private var dataVM = DataViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(playerVM)
                .environment(dataVM)
                .preferredColorScheme(.dark)
        }
    }
}
