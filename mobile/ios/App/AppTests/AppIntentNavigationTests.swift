import XCTest
@testable import App

// MARK: - Queue Navigation Logic (extracted for testability)

/// Pure functions that mirror the navigation logic used by NextClimbIntent
/// and PreviousClimbIntent, without ActivityKit or Darwin notification
/// dependencies.
private enum QueueNavigation {

    struct NavigationResult {
        let newIndex: Int
        let didNavigate: Bool
    }

    static func next(currentIndex: Int, itemCount: Int) -> NavigationResult {
        let nextIndex = currentIndex + 1
        guard nextIndex < itemCount else {
            return NavigationResult(newIndex: currentIndex, didNavigate: false)
        }
        return NavigationResult(newIndex: nextIndex, didNavigate: true)
    }

    static func previous(currentIndex: Int, itemCount: Int) -> NavigationResult {
        let prevIndex = currentIndex - 1
        guard prevIndex >= 0 else {
            return NavigationResult(newIndex: currentIndex, didNavigate: false)
        }
        return NavigationResult(newIndex: prevIndex, didNavigate: true)
    }
}

// MARK: - Tests

final class AppIntentNavigationTests: XCTestCase {

    // MARK: - Helpers

    private let testSuiteName = "com.boardsesh.test.intents.\(UUID().uuidString)"

    private lazy var testDefaults: UserDefaults = {
        let defaults = UserDefaults(suiteName: testSuiteName)!
        return defaults
    }()

    override func tearDown() {
        super.tearDown()
        UserDefaults.standard.removePersistentDomain(forName: testSuiteName)
    }

    private func makeQueueItem(
        uuid: String = UUID().uuidString,
        climbUuid: String = UUID().uuidString,
        climbName: String = "Test Climb",
        difficulty: String = "V5",
        angle: Int = 40
    ) -> SharedQueueItem {
        SharedQueueItem(
            uuid: uuid,
            climbUuid: climbUuid,
            climbName: climbName,
            difficulty: difficulty,
            angle: angle,
            frames: "p1r12p2r13",
            setterUsername: "tester"
        )
    }

    private func makeSampleQueue(count: Int) -> [SharedQueueItem] {
        (0..<count).map { i in
            makeQueueItem(
                uuid: "queue-\(i)",
                climbUuid: "climb-\(i)",
                climbName: "Climb \(i)",
                difficulty: "V\(i + 1)",
                angle: 30 + i * 5
            )
        }
    }

    // MARK: - Next Climb Calculation

    func testNextClimbCalculation() {
        let result = QueueNavigation.next(currentIndex: 2, itemCount: 5)

        XCTAssertTrue(result.didNavigate)
        XCTAssertEqual(result.newIndex, 3)
    }

    func testNextClimbAtEnd() {
        let result = QueueNavigation.next(currentIndex: 4, itemCount: 5)

        XCTAssertFalse(result.didNavigate, "Should not navigate past the last item")
        XCTAssertEqual(result.newIndex, 4, "Index should stay at 4")
    }

    // MARK: - Previous Climb Calculation

    func testPreviousClimbCalculation() {
        let result = QueueNavigation.previous(currentIndex: 2, itemCount: 5)

        XCTAssertTrue(result.didNavigate)
        XCTAssertEqual(result.newIndex, 1)
    }

    func testPreviousClimbAtStart() {
        let result = QueueNavigation.previous(currentIndex: 0, itemCount: 5)

        XCTAssertFalse(result.didNavigate, "Should not navigate before the first item")
        XCTAssertEqual(result.newIndex, 0, "Index should stay at 0")
    }

    // MARK: - Shared State Integration

    func testNavigationUpdatesSharedState() {
        let items = makeSampleQueue(count: 5)
        SharedQueueState.save(items: items, currentIndex: 2, to: testDefaults)

        // Simulate a "next" navigation
        let (loadedItems, currentIndex) = SharedQueueState.load(from: testDefaults)
        let result = QueueNavigation.next(currentIndex: currentIndex, itemCount: loadedItems.count)
        XCTAssertTrue(result.didNavigate)

        // Persist the new index
        SharedQueueState.save(items: loadedItems, currentIndex: result.newIndex, to: testDefaults)

        // Verify the shared state reflects the navigation
        let (_, updatedIndex) = SharedQueueState.load(from: testDefaults)
        XCTAssertEqual(updatedIndex, 3)
    }

    func testSharedQueueItemDecodesOldPayloadWithoutMirroredField() throws {
        let json = """
        {
          "uuid": "queue-1",
          "climbUuid": "climb-1",
          "climbName": "Old Payload",
          "difficulty": "V4",
          "angle": 40,
          "frames": "p1r12",
          "setterUsername": "tester"
        }
        """
        let item = try JSONDecoder().decode(SharedQueueItem.self, from: Data(json.utf8))

        XCTAssertFalse(item.mirrored)
    }

    // MARK: - ContentState Flags

    func testBuildContentStateAfterNavigation() {
        let items = makeSampleQueue(count: 5)

        // Navigate from index 2 to 3
        let result = QueueNavigation.next(currentIndex: 2, itemCount: items.count)
        XCTAssertTrue(result.didNavigate)

        let state = LiveActivityManager.buildContentState(
            items: items,
            currentIndex: result.newIndex
        )

        XCTAssertNotNil(state)
        XCTAssertEqual(state?.currentIndex, 3)
        XCTAssertEqual(state?.climbName, "Climb 3")
        XCTAssertEqual(state?.climbDifficulty, "V4")
        XCTAssertTrue(state!.hasPrevious, "Index 3 should have previous")
        XCTAssertTrue(state!.hasNext, "Index 3 of 5 should have next")

        // Navigate to the last item
        let endResult = QueueNavigation.next(currentIndex: 3, itemCount: items.count)
        let endState = LiveActivityManager.buildContentState(
            items: items,
            currentIndex: endResult.newIndex
        )

        XCTAssertNotNil(endState)
        XCTAssertEqual(endState?.currentIndex, 4)
        XCTAssertFalse(endState!.hasNext, "Last item should not have next")
        XCTAssertTrue(endState!.hasPrevious, "Last item should have previous")

        // Navigate backwards to the first item
        let startState = LiveActivityManager.buildContentState(
            items: items,
            currentIndex: 0
        )

        XCTAssertNotNil(startState)
        XCTAssertTrue(startState!.hasNext, "First item of 5 should have next")
        XCTAssertFalse(startState!.hasPrevious, "First item should not have previous")
    }
}
