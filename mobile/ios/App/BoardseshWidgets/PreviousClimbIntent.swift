import ActivityKit
import AppIntents
import os.log

@available(iOS 17.0, *)
struct PreviousClimbIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Previous Climb"
    static var description = IntentDescription("Navigate to the previous climb in the queue")

    private static let logger = Logger(subsystem: "com.boardsesh.app", category: "LiveActivityIntent")

    func perform() async throws -> some IntentResult {
        #if DEBUG
        // See NextClimbIntent: kept under DEBUG so production builds don't
        // log on every tap, but dev builds still surface the routing fact.
        Self.logger.debug("PreviousClimbIntent.perform() running in bundle=\(Bundle.main.bundleIdentifier ?? "unknown", privacy: .public) process=\(ProcessInfo.processInfo.processName, privacy: .public)")
        #endif

        guard let defaults = SharedConstants.sharedDefaults else {
            return .result()
        }

        let (items, currentIndex) = SharedQueueState.load(from: defaults)

        let prevIndex = currentIndex - 1
        guard prevIndex >= 0, prevIndex < items.count else {
            return .result()
        }

        SharedQueueState.saveCurrentIndex(prevIndex, to: defaults)

        let prevItem = items[prevIndex]
        let newState = ClimbSessionAttributes.ContentState(
            climbName: prevItem.climbName,
            climbDifficulty: VGradeFormatter.formatVGrade(prevItem.difficulty),
            angle: prevItem.angle,
            currentIndex: prevIndex,
            totalClimbs: items.count,
            hasNext: prevIndex < items.count - 1,
            hasPrevious: prevIndex > 0,
            climbUuid: prevItem.climbUuid
        )

        for activity in Activity<ClimbSessionAttributes>.activities {
            guard activity.activityState == .active else { continue }
            let content = ActivityContent(state: newState, staleDate: Date().addingTimeInterval(180))
            await activity.update(content)
        }

        // See NextClimbIntent: BLE write and HTTP POST run concurrently.
        #if !WIDGET_EXTENSION
        async let bleWrite: Void = LiveActivityBleBridge.writeBoardForIntent(items: items, currentIndex: prevIndex)
        #endif

        let httpSuccess = await WidgetNetworking.sendNavigation(action: "previous", currentIndex: prevIndex)
        if !httpSuccess {
            defaults.set("previous", forKey: SharedConstants.pendingActionKey)
            postQueueNavigateDarwinNotification()
        }

        #if !WIDGET_EXTENSION
        await bleWrite
        #endif

        return .result()
    }

    private func postQueueNavigateDarwinNotification() {
        let name = SharedConstants.queueNavigateNotification as CFString
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(name),
            nil, nil, true
        )
    }
}
