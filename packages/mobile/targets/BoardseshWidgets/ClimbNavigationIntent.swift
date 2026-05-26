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

    /// CorrelationId the backend's `/api/widget/navigate` handler uses when it
    /// broadcasts `CurrentClimbChanged` after a successful HTTP widget call.
    /// Kept in sync with `widget-navigate.ts`'s `'widget-navigate'` literal —
    /// changing one without the other breaks the JS reducer's own-echo
    /// suppression and causes the BLE-paired phone to re-fire the BLE write.
    static let httpSuccessCorrelationId = "widget-navigate"

    static func perform(direction: ClimbNavigationDirection, label: String) async {
        // One notice per intent firing — production TestFlight builds need
        // this signal to diagnose "widget UI moved but wall didn't" reports.
        // Volume is bounded by user taps so the log isn't noisy.
        logger.notice("\(label).perform() running bundle=\(Bundle.main.bundleIdentifier ?? "unknown", privacy: .public) process=\(ProcessInfo.processInfo.processName, privacy: .public) direction=\(direction.rawValue, privacy: .public)")

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

        // Always tell the JS side that navigation happened so its reducer can
        // run the optimistic `dispatchWidgetNavigation` path on board routes.
        // On HTTP success we use the static correlationId the backend will
        // echo back; on failure we set pendingActionKey so the Darwin handler
        // (in the main app) sends a WebSocket mutation fallback with a fresh
        // UUID before notifying JS.
        defaults.set(direction.rawValue, forKey: SharedConstants.widgetNavigateActionKey)
        if httpSuccess {
            defaults.set(httpSuccessCorrelationId, forKey: SharedConstants.widgetNavigateCorrelationIdKey)
            defaults.removeObject(forKey: SharedConstants.pendingActionKey)
        } else {
            // Mutation-fallback path: handler generates its own UUID, writes
            // it back to widgetNavigateCorrelationIdKey, then notifies JS.
            defaults.set(direction.rawValue, forKey: SharedConstants.pendingActionKey)
            defaults.removeObject(forKey: SharedConstants.widgetNavigateCorrelationIdKey)
        }

        // Wait for the native BLE write to drain before waking JS via the
        // Darwin notification. Without this, the JS-side BluetoothAutoSender
        // can dispatch its own write for the same climb while BoardBleManager
        // is still chunking out the intent's packet — at best it interleaves
        // wastefully on the UART, at worst it stalls a marginal connection.
        // Serializing here means BoardBleManager's queue has fully drained
        // by the time AutoSender's write enqueues, so the same-content
        // re-send is a fast no-op against the wall's last-frame buffer.
        #if !WIDGET_EXTENSION
        await bleWrite
        #endif

        postQueueNavigateDarwinNotification()
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
