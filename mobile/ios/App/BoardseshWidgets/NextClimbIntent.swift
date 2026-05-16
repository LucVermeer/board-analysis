import ActivityKit
import AppIntents

#if !WIDGET_EXTENSION
import UIKit
#endif

@available(iOS 17.0, *)
struct NextClimbIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Next Climb"
    static var description = IntentDescription("Navigate to the next climb in the queue")

    func perform() async throws -> some IntentResult {
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
        // board. iOS launches the app in the background to perform the intent
        // when the intent type is registered in the main-app target, even when
        // the app was suspended. CoreBluetooth state restoration is
        // asynchronous, so we await readiness (peripheral + write
        // characteristic discovered) up to 3s before issuing the write, and
        // wrap the whole thing in a background task so the OS doesn't suspend
        // us mid-write.
        await writeBoardOnMainApp(items: items, currentIndex: nextIndex)
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

#if !WIDGET_EXTENSION
@available(iOS 17.0, *)
private func writeBoardOnMainApp(items: [SharedQueueItem], currentIndex: Int) async {
    let task = await MainActor.run {
        UIApplication.shared.beginBackgroundTask(withName: "ble-display-intent")
    }
    await BoardBleManager.shared.displayCurrentItemAwaitingReady(
        items: items, currentIndex: currentIndex, timeout: 3.0
    )
    await MainActor.run {
        UIApplication.shared.endBackgroundTask(task)
    }
}
#endif
