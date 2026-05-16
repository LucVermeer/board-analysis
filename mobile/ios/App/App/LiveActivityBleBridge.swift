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
        let task = BleIntentBackgroundTask()
        task.begin(name: "ble-display-intent")
        defer { task.end() }
        await BoardBleManager.shared.displayCurrentItemAwaitingReady(
            items: items,
            currentIndex: currentIndex,
            readyTimeout: 3.0
        )
    }
}

/// Owns a single `UIBackgroundTaskIdentifier`. Begin and end are atomic and
/// idempotent so the expiration handler, the `defer` cleanup, and (in pathological
/// double-tap scenarios) a deinit can all race without crashing or leaking the
/// identifier. `UIApplication.beginBackgroundTask` / `endBackgroundTask` are
/// documented to be safe from any thread, so we don't hop to MainActor.
private final class BleIntentBackgroundTask: @unchecked Sendable {
    private let lock = NSLock()
    private var taskId: UIBackgroundTaskIdentifier = .invalid

    func begin(name: String) {
        lock.lock()
        defer { lock.unlock() }
        guard taskId == .invalid else { return }
        taskId = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            self?.end()
        }
    }

    func end() {
        lock.lock()
        defer { lock.unlock() }
        guard taskId != .invalid else { return }
        UIApplication.shared.endBackgroundTask(taskId)
        taskId = .invalid
    }

    deinit {
        end()
    }
}
