import Foundation

/// Generic async-waiter pool. Each `wait(timeout:isReady:)` call suspends
/// until either `signalAll()` resumes pending waiters or the per-waiter
/// timeout elapses, whichever comes first.
///
/// All state mutation runs on the pool's serial `queue`, so the pool inherits
/// the queue's serial ordering — there's no internal locking. Callers must
/// invoke `signalAll()` and read `hasPendingWaiters` from that queue too.
///
/// Extracted from `BoardBleManager` so the waiter timing logic can be unit
/// tested without standing up a real `CBCentralManager`.
final class WaiterPool {
    private struct Waiter {
        let id: UUID
        let continuation: CheckedContinuation<Void, Never>
        let timeoutWorkItem: DispatchWorkItem
    }

    private let queue: DispatchQueue
    private var waiters: [Waiter] = []

    init(queue: DispatchQueue) {
        self.queue = queue
    }

    /// Returns immediately if `isReady()` is true when evaluated on the pool's
    /// queue; otherwise suspends until `signalAll()` is called or `timeout`
    /// elapses.
    func wait(timeout: TimeInterval, isReady: @escaping () -> Bool) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async { [weak self] in
                guard let self else {
                    continuation.resume()
                    return
                }
                if isReady() {
                    continuation.resume()
                    return
                }
                let waiterId = UUID()
                let workItem = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    if let index = self.waiters.firstIndex(where: { $0.id == waiterId }) {
                        let waiter = self.waiters.remove(at: index)
                        waiter.continuation.resume()
                    }
                }
                self.waiters.append(
                    Waiter(id: waiterId, continuation: continuation, timeoutWorkItem: workItem)
                )
                self.queue.asyncAfter(deadline: .now() + timeout, execute: workItem)
            }
        }
    }

    /// Resumes every currently pending waiter and cancels their pending
    /// timeout work items. Must be invoked from the pool's queue.
    func signalAll() {
        let snapshot = waiters
        waiters = []
        for waiter in snapshot {
            waiter.timeoutWorkItem.cancel()
            waiter.continuation.resume()
        }
    }

    /// `true` while at least one continuation is suspended. Must be read on
    /// the pool's queue.
    var hasPendingWaiters: Bool {
        !waiters.isEmpty
    }
}
