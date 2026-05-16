import XCTest
@testable import App

final class WaiterPoolTests: XCTestCase {
    private var queue: DispatchQueue!
    private var pool: WaiterPool!

    override func setUp() {
        super.setUp()
        queue = DispatchQueue(label: "test.waiter-pool.\(UUID().uuidString)")
        pool = WaiterPool(queue: queue)
    }

    override func tearDown() {
        pool = nil
        queue = nil
        super.tearDown()
    }

    // MARK: - Immediate resume

    func testWaitReturnsImmediatelyWhenIsReadyIsTrue() async {
        let start = Date()
        await pool.wait(timeout: 5.0) { true }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertLessThan(elapsed, 0.1, "Expected near-immediate return, took \(elapsed)s")
    }

    // MARK: - Signal-based resume

    func testWaitResumesWhenSignalAllCalled() async {
        let signalAfter: TimeInterval = 0.05
        let start = Date()

        // Fire signalAll asynchronously while wait is suspended.
        queue.asyncAfter(deadline: .now() + signalAfter) { [weak self] in
            self?.pool.signalAll()
        }

        await pool.wait(timeout: 5.0) { false }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertGreaterThan(elapsed, signalAfter * 0.5, "Resumed too quickly (\(elapsed)s) — should have suspended until signalAll")
        XCTAssertLessThan(elapsed, 1.0, "Resumed too slowly (\(elapsed)s) — expected signalAll to drive resume")
    }

    // MARK: - Timeout

    func testWaitResumesViaTimeoutWhenSignalNeverCalled() async {
        let timeout: TimeInterval = 0.15
        let start = Date()
        await pool.wait(timeout: timeout) { false }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertGreaterThanOrEqual(elapsed, timeout * 0.8, "Resumed before timeout (\(elapsed)s, expected ~\(timeout)s)")
        XCTAssertLessThan(elapsed, timeout + 0.3, "Resumed long after timeout (\(elapsed)s, expected ~\(timeout)s)")
    }

    // MARK: - Concurrent waiters

    func testMultipleConcurrentWaitersAllResumeOnSignalAll() async {
        let waiterCount = 5
        let signalAfter: TimeInterval = 0.05

        queue.asyncAfter(deadline: .now() + signalAfter) { [weak self] in
            self?.pool.signalAll()
        }

        let start = Date()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<waiterCount {
                group.addTask { [pool] in
                    await pool!.wait(timeout: 5.0) { false }
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
        let signalAfter: TimeInterval = 0.1

        queue.asyncAfter(deadline: .now() + signalAfter) { [weak self] in
            self?.pool.signalAll()
        }

        let start = Date()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<3 {
                group.addTask { [pool] in
                    await pool!.wait(timeout: 1.0) { false }
                }
            }
        }
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertLessThan(elapsed, 0.5, "Expected signal-driven resume (~0.1s), got \(elapsed)s — possibly timed out instead")
    }

    // MARK: - hasPendingWaiters

    func testHasPendingWaitersReflectsState() async {
        let isPendingBefore = await readHasPendingWaiters()
        XCTAssertFalse(isPendingBefore, "Pool should start empty")

        let waitTask = Task { [pool] in
            await pool!.wait(timeout: 2.0) { false }
        }

        // Give the wait a moment to enqueue on the pool's queue.
        try? await Task.sleep(nanoseconds: 50_000_000)

        let isPendingDuring = await readHasPendingWaiters()
        XCTAssertTrue(isPendingDuring, "Pool should report a pending waiter while a wait is suspended")

        await runOnQueue { [pool] in
            pool!.signalAll()
        }

        await waitTask.value

        let isPendingAfter = await readHasPendingWaiters()
        XCTAssertFalse(isPendingAfter, "Pool should be empty after signalAll")
    }

    func testSignalAllOnEmptyPoolIsNoop() async {
        await runOnQueue { [pool] in
            pool!.signalAll()
            pool!.signalAll()
            pool!.signalAll()
        }
        // If signalAll on empty pool double-resumed anything we'd already
        // have trapped on a CheckedContinuation. Reaching here is success.
        XCTAssertFalse(await readHasPendingWaiters())
    }

    // MARK: - Helpers

    private func readHasPendingWaiters() async -> Bool {
        await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            queue.async { [pool] in
                continuation.resume(returning: pool!.hasPendingWaiters)
            }
        }
    }

    private func runOnQueue(_ block: @escaping () -> Void) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                block()
                continuation.resume()
            }
        }
    }
}
