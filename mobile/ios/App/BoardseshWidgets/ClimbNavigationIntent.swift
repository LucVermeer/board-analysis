import ActivityKit
import AppIntents
import os.log

@available(iOS 17.0, *)
enum ClimbNavigationDirection: String {
    case next
    case previous

    /// Returns the new queue index, or nil if navigation is out of bounds.
    func newIndex(from currentIndex: Int, count: Int) -> Int? {
        switch self {
        case .next:
            let candidate = currentIndex + 1
            return candidate < count ? candidate : nil
        case .previous:
            let candidate = currentIndex - 1
            return (candidate >= 0 && candidate < count) ? candidate : nil
        }
    }
}

/// Shared body for `NextClimbIntent.perform()` and
/// `PreviousClimbIntent.perform()`. Compiled into both the `App` and
/// `BoardseshWidgets` targets so the same code runs whether iOS routes the
/// intent to the main app process (the desired path) or to the widget
/// extension as a fallback.
@available(iOS 17.0, *)
enum ClimbNavigationIntent {
    private static let logger = Logger(subsystem: "com.boardsesh.app", category: "LiveActivityIntent")

    static func perform(direction: ClimbNavigationDirection, label: String) async {
        #if DEBUG
        // Lets us confirm in Console.app which process iOS chose to perform
        // the intent in. Kept under DEBUG so production builds don't log on
        // every tap, but dev builds surface immediately if Apple ever
        // changes the routing.
        logger.debug("\(label).perform() running in bundle=\(Bundle.main.bundleIdentifier ?? "unknown", privacy: .public) process=\(ProcessInfo.processInfo.processName, privacy: .public)")
        #endif

        guard let defaults = SharedConstants.sharedDefaults else { return }

        let (items, currentIndex) = SharedQueueState.load(from: defaults)
        guard let newIndex = direction.newIndex(from: currentIndex, count: items.count) else {
            return
        }

        SharedQueueState.saveCurrentIndex(newIndex, to: defaults)

        let newItem = items[newIndex]
        let newState = ClimbSessionAttributes.ContentState(
            climbName: newItem.climbName,
            climbDifficulty: VGradeFormatter.formatVGrade(newItem.difficulty),
            angle: newItem.angle,
            currentIndex: newIndex,
            totalClimbs: items.count,
            hasNext: newIndex < items.count - 1,
            hasPrevious: newIndex > 0,
            climbUuid: newItem.climbUuid
        )

        for activity in Activity<ClimbSessionAttributes>.activities {
            guard activity.activityState == .active else { continue }
            let content = ActivityContent(state: newState, staleDate: Date().addingTimeInterval(180))
            await activity.update(content)
        }

        // BLE write (main app process only) and HTTP POST to the backend run
        // concurrently so a slow CoreBluetooth state restoration doesn't
        // delay backend propagation to other party clients.
        #if !WIDGET_EXTENSION
        async let bleWrite: Void = LiveActivityBleBridge.writeBoardForIntent(items: items, currentIndex: newIndex)
        #endif

        let httpSuccess = await WidgetNetworking.sendNavigation(action: direction.rawValue, currentIndex: newIndex)
        if !httpSuccess {
            defaults.set(direction.rawValue, forKey: SharedConstants.pendingActionKey)
            postQueueNavigateDarwinNotification()
        }

        #if !WIDGET_EXTENSION
        await bleWrite
        #endif
    }

    private static func postQueueNavigateDarwinNotification() {
        let name = SharedConstants.queueNavigateNotification as CFString
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(name),
            nil, nil, true
        )
    }
}
