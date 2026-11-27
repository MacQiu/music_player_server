import SwiftUI

struct SelectionBarView: View {
    let count: Int
    let totalCount: Int
    let onSelectAll: () -> Void
    let onDeselectAll: () -> Void
    let actions: [(String, () -> Void)]
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Divider().background(AppColors.border)

            VStack(spacing: Spacing.sm) {
                HStack {
                    Text("\(count) selected")
                        .font(.system(size: AppFont.md, weight: .medium))
                        .foregroundStyle(AppColors.text)

                    Spacer()

                    Button(count == totalCount ? "Deselect All" : "Select All") {
                        if count == totalCount {
                            onDeselectAll()
                        } else {
                            onSelectAll()
                        }
                    }
                    .font(.system(size: AppFont.sm))
                    .foregroundStyle(AppColors.accent)

                    Button { onDismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(AppColors.textMuted)
                    }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.sm) {
                        ForEach(Array(actions.enumerated()), id: \.offset) { _, action in
                            Button(action.0) {
                                action.1()
                            }
                            .font(.system(size: AppFont.sm, weight: .medium))
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, Spacing.sm)
                            .background(AppColors.accent)
                            .foregroundStyle(.white)
                            .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
            .background(AppColors.surface)
        }
    }
}
