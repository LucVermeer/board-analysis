import Foundation
import UIKit

/// Shared bridge invoked from `LiveActivityIntent.perform()` when it runs in
/// the main app process. Only compiled into the `App` target — the widget
/// extension cannot link `BoardBleManager` or call `UIApplication`, and the
/// intent files gate the call site behind `#if !WIDGET_EXTENSION`.
@available(iOS 17.0, *)
enum LiveActivityBleBridge {
    /// Awaits BLE readiness and issues a board display write inside a
    /// `beginBackgroundTask` window. The window carries its own expiration
    /// handler that cleanly releases the task identifier if iOS reclaims
    /// background budget before the write completes — without that handler
    /// the system terminates the app on expiry instead of giving us a chance
    /// to release the identifier ourselves.
    static func writeBoardForIntent(items: [SharedQueueItem], currentIndex: Int) async {
        let task = await BleIntentBackgroundTask()
        await task.begin(name: "ble-display-intent")
        await BoardBleManager.shared.displayCurrentItemAwaitingReady(
            items: items,
            currentIndex: currentIndex,
            readyTimeout: 3.0
        )
        await task.end()
    }
}

/// Owns a single `UIBackgroundTaskIdentifier`. `UIApplication.shared` is
/// `@MainActor`-isolated under Swift 6 strict concurrency; pinning this
/// class to `@MainActor` makes the begin/end accesses well-formed without
/// needing an external lock — main-actor serialization replaces the prior
/// `NSLock`. The expiration handler closure runs on the main thread per
/// Apple, so the `self?.end()` call is a same-actor invocation.
@available(iOS 17.0, *)
@MainActor
private final class BleIntentBackgroundTask {
    private var taskId: UIBackgroundTaskIdentifier = .invalid

    func begin(name: String) {
        guard taskId == .invalid else { return }
        taskId = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            self?.end()
        }
    }

    /// Idempotent — safe to call from the expiration handler and from the
    /// explicit `await task.end()` site at the end of `writeBoardForIntent`.
    /// Whichever runs second observes `taskId == .invalid` and no-ops.
    func end() {
        guard taskId != .invalid else { return }
        let id = taskId
        taskId = .invalid
        UIApplication.shared.endBackgroundTask(id)
    }
}
