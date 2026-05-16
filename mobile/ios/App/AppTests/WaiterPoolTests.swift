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
        let pool = makePool()
        let timeout: TimeInterval = 0.15
        let start = Date()
        await pool.wait(timeout: timeout) { false }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertGreaterThanOrEqual(elapsed, timeout * 0.8, "Resumed before timeout (\(elapsed)s, expected ~\(timeout)s)")
        XCTAssertLessThan(elapsed, timeout + 0.3, "Resumed long after timeout (\(elapsed)s, expected ~\(timeout)s)")
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

        // Give the wait a moment to enqueue on the pool's queue.
        try? await Task.sleep(nanoseconds: 50_000_000)

        let isPendingDuring = await Self.readHasPendingWaiters(pool: pool, queue: queue)
        XCTAssertTrue(isPendingDuring, "Pool should report a pending waiter while a wait is suspended")

        await Self.runOnQueue(queue) {
            pool.signalAll()
        }

        await waitTask.value

        let isPendingAfter = await Self.readHasPendingWaiters(pool: pool, queue: queue)
        XCTAssertFalse(isPendingAfter, "Pool should be empty after signalAll")
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
}
