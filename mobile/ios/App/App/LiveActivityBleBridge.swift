import Foundation
import UIKit

/// Shared bridge invoked from `LiveActivityIntent.perform()` when it runs in
/// the main app process. Only compiled into the `App` target — the widget
/// extension cannot link `BoardBleManager` or call `UIApplication`, and the
/// intent files gate the call site behind `#if !WIDGET_EXTENSION`.
@available(iOS 17.0, *)
enum LiveActivityBleBridge {
    /// Awaits BLE readiness and issues a board display write inside a
    /// `beginBackgroundTask` window so iOS does not suspend the app between
    /// state restoration and the final UART chunk flush.
    static func writeBoardForIntent(items: [SharedQueueItem], currentIndex: Int) async {
        let task = await MainActor.run {
            UIApplication.shared.beginBackgroundTask(withName: "ble-display-intent")
        }
        await BoardBleManager.shared.displayCurrentItemAwaitingReady(
            items: items,
            currentIndex: currentIndex,
            readyTimeout: 3.0
        )
        await MainActor.run {
            UIApplication.shared.endBackgroundTask(task)
        }
    }
}
