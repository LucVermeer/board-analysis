import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Thumbnail Helper

func loadThumbnail(climbUuid: String) -> UIImage? {
    guard let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: SharedConstants.appGroupId
    ) else { return nil }
    let path = containerURL.appendingPathComponent("thumbnails/\(climbUuid).webp")
    guard let data = try? Data(contentsOf: path) else { return nil }
    return UIImage(data: data)
}

// MARK: - Colors

private let backgroundColor = Color(red: 10 / 255, green: 10 / 255, blue: 10 / 255)
private let pillBackground = Color.white.opacity(0.15)

// MARK: - Shared Subviews

@available(iOS 17.0, *)
private struct ThumbnailView: View {
    let climbUuid: String
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        if let image = loadThumbnail(climbUuid: climbUuid) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: width, height: height)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white.opacity(0.1))
                .frame(width: width, height: height)
                .overlay(
                    Image(systemName: "mountain.2.fill")
                        .font(.system(size: min(width, height) * 0.4))
                        .foregroundColor(.white.opacity(0.4))
                )
        }
    }
}

@available(iOS 17.0, *)
private struct DifficultyPill: View {
    let text: String
    var font: Font = .caption.bold()

    var body: some View {
        Text(text)
            .font(font)
            .foregroundColor(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(pillBackground)
            .clipShape(Capsule())
    }
}

// MARK: - Live Activity Widget

@available(iOS 17.0, *)
struct ClimbSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ClimbSessionAttributes.self) { context in
            // Lock Screen / Banner presentation
            LockScreenView(context: context)
                .activityBackgroundTint(backgroundColor)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Dynamic Island
                DynamicIslandExpandedRegion(.leading) {
                    ThumbnailView(
                        climbUuid: context.state.climbUuid,
                        width: 48,
                        height: 60
                    )
                    .padding(.leading, 4)
                }

                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.climbName)
                            .font(.headline)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .lineLimit(1)

                        HStack(spacing: 6) {
                            DifficultyPill(text: context.state.climbDifficulty)

                            Text("\(context.state.currentIndex + 1) of \(context.state.totalClimbs)")
                                .font(.caption)
                                .foregroundColor(.white.opacity(0.6))
                        }
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.angle)°")
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.trailing, 4)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 12) {
                        Button(intent: PreviousClimbIntent()) {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Prev")
                            }
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(context.state.hasPrevious ? .white : .white.opacity(0.3))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(context.state.hasPrevious ? Color.white.opacity(0.15) : Color.white.opacity(0.05))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .disabled(!context.state.hasPrevious)

                        Button(intent: NextClimbIntent()) {
                            HStack(spacing: 4) {
                                Text("Next")
                                Image(systemName: "chevron.right")
                            }
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(context.state.hasNext ? .white : .white.opacity(0.3))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(context.state.hasNext ? Color.white.opacity(0.15) : Color.white.opacity(0.05))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .disabled(!context.state.hasNext)
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                // Compact Dynamic Island - Leading
                if let image = loadThumbnail(climbUuid: context.state.climbUuid) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 24, height: 24)
                        .clipShape(Circle())
                } else {
                    Image(systemName: "mountain.2.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                }
            } compactTrailing: {
                // Compact Dynamic Island - Trailing
                Text(context.state.climbDifficulty)
                    .font(.caption.bold())
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: "mountain.2.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.white)
            }
        }
    }
}

// MARK: - Lock Screen View

@available(iOS 17.0, *)
private struct LockScreenView: View {
    let context: ActivityViewContext<ClimbSessionAttributes>

    var body: some View {
        if context.isStale {
            staleView
        } else {
            activeView
        }
    }

    private var activeView: some View {
        HStack(spacing: 12) {
            // Thumbnail
            ThumbnailView(
                climbUuid: context.state.climbUuid,
                width: 80,
                height: 100
            )

            // Content
            VStack(alignment: .leading, spacing: 6) {
                // Top row: climb name and difficulty
                HStack(alignment: .top) {
                    Text(context.state.climbName)
                        .font(.headline)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .lineLimit(2)

                    Spacer()

                    DifficultyPill(text: context.state.climbDifficulty, font: .subheadline.bold())
                }

                // Middle row: position and angle
                HStack {
                    Text("\(context.state.currentIndex + 1) of \(context.state.totalClimbs)")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    Spacer()

                    Text("\(context.state.angle)°")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.white.opacity(0.7))
                }

                Spacer(minLength: 4)

                // Bottom row: navigation buttons
                HStack(spacing: 10) {
                    Button(intent: PreviousClimbIntent()) {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Prev")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(context.state.hasPrevious ? .white : .white.opacity(0.3))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(context.state.hasPrevious ? Color.white.opacity(0.15) : Color.white.opacity(0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .disabled(!context.state.hasPrevious)

                    Button(intent: NextClimbIntent()) {
                        HStack(spacing: 4) {
                            Text("Next")
                            Image(systemName: "chevron.right")
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(context.state.hasNext ? .white : .white.opacity(0.3))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(context.state.hasNext ? Color.white.opacity(0.15) : Color.white.opacity(0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .disabled(!context.state.hasNext)
                }
            }
        }
        .padding(16)
    }

    private var staleView: some View {
        HStack {
            Image(systemName: "mountain.2.fill")
                .font(.title3)
                .foregroundColor(.white.opacity(0.4))

            Text("Session ended")
                .font(.headline)
                .foregroundColor(.white.opacity(0.5))
        }
        .frame(maxWidth: .infinity)
        .padding(16)
    }
}
