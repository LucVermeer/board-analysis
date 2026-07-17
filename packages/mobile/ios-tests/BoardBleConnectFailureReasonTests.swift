import CoreBluetooth
import XCTest

/// Unit tests for the connect-failure sub-reason attribution that backs
/// `getLastConnectFailureReason` (#3676): the pure `BoardBleConnectFailureReason`
/// enum (construction from a CoreBluetooth NSError + the bridge dictionary shape)
/// and the manager's clear-on-read stash contract. Mirrors the pure-decision
/// approach of BoardBleServiceDiscoveryTests so it runs without a real
/// `CBCentralManager`.
@available(iOS 17.0, *)
final class BoardBleConnectFailureReasonTests: XCTestCase {
    private var scheduler: FakeBleTimerScheduler!
    private var manager: BoardBleManager!

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

    // MARK: - Pure enum construction from a didFailToConnect NSError

    func testFromNilErrorHasNoCodeOrDomain() {
        XCTAssertEqual(
            BoardBleConnectFailureReason.from(didFailToConnectError: nil),
            .didFailToConnect(code: nil, domain: nil)
        )
    }

    func testFromCoreBluetoothErrorCarriesCodeAndDomain() {
        let error = NSError(domain: CBErrorDomain, code: 7, userInfo: nil)
        XCTAssertEqual(
            BoardBleConnectFailureReason.from(didFailToConnectError: error),
            .didFailToConnect(code: 7, domain: CBErrorDomain)
        )
    }

    // MARK: - Bridge dictionary shape

    func testWatchdogTimeoutDictionaryIsReasonOnly() {
        let dictionary = BoardBleConnectFailureReason.watchdogTimeout.analyticsDictionary
        XCTAssertEqual(dictionary["reason"] as? String, "watchdog_timeout")
        XCTAssertNil(dictionary["cbErrorCode"])
        XCTAssertNil(dictionary["cbErrorDomain"])
    }

    func testDiscoveryTimeoutDictionaryIsReasonOnly() {
        let dictionary = BoardBleConnectFailureReason.discoveryTimeout.analyticsDictionary
        XCTAssertEqual(dictionary["reason"] as? String, "discovery_timeout")
        XCTAssertNil(dictionary["cbErrorCode"])
        XCTAssertNil(dictionary["cbErrorDomain"])
    }

    func testDidFailToConnectDictionaryCarriesCbError() {
        let dictionary = BoardBleConnectFailureReason
            .didFailToConnect(code: 3, domain: CBErrorDomain)
            .analyticsDictionary
        XCTAssertEqual(dictionary["reason"] as? String, "did_fail_to_connect")
        XCTAssertEqual(dictionary["cbErrorCode"] as? Int, 3)
        XCTAssertEqual(dictionary["cbErrorDomain"] as? String, CBErrorDomain)
    }

    func testDidFailToConnectDictionaryOmitsMissingCbError() {
        let dictionary = BoardBleConnectFailureReason
            .didFailToConnect(code: nil, domain: nil)
            .analyticsDictionary
        XCTAssertEqual(dictionary["reason"] as? String, "did_fail_to_connect")
        XCTAssertNil(dictionary["cbErrorCode"])
        XCTAssertNil(dictionary["cbErrorDomain"])
    }

    // MARK: - Clear-on-read stash contract

    func testTakeReturnsNilWithNoStashedReason() {
        XCTAssertNil(manager.takeConnectFailureReasonAnalytics())
    }

    func testTakeReturnsStashedReasonThenClears() {
        manager.testHooks.setConnectFailureReason(.watchdogTimeout)

        let first = manager.takeConnectFailureReasonAnalytics()
        XCTAssertEqual(first?["reason"] as? String, "watchdog_timeout")

        // Clear-on-read: a single failure is attributed to a single event.
        XCTAssertNil(manager.takeConnectFailureReasonAnalytics())
    }
}
