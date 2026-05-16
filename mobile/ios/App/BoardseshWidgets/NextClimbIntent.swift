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

        // BLE write (main app process only) and HTTP POST to the backend are
        // independent — run them concurrently so a slow CoreBluetooth state
        // restoration doesn't delay the backend / other party clients.
        #if !WIDGET_EXTENSION
        async let bleWrite: Void = LiveActivityBleBridge.writeBoardForIntent(items: items, currentIndex: nextIndex)
        #endif

        let httpSuccess = await WidgetNetworking.sendNavigation(action: "next", currentIndex: nextIndex)
        if !httpSuccess {
            defaults.set("next", forKey: SharedConstants.pendingActionKey)
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
