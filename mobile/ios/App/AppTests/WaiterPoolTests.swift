import XCTest
@testable import App

final class WaiterPoolTests: XCTestCase {

    // MARK: - Immediate resume

    func testWaitReturnsImmediatelyWhenIsReadyIsTrue() async {
        let pool = makePool()
        let start = Date()
        await pool.wait(timeout: 5.0) { true }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertLessThan(elapsed, 0.1, "Expected near-immediate return, took \(elapsed)s")
    }

    // MARK: - Signal-based resume

    func testWaitResumesWhenSignalAllCalled() async {
        let (pool, queue) = makePoolAndQueue()
        let signalAfter: TimeInterval = 0.05
        let start = Date()

        // Fire signalAll asynchronously while wait is suspended.
        queue.asyncAfter(deadline: .now() + signalAfter) {
            pool.signalAll()
        }

        await pool.wait(timeout: 5.0) { false }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertGreaterThan(elapsed, signalAfter * 0.5, "Resumed too quickly (\(elapsed)s) — should have suspended until signalAll")
        XCTAssertLessThan(elapsed, 1.0, "Resumed too slowly (\(elapsed)s) — expected signalAll to drive resume")
    }

    // MARK: - Timeout

    func testWaitResumesViaTimeoutWhenSignalNeverCalled() async {
        // Verifies the timeout path resumes at all — we don't try to assert
        // tight bounds on *when* it resumes, because a loaded CI runner can
        // delay the work item arbitrarily. Lower bound proves the waiter
        // actually suspended (rather than returning immediately on a stale
        // ready signal); upper bound is a hang detector.
        let pool = makePool()
        let timeout: TimeInterval = 0.15
        let start = Date()
        await pool.wait(timeout: timeout) { false }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertGreaterThanOrEqual(elapsed, timeout * 0.5, "Resumed before timeout (\(elapsed)s, expected at least \(timeout * 0.5)s)")
        XCTAssertLessThan(elapsed, 2.0, "Resumed long after timeout (\(elapsed)s) — possibly hung")
    }

    // MARK: - Concurrent waiters

    func testMultipleConcurrentWaitersAllResumeOnSignalAll() async {
        let (pool, queue) = makePoolAndQueue()
        let waiterCount = 5
        let signalAfter: TimeInterval = 0.05

        queue.asyncAfter(deadline: .now() + signalAfter) {
            pool.signalAll()
        }

        let start = Date()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<waiterCount {
                group.addTask {
                    await pool.wait(timeout: 5.0) { false }
                }
            }
        }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertLessThan(elapsed, 1.0, "All waiters should have resumed via signalAll within 1s, took \(elapsed)s")
    }

    func testMixedSignalAndTimeoutInterleaving() async {
        // Three waiters with 1s timeout. Signal at 0.1s — all three should
        // resume via signal, not timeout. Verifies signal cancels the
        // per-waiter DispatchWorkItem cleanly without double-resume.
        let (pool, queue) = makePoolAndQueue()
        let signalAfter: TimeInterval = 0.1

        queue.asyncAfter(deadline: .now() + signalAfter) {
            pool.signalAll()
        }

        let start = Date()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<3 {
                group.addTask {
                    await pool.wait(timeout: 1.0) { false }
                }
            }
        }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertLessThan(elapsed, 0.5, "Expected signal-driven resume (~0.1s), got \(elapsed)s — possibly timed out instead")
    }

    // MARK: - hasPendingWaiters

    func testHasPendingWaitersReflectsState() async {
        let (pool, queue) = makePoolAndQueue()

        let isPendingBefore = await Self.readHasPendingWaiters(pool: pool, queue: queue)
        XCTAssertFalse(isPendingBefore, "Pool should start empty")

        let waitTask = Task {
            await pool.wait(timeout: 2.0) { false }
        }

        // Poll until the waiter is observed enqueued on the pool's queue.
        // A fixed sleep would race on a slow CI runner where the new Task
        // hasn't been scheduled yet.
        let pendingObserved = await Self.pollUntil(timeout: 2.0) {
            await Self.readHasPendingWaiters(pool: pool, queue: queue)
        }
        XCTAssertTrue(pendingObserved, "Pool should report a pending waiter within 2s")

        await Self.runOnQueue(queue) {
            pool.signalAll()
        }

        await waitTask.value

        let isPendingAfter = await Self.readHasPendingWaiters(pool: pool, queue: queue)
        XCTAssertFalse(isPendingAfter, "Pool should be empty after signalAll")
    }

    // MARK: - Signal-cancels-timeout race

    func testSignalAllRacingWithTimeoutDoesNotDoubleResume() async {
        // signalAll is scheduled to fire ~25 ms after the wait starts; the
        // wait's own timeout is 50 ms. The work item is queued at +50 ms but
        // signalAll's `cancel()` at +25 ms removes it from the queue before
        // it can run. If signalAll AND the timeout both managed to resume
        // the same continuation, CheckedContinuation would trap. Reaching
        // the end of the test without trapping locks the invariant in.
        let (pool, queue) = makePoolAndQueue()

        queue.asyncAfter(deadline: .now() + 0.025) {
            pool.signalAll()
        }

        await pool.wait(timeout: 0.05) { false }

        // Give any (cancelled) work item a chance to fire — it should not.
        try? await Task.sleep(nanoseconds: 100_000_000)

        let isPending = await Self.readHasPendingWaiters(pool: pool, queue: queue)
        XCTAssertFalse(isPending, "Pool should be empty after signalAll cancelled the timeout")
    }

    func testTimeoutFiringFirstSkipsLaterSignalAll() async {
        // The opposite ordering: let the timeout resume the continuation
        // first, then call signalAll. The timeout's work item removes the
        // waiter from the pool's array, so signalAll sees an empty array
        // and does nothing. Locks in the remove-by-id semantics.
        let (pool, queue) = makePoolAndQueue()

        await pool.wait(timeout: 0.05) { false }

        await Self.runOnQueue(queue) {
            pool.signalAll()
        }

        let isPending = await Self.readHasPendingWaiters(pool: pool, queue: queue)
        XCTAssertFalse(isPending, "Pool should be empty after timeout-then-signalAll")
    }

    func testSignalAllOnEmptyPoolIsNoop() async {
        let (pool, queue) = makePoolAndQueue()

        await Self.runOnQueue(queue) {
            pool.signalAll()
            pool.signalAll()
            pool.signalAll()
        }

        // If signalAll on empty pool double-resumed anything we'd already
        // have trapped on a CheckedContinuation. Reaching here is success.
        let isPending = await Self.readHasPendingWaiters(pool: pool, queue: queue)
        XCTAssertFalse(isPending)
    }

    // MARK: - Helpers

    private func makePool() -> WaiterPool {
        makePoolAndQueue().0
    }

    private func makePoolAndQueue() -> (WaiterPool, DispatchQueue) {
        let queue = DispatchQueue(label: "test.waiter-pool.\(UUID().uuidString)")
        let pool = WaiterPool(queue: queue)
        return (pool, queue)
    }

    /// Static so the closure passed to `withCheckedContinuation` doesn't
    /// capture `self` — XCTestCase isn't `Sendable`, and DispatchQueue's
    /// `async` closure is `@Sendable`. Capturing `pool` and `queue` by
    /// value (both `Sendable`) keeps strict-concurrency happy.
    private static func readHasPendingWaiters(pool: WaiterPool, queue: DispatchQueue) async -> Bool {
        await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            queue.async {
                continuation.resume(returning: pool.hasPendingWaiters)
            }
        }
    }

    private static func runOnQueue(_ queue: DispatchQueue, _ block: @escaping @Sendable () -> Void) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                block()
                continuation.resume()
            }
        }
    }

    /// Polls `predicate` every 50ms for up to `timeout` seconds. Returns
    /// `true` as soon as the predicate returns `true`; returns `false` if
    /// the timeout elapses first. Replaces fixed-duration sleeps that race
    /// on heavily loaded CI runners.
    private static func pollUntil(timeout: TimeInterval, _ predicate: @Sendable () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await predicate() {
                return true
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return false
    }
}
