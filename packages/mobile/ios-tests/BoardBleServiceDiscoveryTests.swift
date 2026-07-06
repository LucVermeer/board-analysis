import CoreBluetooth
import XCTest

/// Unit tests for the pure service-discovery decision that backs
/// `didDiscoverServices` (#3480): prefer Nordic UART, fall back to the original
/// RedBearLab service, and — when a targeted probe finds neither — retry a full
/// GATT discovery ONCE (defeating a stale/partial iOS cache) before failing.
@available(iOS 17.0, *)
final class BoardBleServiceDiscoveryTests: XCTestCase {
    private var scheduler: FakeBleTimerScheduler!
    private var manager: BoardBleManager!

    // Mirrors the constants baked into BoardBleManager.
    private let uartServiceUuid = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    private let redBearLabServiceUuid = CBUUID(string: "713D0000-503E-4C75-BA94-3148F18D941E")
    private let unrelatedServiceUuid = CBUUID(string: "180A") // Device Information

    override func setUp() {
        super.setUp()
        scheduler = FakeBleTimerScheduler()
        manager = BoardBleManager(timerScheduler: scheduler, createCentralManagerEagerly: false)
    }

    override func tearDown() {
        manager = nil
        scheduler = nil
        super.tearDown()
    }

    private func decide(_ discovered: [CBUUID], retried: Bool) -> BoardBleManager.ServiceDiscoveryDecision {
        manager.testHooks.serviceDiscoveryDecision(
            discoveredServiceUuids: discovered,
            hasRetriedFullDiscovery: retried
        )
    }

    func testProbeOrderPrefersUartThenRedBearLab() {
        XCTAssertEqual(manager.testHooks.writeServiceUuidsForTesting, [uartServiceUuid, redBearLabServiceUuid])
    }

    func testSelectsUartWhenPresent() {
        XCTAssertEqual(decide([uartServiceUuid], retried: false), .select(uartServiceUuid))
    }

    func testSelectsRedBearLabWhenOnlyItIsPresent() {
        XCTAssertEqual(decide([redBearLabServiceUuid], retried: false), .select(redBearLabServiceUuid))
    }

    func testPrefersUartWhenBothPresent() {
        XCTAssertEqual(
            decide([redBearLabServiceUuid, uartServiceUuid], retried: false),
            .select(uartServiceUuid)
        )
    }

    func testRetriesFullDiscoveryOnFirstMiss() {
        XCTAssertEqual(decide([], retried: false), .retryFullDiscovery)
        // Unrelated services (a decoy peripheral / third controller gen) are
        // still a miss for OUR write services, so we still retry once.
        XCTAssertEqual(decide([unrelatedServiceUuid], retried: false), .retryFullDiscovery)
    }

    func testFailsOnSecondMissAfterRetry() {
        XCTAssertEqual(decide([], retried: true), .fail)
        XCTAssertEqual(decide([unrelatedServiceUuid], retried: true), .fail)
    }

    func testSelectsEvenAfterRetryWhenServiceFinallyAppears() {
        // The full re-discovery surfaced the service the targeted probe missed.
        XCTAssertEqual(decide([uartServiceUuid], retried: true), .select(uartServiceUuid))
    }
}
