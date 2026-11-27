import SwiftUI

struct ServerSetupView: View {
    let onConnect: () -> Void

    @State private var serverUrl = ""
    @State private var testing = false
    @State private var statusMessage = ""
    @State private var isError = false

    var body: some View {
        ZStack {
            AppColors.bg.ignoresSafeArea()

            VStack(spacing: Spacing.xxl) {
                Spacer()

                VStack(spacing: Spacing.sm) {
                    Image(systemName: "music.note.list")
                        .font(.system(size: 48))
                        .foregroundStyle(AppColors.accent)
                    Text("Spectrum")
                        .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                        .foregroundStyle(AppColors.text)
                }

                VStack(spacing: Spacing.lg) {
                    Text("Enter your server address")
                        .font(.system(size: AppFont.md))
                        .foregroundStyle(AppColors.textMuted)

                    TextField("http://192.168.1.100:5000", text: $serverUrl)
                        .textFieldStyle(.plain)
                        .font(.system(size: AppFont.lg, design: .monospaced))
                        .foregroundStyle(AppColors.text)
                        .padding(Spacing.md)
                        .background(AppColors.surface2)
                        .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)

                    Button(action: testAndConnect) {
                        HStack {
                            if testing {
                                ProgressView()
                                    .tint(.white)
                                    .scaleEffect(0.8)
                            }
                            Text(testing ? "Testing..." : "Connect")
                                .font(.system(size: AppFont.lg, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(serverUrl.isEmpty ? AppColors.surface3 : AppColors.accent)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
                    }
                    .disabled(serverUrl.isEmpty || testing)

                    if !statusMessage.isEmpty {
                        Text(statusMessage)
                            .font(.system(size: AppFont.sm))
                            .foregroundStyle(isError ? AppColors.danger : AppColors.success)
                    }
                }
                .padding(.horizontal, Spacing.xxl)

                Spacer()
                Spacer()
            }
        }
    }

    private func testAndConnect() {
        testing = true
        statusMessage = ""
        Task {
            await APIClient.shared.saveServerUrl(serverUrl)
            do {
                _ = try await APIClient.shared.ping()
                await MainActor.run {
                    testing = false
                    statusMessage = "Connected!"
                    isError = false
                }
                try? await Task.sleep(for: .milliseconds(500))
                await MainActor.run { onConnect() }
            } catch {
                await MainActor.run {
                    testing = false
                    statusMessage = "Connection failed: \(error.localizedDescription)"
                    isError = true
                }
            }
        }
    }
}
