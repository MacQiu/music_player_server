import SwiftUI
import Charts

struct AnalyticsView: View {
    @Environment(DataViewModel.self) private var data

    @State private var wrappedYear: Int = Calendar.current.component(.year, from: Date())
    @State private var wrappedData: WrappedAnalytics?
    @State private var loadingWrapped = false

    private var analytics: AnalyticsData? { data.analytics }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Spacing.xxl) {
                Text("Analytics")
                    .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                    .foregroundStyle(AppColors.text)
                    .padding(.horizontal, Spacing.lg)

                if data.analyticsLoading && analytics == nil {
                    HStack {
                        Spacer()
                        ProgressView().tint(AppColors.accent)
                        Spacer()
                    }
                    .padding(.top, 40)
                } else if let analytics {
                    // Stat cards
                    HStack(spacing: Spacing.md) {
                        statCard("Total Plays", "\(analytics.totalPlays)")
                        statCard("Listening Time", formatListeningTime(analytics.totalListeningTime))
                    }
                    .padding(.horizontal, Spacing.lg)

                    // Top songs chart
                    if !analytics.topSongs.isEmpty {
                        chartSection("Top Songs") {
                            Chart(Array(analytics.topSongs.prefix(10))) { song in
                                BarMark(
                                    x: .value("Plays", song.playCount),
                                    y: .value("Song", song.title)
                                )
                                .foregroundStyle(AppColors.accent)
                            }
                            .chartYAxis {
                                AxisMarks { _ in
                                    AxisValueLabel()
                                        .foregroundStyle(AppColors.textMuted)
                                        .font(.system(size: AppFont.xs))
                                }
                            }
                            .chartXAxis {
                                AxisMarks { _ in
                                    AxisValueLabel()
                                        .foregroundStyle(AppColors.textMuted)
                                }
                            }
                            .frame(height: CGFloat(min(analytics.topSongs.count, 10)) * 36)
                        }
                    }

                    // Top artists chart
                    if !analytics.topArtists.isEmpty {
                        chartSection("Top Artists") {
                            Chart(Array(analytics.topArtists.prefix(10))) { artist in
                                BarMark(
                                    x: .value("Plays", artist.playCount),
                                    y: .value("Artist", artist.artist)
                                )
                                .foregroundStyle(AppColors.accent)
                            }
                            .chartYAxis {
                                AxisMarks { _ in
                                    AxisValueLabel()
                                        .foregroundStyle(AppColors.textMuted)
                                        .font(.system(size: AppFont.xs))
                                }
                            }
                            .chartXAxis {
                                AxisMarks { _ in
                                    AxisValueLabel()
                                        .foregroundStyle(AppColors.textMuted)
                                }
                            }
                            .frame(height: CGFloat(min(analytics.topArtists.count, 10)) * 36)
                        }
                    }

                    // Wrapped section
                    Divider().background(AppColors.border)
                        .padding(.horizontal, Spacing.lg)

                    wrappedSection
                }

                Spacer(minLength: 120)
            }
            .padding(.top, Spacing.lg)
        }
        .background(AppColors.bg)
        .refreshable {
            await data.refreshAnalytics()
        }
    }

    // MARK: - Subviews

    private func statCard(_ title: String, _ value: String) -> some View {
        VStack(spacing: Spacing.xs) {
            Text(value)
                .font(.system(size: AppFont.xxl, weight: .bold, design: .rounded))
                .foregroundStyle(AppColors.accent)
            Text(title)
                .font(.system(size: AppFont.sm))
                .foregroundStyle(AppColors.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.lg)
        .cardStyle()
    }

    private func chartSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text(title)
                .font(.system(size: AppFont.xl, weight: .bold, design: .rounded))
                .foregroundStyle(AppColors.text)

            content()
                .padding(Spacing.md)
                .cardStyle()
        }
        .padding(.horizontal, Spacing.lg)
    }

    private var wrappedSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                Text("Wrapped")
                    .font(.system(size: AppFont.xl, weight: .bold, design: .rounded))
                    .foregroundStyle(AppColors.text)
                Spacer()
                Picker("Year", selection: $wrappedYear) {
                    ForEach((2020...Calendar.current.component(.year, from: Date())).reversed(), id: \.self) { year in
                        Text(String(year)).tag(year)
                    }
                }
                .tint(AppColors.accent)
                .onChange(of: wrappedYear) { _, _ in loadWrapped() }
            }

            if loadingWrapped {
                HStack { Spacer(); ProgressView().tint(AppColors.accent); Spacer() }
            } else if let wrapped = wrappedData {
                HStack(spacing: Spacing.md) {
                    statCard("Plays", "\(wrapped.totalPlays)")
                    statCard("Time", formatListeningTime(wrapped.totalListeningTime))
                }

                if !wrapped.topSongs.isEmpty {
                    Text("Top Songs")
                        .font(.system(size: AppFont.lg, weight: .semibold))
                        .foregroundStyle(AppColors.text)

                    ForEach(Array(wrapped.topSongs.prefix(10).enumerated()), id: \.element.id) { index, song in
                        HStack(spacing: Spacing.md) {
                            Text("\(index + 1)")
                                .font(.system(size: AppFont.md, weight: .bold))
                                .foregroundStyle(AppColors.textMuted)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(song.title)
                                    .font(.system(size: AppFont.md))
                                    .foregroundStyle(AppColors.text)
                                    .lineLimit(1)
                                Text(song.artist ?? "Unknown")
                                    .font(.system(size: AppFont.sm))
                                    .foregroundStyle(AppColors.textMuted)
                            }
                            Spacer()
                            Text("\(song.playCount) plays")
                                .font(.system(size: AppFont.sm))
                                .foregroundStyle(AppColors.textMuted)
                        }
                        .padding(.vertical, Spacing.xs)
                    }
                }
            }
        }
        .padding(.horizontal, Spacing.lg)
        .onAppear { loadWrapped() }
    }

    private func loadWrapped() {
        loadingWrapped = true
        Task {
            do {
                let result = try await APIClient.shared.getWrappedAnalytics(year: wrappedYear)
                await MainActor.run {
                    wrappedData = result
                    loadingWrapped = false
                }
            } catch {
                await MainActor.run { loadingWrapped = false }
            }
        }
    }
}
