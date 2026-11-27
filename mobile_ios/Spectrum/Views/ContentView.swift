import SwiftUI

struct ContentView: View {
    @Environment(PlayerViewModel.self) private var player
    @Environment(DataViewModel.self) private var data
    @State private var hasServerUrl = false
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                ZStack {
                    AppColors.bg.ignoresSafeArea()
                    ProgressView()
                        .tint(AppColors.accent)
                }
            } else if hasServerUrl {
                MainTabView()
            } else {
                ServerSetupView(onConnect: {
                    hasServerUrl = true
                })
            }
        }
        .task {
            let url = await APIClient.shared.loadServerUrl()
            hasServerUrl = !url.isEmpty
            isLoading = false
        }
    }
}
