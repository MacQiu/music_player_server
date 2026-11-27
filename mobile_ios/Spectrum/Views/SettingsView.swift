import SwiftUI

struct SettingsView: View {
    @State private var serverUrl = ""
    @State private var testing = false
    @State private var statusMessage = ""
    @State private var isError = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xxl) {
                Text("Server Settings")
                    .font(.system(size: AppFont.title, weight: .bold, design: .rounded))
                    .foregroundStyle(AppColors.text)
                    .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("Server URL")
                        .font(.system(size: AppFont.sm))
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
                }

                HStack(spacing: Spacing.md) {
                    Button(action: testConnection) {
                        HStack {
                            if testing {
                                ProgressView().tint(.white).scaleEffect(0.8)
                            }
                            Text(testing ? "Testing..." : "Test Connection")
                                .font(.system(size: AppFont.md, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(AppColors.surface2)
                        .foregroundStyle(AppColors.text)
                        .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
                    }
                    .disabled(testing)

                    Button(action: saveUrl) {
                        Text("Save")
                            .font(.system(size: AppFont.md, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.md)
                            .background(AppColors.accent)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: AppRadius.md))
                    }
                }

                if !statusMessage.isEmpty {
                    Text(statusMessage)
                        .font(.system(size: AppFont.sm))
                        .foregroundStyle(isError ? AppColors.danger : AppColors.success)
                }
            }
            .padding(Spacing.lg)
        }
        .background(AppColors.bg)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            serverUrl = await APIClient.shared.getBaseUrl()
        }
    }

    private func testConnection() {
        testing = true
        statusMessage = ""
        Task {
            await APIClient.shared.saveServerUrl(serverUrl)
            do {
                _ = try await APIClient.shared.ping()
                await MainActor.run {
                    testing = false
                    statusMessage = "Connection successful!"
                    isError = false
                }
            } catch {
                await MainActor.run {
                    testing = false
                    statusMessage = "Failed: \(error.localizedDescription)"
                    isError = true
                }
            }
        }
    }

    private func saveUrl() {
        Task {
            await APIClient.shared.saveServerUrl(serverUrl)
            statusMessage = "Saved!"
            isError = false
        }
    }
}
