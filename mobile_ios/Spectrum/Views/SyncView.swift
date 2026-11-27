import SwiftUI

struct SyncView: View {
    @Environment(DataViewModel.self) private var data
    @State private var syncStatus = ""
    @State private var isSyncing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    Text("Sync")
                        .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                        .foregroundStyle(AppColors.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Spacing.lg)

                    // Server status
                    actionCard(
                        icon: "circle.fill",
                        iconColor: data.online ? AppColors.success : AppColors.danger,
                        title: "Server Status",
                        subtitle: data.online ? "Connected" : "Offline"
                    ) {
                        Task {
                            await data.refreshAll()
                        }
                    }

                    // Sync play logs
                    actionCard(
                        icon: "arrow.triangle.2.circlepath",
                        iconColor: AppColors.accent,
                        title: "Sync Play Logs",
                        subtitle: syncStatus.isEmpty ? "\(PlaylogQueue.queueSize()) logs queued" : syncStatus
                    ) {
                        syncPlayLogs()
                    }

                    // Fetch songs
                    actionCard(
                        icon: "arrow.down.circle",
                        iconColor: AppColors.accent,
                        title: "Fetch Songs",
                        subtitle: "\(data.songs.count) songs in library"
                    ) {
                        Task { await data.refreshSongs() }
                    }

                    // Refresh analytics
                    actionCard(
                        icon: "chart.bar",
                        iconColor: AppColors.accent,
                        title: "Refresh Analytics",
                        subtitle: data.analytics != nil ? "\(data.analytics!.totalPlays) total plays" : "No data"
                    ) {
                        Task { await data.refreshAnalytics() }
                    }

                    Divider().background(AppColors.border)
                        .padding(.horizontal, Spacing.lg)

                    // Navigation links
                    NavigationLink {
                        SettingsView()
                    } label: {
                        navRow(icon: "gearshape.fill", title: "Server Settings")
                    }

                    NavigationLink {
                        UploadView()
                    } label: {
                        navRow(icon: "arrow.up.circle.fill", title: "Upload Song")
                    }

                    Spacer(minLength: 120)
                }
                .padding(.top, Spacing.lg)
            }
            .background(AppColors.bg)
            .refreshable {
                await data.refreshAll()
            }
        }
    }

    private func actionCard(icon: String, iconColor: Color, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Spacing.md) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(iconColor)
                    .frame(width: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: AppFont.md, weight: .medium))
                        .foregroundStyle(AppColors.text)
                    Text(subtitle)
                        .font(.system(size: AppFont.sm))
                        .foregroundStyle(AppColors.textMuted)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundStyle(AppColors.textMuted)
            }
            .padding(Spacing.lg)
            .cardStyle()
        }
        .padding(.horizontal, Spacing.lg)
    }

    private func navRow(icon: String, title: String) -> some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(AppColors.accent)
                .frame(width: 36)
            Text(title)
                .font(.system(size: AppFont.md, weight: .medium))
                .foregroundStyle(AppColors.text)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 14))
                .foregroundStyle(AppColors.textMuted)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    private func syncPlayLogs() {
        isSyncing = true
        syncStatus = "Syncing..."
        Task {
            await PlaylogQueue.flushAll()
            await MainActor.run {
                syncStatus = "Synced!"
                isSyncing = false
            }
            try? await Task.sleep(for: .seconds(2))
            await MainActor.run { syncStatus = "" }
        }
    }
}
