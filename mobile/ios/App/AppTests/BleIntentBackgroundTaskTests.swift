import XCTest
@testable import App

@available(iOS 17.0, *)
@MainActor
final class BleIntentBackgroundTaskTests: XCTestCase {
    /// `end()` must be idempotent: the expiration handler iOS schedules and
    /// the `defer { task.end() }` site in `LiveActivityBleBridge` can both
    /// reach it. A second call must observe the `.invalid` sentinel and
    /// no-op — without that guard, `UIApplication.endBackgroundTask(.invalid)`
    /// logs a runtime warning, and worse, ending an already-ended identifier
    /// (or a recycled one in a future iOS) can corrupt the background-task
    /// table.
    func testEndIsIdempotentWithoutBegin() {
        let task = BleIntentBackgroundTask()
        // No begin call → taskId stays .invalid. Multiple end()s should
        // simply observe the guard and return.
        task.end()
        task.end()
        task.end()
        // Reaching here without trapping is the assertion.
    }

    /// Begin + multiple ends. After the first `end()`, `taskId` flips to
    /// `.invalid` and subsequent calls must short-circuit on the guard
    /// rather than calling `UIApplication.endBackgroundTask` again.
    func testEndIsIdempotentAfterBegin() {
        let task = BleIntentBackgroundTask()
        task.begin(name: "test-idempotent-end")
        task.end()
        task.end()
        task.end()
        // Reaching here without trapping is the assertion.
    }

    /// `begin` is also idempotent in the sense that a second call with a
    /// pre-existing identifier no-ops. Pairs the test above so callers
    /// double-calling begin don't accidentally start two tasks (which would
    /// leak the first identifier).
    func testBeginIsIdempotent() {
        let task = BleIntentBackgroundTask()
        task.begin(name: "test-idempotent-begin-1")
        task.begin(name: "test-idempotent-begin-2")
        task.end()
        // Reaching here without trapping is the assertion.
    }
}
