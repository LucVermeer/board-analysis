import ActivityKit
import AppIntents
import os.log

@available(iOS 17.0, *)
struct NextClimbIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Next Climb"
    static var description = IntentDescription("Navigate to the next climb in the queue")

    private static let logger = Logger(subsystem: "com.boardsesh.app", category: "LiveActivityIntent")

    func perform() async throws -> some IntentResult {
        // Logged so we can confirm in Console.app which process iOS chose to
        // perform the intent in. If this logs from `BoardseshWidgets` while
        // the app is suspended, the main-app-only BLE path below is dead and
        // we need a different architecture. If it logs from `App`, the fix
        // is working as designed.
        Self.logger.info("NextClimbIntent.perform() running in bundle=\(Bundle.main.bundleIdentifier ?? "unknown", privacy: .public) process=\(ProcessInfo.processInfo.processName, privacy: .public)")

        guard let defaults = SharedConstants.sharedDefaults else {
            return .result()
        }

        let (items, currentIndex) = SharedQueueState.load(from: defaults)

        let nextIndex = currentIndex + 1
        guard nextIndex < items.count else {
            return .result()
        }

        SharedQueueState.saveCurrentIndex(nextIndex, to: defaults)

        let nextItem = items[nextIndex]
        let newState = ClimbSessionAttributes.ContentState(
            climbName: nextItem.climbName,
            climbDifficulty: VGradeFormatter.formatVGrade(nextItem.difficulty),
            angle: nextItem.angle,
            currentIndex: nextIndex,
            totalClimbs: items.count,
            hasNext: nextIndex < items.count - 1,
            hasPrevious: nextIndex > 0,
            climbUuid: nextItem.climbUuid
        )

        for activity in Activity<ClimbSessionAttributes>.activities {
            guard activity.activityState == .active else { continue }
            let content = ActivityContent(state: newState, staleDate: Date().addingTimeInterval(180))
            await activity.update(content)
        }

        #if !WIDGET_EXTENSION
        // Running in the main app process — write directly to the connected
        // board. iOS background-launches the app to perform the intent when
        // the intent type is registered in the main-app target, even when
        // the app was suspended. See `LiveActivityBleBridge` for the
        // readiness wait + background-task wrapping.
        await LiveActivityBleBridge.writeBoardForIntent(items: items, currentIndex: nextIndex)
        #endif

        let httpSuccess = await WidgetNetworking.sendNavigation(action: "next", currentIndex: nextIndex)
        if !httpSuccess {
            defaults.set("next", forKey: SharedConstants.pendingActionKey)
            postQueueNavigateDarwinNotification()
        }

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
