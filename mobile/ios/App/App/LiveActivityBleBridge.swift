import Foundation
import UIKit

/// Shared bridge invoked from `LiveActivityIntent.perform()` when it runs in
/// the main app process. Only compiled into the `App` target — the widget
/// extension cannot link `BoardBleManager` or call `UIApplication`, and the
/// intent files gate the call site behind `#if !WIDGET_EXTENSION`.
@available(iOS 17.0, *)
enum LiveActivityBleBridge {
    /// Awaits BLE readiness and issues a board display write inside a
    /// `beginBackgroundTask` window. Pinned to `@MainActor` so `defer { task.end() }`
    /// can call into the `@MainActor`-isolated background-task wrapper
    /// synchronously on any exit path — including a future where
    /// `displayCurrentItemAwaitingReady` becomes cancellation-aware and
    /// throws `CancellationError`. The `await` on the BLE work hops off
    /// main actor for the duration, so main actor is only briefly held at
    /// function entry/exit.
    @MainActor
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

/// Owns a single `UIBackgroundTaskIdentifier`. `@MainActor`-isolated so
/// `UIApplication.shared` (also `@MainActor`-isolated under Swift 6 strict
/// concurrency) can be accessed without locks. The expiration-handler
/// closure runs on the main thread per Apple, so `self?.end()` is a
/// same-actor invocation.
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
    /// `defer { task.end() }` site. Whichever runs second observes
    /// `taskId == .invalid` and no-ops.
    func end() {
        guard taskId != .invalid else { return }
        let id = taskId
        taskId = .invalid
        UIApplication.shared.endBackgroundTask(id)
    }
}
