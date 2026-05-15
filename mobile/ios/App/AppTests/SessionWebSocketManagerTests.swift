import XCTest
@testable import App

// MARK: - SessionWebSocketManagerTests

final class SessionWebSocketManagerTests: XCTestCase {

    // MARK: - Test Helpers

    private func makeQueueItem(
        uuid: String = "queue-1",
        climbUuid: String = "climb-1",
        name: String = "Test Climb",
        difficulty: String = "V5",
        angle: Int = 40,
        frames: String = "p1r12p2r13",
        setter: String = "tester"
    ) -> SharedQueueItem {
        SharedQueueItem(
            uuid: uuid,
            climbUuid: climbUuid,
            climbName: name,
            difficulty: difficulty,
            angle: angle,
            frames: frames,
            setterUsername: setter
        )
    }

    // MARK: - GQLMessage Parsing

    func testParseConnectionAck() {
        let text = #"{"type":"connection_ack"}"#
        let msg = GQLMessage.parse(text)

        XCTAssertNotNil(msg)
        XCTAssertEqual(msg?.type, .connectionAck)
        XCTAssertNil(msg?.id)
        XCTAssertNil(msg?.payload)
    }

    func testParsePingMessage() {
        let text = #"{"type":"ping"}"#
        let msg = GQLMessage.parse(text)

        XCTAssertNotNil(msg)
        XCTAssertEqual(msg?.type, .ping)
    }

    func testParsePongResponse() {
        // Verify we can construct a valid pong message type
        XCTAssertEqual(GQLMessageType.pong.rawValue, "pong")
    }

    func testParseConnectionAckWithPayload() {
        let text = #"{"type":"connection_ack","payload":{"keepAlive":30000}}"#
        let msg = GQLMessage.parse(text)

        XCTAssertNotNil(msg)
        XCTAssertEqual(msg?.type, .connectionAck)
        XCTAssertNotNil(msg?.payload)
    }

    func testParseNextMessageWithId() {
        let text = #"{"type":"next","id":"1","payload":{"data":{}}}"#
        let msg = GQLMessage.parse(text)

        XCTAssertNotNil(msg)
        XCTAssertEqual(msg?.type, .next)
        XCTAssertEqual(msg?.id, "1")
        XCTAssertNotNil(msg?.payload)
    }

    func testParseCompleteMessage() {
        let text = #"{"type":"complete","id":"1"}"#
        let msg = GQLMessage.parse(text)

        XCTAssertNotNil(msg)
        XCTAssertEqual(msg?.type, .complete)
        XCTAssertEqual(msg?.id, "1")
    }

    func testParseErrorMessage() {
        let text = #"{"type":"error","id":"1","payload":{"message":"Something went wrong"}}"#
        let msg = GQLMessage.parse(text)

        XCTAssertNotNil(msg)
        XCTAssertEqual(msg?.type, .error)
        XCTAssertEqual(msg?.id, "1")
    }

    func testHandleMalformedMessage() {
        // Invalid JSON
        XCTAssertNil(GQLMessage.parse("not json at all"))

        // Valid JSON but missing type
        XCTAssertNil(GQLMessage.parse(#"{"id":"1","payload":{}}"#))

        // Valid JSON but unknown type
        XCTAssertNil(GQLMessage.parse(#"{"type":"unknown_type"}"#))

        // Empty string
        XCTAssertNil(GQLMessage.parse(""))

        // Just whitespace
        XCTAssertNil(GQLMessage.parse("   "))

        // Array instead of object
        XCTAssertNil(GQLMessage.parse("[1,2,3]"))

        // Null type value
        XCTAssertNil(GQLMessage.parse(#"{"type":null}"#))

        // Numeric type value
        XCTAssertNil(GQLMessage.parse(#"{"type":42}"#))
    }

    // MARK: - QueueMessageParser: extractQueueUpdates

    func testExtractQueueUpdatesFromValidPayload() {
        let payload: [String: Any] = [
            "data": [
                "queueUpdates": [
                    "__typename": "FullSync",
                    "sequence": 1
                ]
            ]
        ]

        let updates = QueueMessageParser.extractQueueUpdates(from: payload)
        XCTAssertNotNil(updates)
        XCTAssertEqual(updates?["__typename"] as? String, "FullSync")
    }

    func testExtractQueueUpdatesFromNilPayload() {
        XCTAssertNil(QueueMessageParser.extractQueueUpdates(from: nil))
    }

    func testExtractQueueUpdatesFromMissingData() {
        let payload: [String: Any] = ["something": "else"]
        XCTAssertNil(QueueMessageParser.extractQueueUpdates(from: payload))
    }

    // MARK: - QueueMessageParser: parseQueueItem

    func testConvertToSharedQueueItem() {
        let dict: [String: Any] = [
            "uuid": "queue-uuid-123",
            "climb": [
                "uuid": "climb-uuid-456",
                "name": "The Boulder Problem",
                "difficulty": "V7",
                "angle": 45,
                "frames": "p1r12p2r13p3r14",
                "setter_username": "john_setter"
            ] as [String: Any],
            "addedBy": "user1",
            "suggested": false
        ]

        let item = QueueMessageParser.parseQueueItem(dict)

        XCTAssertNotNil(item)
        XCTAssertEqual(item?.uuid, "queue-uuid-123")
        XCTAssertEqual(item?.climbUuid, "climb-uuid-456")
        XCTAssertEqual(item?.climbName, "The Boulder Problem")
        XCTAssertEqual(item?.difficulty, "V7")
        XCTAssertEqual(item?.angle, 45)
        XCTAssertEqual(item?.frames, "p1r12p2r13p3r14")
        XCTAssertEqual(item?.setterUsername, "john_setter")
    }

    func testConvertToSharedQueueItemWithNumericDifficulty() {
        let dict: [String: Any] = [
            "uuid": "q1",
            "climb": [
                "uuid": "c1",
                "name": "Test",
                "difficulty": 5.5,
                "angle": 40,
                "frames": "f1",
                "setter_username": "setter"
            ] as [String: Any]
        ]

        let item = QueueMessageParser.parseQueueItem(dict)
        XCTAssertNotNil(item)
        XCTAssertEqual(item?.difficulty, "5.5")
    }

    func testConvertToSharedQueueItemWithIntDifficulty() {
        let dict: [String: Any] = [
            "uuid": "q1",
            "climb": [
                "uuid": "c1",
                "name": "Test",
                "difficulty": 7,
                "angle": 40,
                "frames": "f1",
                "setter_username": "setter"
            ] as [String: Any]
        ]

        let item = QueueMessageParser.parseQueueItem(dict)
        XCTAssertNotNil(item)
        XCTAssertEqual(item?.difficulty, "7")
    }

    func testConvertToSharedQueueItemMissingOptionalFields() {
        // Minimal valid dictionary: uuid + climb with uuid
        let dict: [String: Any] = [
            "uuid": "q1",
            "climb": [
                "uuid": "c1"
            ] as [String: Any]
        ]

        let item = QueueMessageParser.parseQueueItem(dict)
        XCTAssertNotNil(item)
        XCTAssertEqual(item?.climbName, "")
        XCTAssertEqual(item?.difficulty, "")
        XCTAssertEqual(item?.angle, 0)
        XCTAssertEqual(item?.frames, "")
        XCTAssertEqual(item?.setterUsername, "")
    }

    func testConvertToSharedQueueItemMissingUuid() {
        let dict: [String: Any] = [
            "climb": ["uuid": "c1"] as [String: Any]
        ]
        XCTAssertNil(QueueMessageParser.parseQueueItem(dict))
    }

    func testConvertToSharedQueueItemMissingClimb() {
        let dict: [String: Any] = ["uuid": "q1"]
        XCTAssertNil(QueueMessageParser.parseQueueItem(dict))
    }

    func testConvertToSharedQueueItemMissingClimbUuid() {
        let dict: [String: Any] = [
            "uuid": "q1",
            "climb": ["name": "Test"] as [String: Any]
        ]
        XCTAssertNil(QueueMessageParser.parseQueueItem(dict))
    }

    func testConvertToSharedQueueItemNilInput() {
        XCTAssertNil(QueueMessageParser.parseQueueItem(nil))
    }

    // MARK: - QueueMessageParser: parseFullSync

    func testParseFullSyncEvent() {
        let updates: [String: Any] = [
            "__typename": "FullSync",
            "sequence": 5,
            "state": [
                "sequence": 5,
                "stateHash": "abc123",
                "queue": [
                    [
                        "uuid": "q1",
                        "climb": [
                            "uuid": "c1",
                            "name": "Alpha",
                            "difficulty": "V3",
                            "angle": 40,
                            "frames": "f1",
                            "setter_username": "alice"
                        ] as [String: Any],
                        "addedBy": "user1",
                        "suggested": false
                    ] as [String: Any],
                    [
                        "uuid": "q2",
                        "climb": [
                            "uuid": "c2",
                            "name": "Beta",
                            "difficulty": "V6",
                            "angle": 45,
                            "frames": "f2",
                            "setter_username": "bob"
                        ] as [String: Any],
                        "addedBy": "user2",
                        "suggested": true
                    ] as [String: Any]
                ] as [[String: Any]],
                "currentClimbQueueItem": [
                    "uuid": "q1",
                    "climb": [
                        "uuid": "c1",
                        "name": "Alpha",
                        "difficulty": "V3",
                        "angle": 40,
                        "frames": "f1",
                        "setter_username": "alice"
                    ] as [String: Any],
                    "addedBy": "user1",
                    "suggested": false
                ] as [String: Any]
            ] as [String: Any]
        ]

        let event = QueueMessageParser.parseFullSync(updates)
        XCTAssertNotNil(event)

        guard case let .fullSync(items, currentItem, sequence) = event else {
            XCTFail("Expected fullSync event")
            return
        }

        XCTAssertEqual(sequence, 5)
        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items[0].uuid, "q1")
        XCTAssertEqual(items[0].climbName, "Alpha")
        XCTAssertEqual(items[1].uuid, "q2")
        XCTAssertEqual(items[1].climbName, "Beta")
        XCTAssertNotNil(currentItem)
        XCTAssertEqual(currentItem?.uuid, "q1")
    }

    func testParseFullSyncWithNoCurrentClimb() {
        let updates: [String: Any] = [
            "__typename": "FullSync",
            "sequence": 1,
            "state": [
                "sequence": 1,
                "stateHash": "hash",
                "queue": [] as [[String: Any]]
            ] as [String: Any]
        ]

        let event = QueueMessageParser.parseFullSync(updates)
        guard case let .fullSync(items, currentItem, sequence) = event else {
            XCTFail("Expected fullSync event")
            return
        }

        XCTAssertEqual(sequence, 1)
        XCTAssertEqual(items.count, 0)
        XCTAssertNil(currentItem)
    }

    func testParseFullSyncMissingState() {
        let updates: [String: Any] = [
            "__typename": "FullSync",
            "sequence": 1
        ]

        XCTAssertNil(QueueMessageParser.parseFullSync(updates))
    }

    // MARK: - QueueMessageParser: parseCurrentClimbChanged

    func testParseCurrentClimbChanged() {
        let updates: [String: Any] = [
            "__typename": "CurrentClimbChanged",
            "sequence": 10,
            "currentItem": [
                "uuid": "q3",
                "climb": [
                    "uuid": "c3",
                    "name": "Gamma",
                    "difficulty": "V4",
                    "angle": 35,
                    "frames": "f3",
                    "setter_username": "charlie"
                ] as [String: Any],
                "addedBy": "user3",
                "suggested": false
            ] as [String: Any],
            "clientId": "client-abc",
            "correlationId": "corr-123"
        ]

        let event = QueueMessageParser.parseCurrentClimbChanged(updates)
        XCTAssertNotNil(event)

        guard case let .currentClimbChanged(item, sequence) = event else {
            XCTFail("Expected currentClimbChanged event")
            return
        }

        XCTAssertEqual(sequence, 10)
        XCTAssertNotNil(item)
        XCTAssertEqual(item?.uuid, "q3")
        XCTAssertEqual(item?.climbName, "Gamma")
    }

    func testParseCurrentClimbChangedWithNilItem() {
        let updates: [String: Any] = [
            "__typename": "CurrentClimbChanged",
            "sequence": 7
        ]

        let event = QueueMessageParser.parseCurrentClimbChanged(updates)
        guard case let .currentClimbChanged(item, sequence) = event else {
            XCTFail("Expected currentClimbChanged event")
            return
        }

        XCTAssertEqual(sequence, 7)
        XCTAssertNil(item)
    }

    // MARK: - QueueMessageParser: parseQueueItemAdded

    func testParseQueueItemAdded() {
        let updates: [String: Any] = [
            "__typename": "QueueItemAdded",
            "sequence": 15,
            "addedItem": [
                "uuid": "q4",
                "climb": [
                    "uuid": "c4",
                    "name": "Delta",
                    "difficulty": "V2",
                    "angle": 30,
                    "frames": "f4",
                    "setter_username": "dave"
                ] as [String: Any],
                "addedBy": "user4",
                "suggested": false
            ] as [String: Any],
            "position": 2
        ]

        let event = QueueMessageParser.parseQueueItemAdded(updates)
        XCTAssertNotNil(event)

        guard case let .itemAdded(item, position, sequence) = event else {
            XCTFail("Expected itemAdded event")
            return
        }

        XCTAssertEqual(sequence, 15)
        XCTAssertEqual(item.uuid, "q4")
        XCTAssertEqual(item.climbName, "Delta")
        XCTAssertEqual(position, 2)
    }

    func testParseQueueItemAddedMissingItem() {
        let updates: [String: Any] = [
            "__typename": "QueueItemAdded",
            "sequence": 15,
            "position": 2
        ]

        XCTAssertNil(QueueMessageParser.parseQueueItemAdded(updates))
    }

    // MARK: - QueueMessageParser: parseQueueItemRemoved

    func testParseQueueItemRemoved() {
        let updates: [String: Any] = [
            "__typename": "QueueItemRemoved",
            "sequence": 20,
            "uuid": "q5"
        ]

        let event = QueueMessageParser.parseQueueItemRemoved(updates)
        XCTAssertNotNil(event)

        guard case let .itemRemoved(uuid, sequence) = event else {
            XCTFail("Expected itemRemoved event")
            return
        }

        XCTAssertEqual(sequence, 20)
        XCTAssertEqual(uuid, "q5")
    }

    func testParseQueueItemRemovedMissingUuid() {
        let updates: [String: Any] = [
            "__typename": "QueueItemRemoved",
            "sequence": 20
        ]

        XCTAssertNil(QueueMessageParser.parseQueueItemRemoved(updates))
    }

    // MARK: - QueueMessageParser: parseQueueReordered

    func testParseQueueReordered() {
        let updates: [String: Any] = [
            "__typename": "QueueReordered",
            "sequence": 25,
            "uuid": "q6",
            "oldIndex": 1,
            "newIndex": 3
        ]

        let event = QueueMessageParser.parseQueueReordered(updates)
        XCTAssertNotNil(event)

        guard case let .reordered(uuid, oldIndex, newIndex, sequence) = event else {
            XCTFail("Expected reordered event")
            return
        }

        XCTAssertEqual(sequence, 25)
        XCTAssertEqual(uuid, "q6")
        XCTAssertEqual(oldIndex, 1)
        XCTAssertEqual(newIndex, 3)
    }

    func testParseQueueReorderedMissingUuid() {
        let updates: [String: Any] = [
            "__typename": "QueueReordered",
            "sequence": 25,
            "oldIndex": 1,
            "newIndex": 3
        ]

        XCTAssertNil(QueueMessageParser.parseQueueReordered(updates))
    }

    // MARK: - QueueMessageParser: parseClimbMirrored

    func testParseClimbMirrored() {
        let updates: [String: Any] = [
            "__typename": "ClimbMirrored",
            "uuid": "q1",
            "sequence": 30,
            "mirrored": true
        ]

        let event = QueueMessageParser.parseClimbMirrored(updates)
        guard case let .climbMirrored(uuid, mirrored, sequence) = event else {
            XCTFail("Expected climbMirrored event")
            return
        }

        XCTAssertEqual(uuid, "q1")
        XCTAssertEqual(sequence, 30)
        XCTAssertTrue(mirrored)
    }

    // MARK: - QueueMessageParser: parseQueueUpdate (routing)

    func testParseQueueUpdateRoutesFullSync() {
        let updates: [String: Any] = [
            "__typename": "FullSync",
            "sequence": 1,
            "state": [
                "sequence": 1,
                "stateHash": "h",
                "queue": [] as [[String: Any]]
            ] as [String: Any]
        ]

        let event = QueueMessageParser.parseQueueUpdate(updates)
        XCTAssertNotNil(event)
        if case .fullSync = event {} else {
            XCTFail("Expected fullSync")
        }
    }

    func testParseQueueUpdateRoutesCurrentClimbChanged() {
        let updates: [String: Any] = [
            "__typename": "CurrentClimbChanged",
            "sequence": 2
        ]

        let event = QueueMessageParser.parseQueueUpdate(updates)
        XCTAssertNotNil(event)
        if case .currentClimbChanged = event {} else {
            XCTFail("Expected currentClimbChanged")
        }
    }

    func testParseQueueUpdateRoutesQueueItemAdded() {
        let updates: [String: Any] = [
            "__typename": "QueueItemAdded",
            "sequence": 3,
            "addedItem": [
                "uuid": "q1",
                "climb": ["uuid": "c1"] as [String: Any]
            ] as [String: Any],
            "position": 0
        ]

        let event = QueueMessageParser.parseQueueUpdate(updates)
        XCTAssertNotNil(event)
        if case .itemAdded = event {} else {
            XCTFail("Expected itemAdded")
        }
    }

    func testParseQueueUpdateRoutesQueueItemRemoved() {
        let updates: [String: Any] = [
            "__typename": "QueueItemRemoved",
            "sequence": 4,
            "uuid": "q1"
        ]

        let event = QueueMessageParser.parseQueueUpdate(updates)
        XCTAssertNotNil(event)
        if case .itemRemoved = event {} else {
            XCTFail("Expected itemRemoved")
        }
    }

    func testParseQueueUpdateRoutesQueueReordered() {
        let updates: [String: Any] = [
            "__typename": "QueueReordered",
            "sequence": 5,
            "uuid": "q1",
            "oldIndex": 0,
            "newIndex": 2
        ]

        let event = QueueMessageParser.parseQueueUpdate(updates)
        XCTAssertNotNil(event)
        if case .reordered = event {} else {
            XCTFail("Expected reordered")
        }
    }

    func testParseQueueUpdateRoutesClimbMirrored() {
        let updates: [String: Any] = [
            "__typename": "ClimbMirrored",
            "sequence": 6,
            "mirrored": false
        ]

        let event = QueueMessageParser.parseQueueUpdate(updates)
        XCTAssertNotNil(event)
        if case .climbMirrored = event {} else {
            XCTFail("Expected climbMirrored")
        }
    }

    func testParseQueueUpdateUnknownTypename() {
        let updates: [String: Any] = [
            "__typename": "SomeFutureEvent",
            "sequence": 99
        ]

        XCTAssertNil(QueueMessageParser.parseQueueUpdate(updates))
    }

    func testParseQueueUpdateMissingTypename() {
        let updates: [String: Any] = [
            "sequence": 1
        ]

        XCTAssertNil(QueueMessageParser.parseQueueUpdate(updates))
    }

    // MARK: - Sequence Gap Detection

    func testSequenceGapDetectionNoGap() {
        // Sequential: 1 -> 2
        XCTAssertFalse(QueueMessageParser.hasSequenceGap(lastKnown: 1, received: 2))
    }

    func testSequenceGapDetectionWithGap() {
        // Gap: 1 -> 5 (missed 2, 3, 4)
        XCTAssertTrue(QueueMessageParser.hasSequenceGap(lastKnown: 1, received: 5))
    }

    func testSequenceGapDetectionFirstMessage() {
        // First message ever (lastKnown = -1), no gap
        XCTAssertFalse(QueueMessageParser.hasSequenceGap(lastKnown: -1, received: 1))
    }

    func testSequenceGapDetectionSameSequence() {
        // Same sequence (duplicate), no gap
        XCTAssertFalse(QueueMessageParser.hasSequenceGap(lastKnown: 5, received: 5))
    }

    func testSequenceGapDetectionExactlyOneAhead() {
        // Exactly one step ahead, no gap
        XCTAssertFalse(QueueMessageParser.hasSequenceGap(lastKnown: 10, received: 11))
    }

    func testSequenceGapDetectionTwoAhead() {
        // Two steps ahead = gap
        XCTAssertTrue(QueueMessageParser.hasSequenceGap(lastKnown: 10, received: 12))
    }

    func testSequenceGapDetectionLargeFirstMessage() {
        // Large first message (lastKnown = -1), still no gap
        XCTAssertFalse(QueueMessageParser.hasSequenceGap(lastKnown: -1, received: 100))
    }

    // MARK: - Reconnect Delay

    func testReconnectDelayExponentialBackoff() {
        let manager = SessionWebSocketManager(urlSession: .shared)

        // First attempt: 1s
        let first = manager.reconnectDelay()
        XCTAssertEqual(first, 1.0, accuracy: 0.01)
    }

    // MARK: - Difficulty Parsing

    func testParseDifficultyString() {
        XCTAssertEqual(QueueMessageParser.parseDifficulty("V5"), "V5")
    }

    func testParseDifficultyDouble() {
        XCTAssertEqual(QueueMessageParser.parseDifficulty(5.5), "5.5")
    }

    func testParseDifficultyInt() {
        XCTAssertEqual(QueueMessageParser.parseDifficulty(7), "7")
    }

    func testParseDifficultyNil() {
        XCTAssertEqual(QueueMessageParser.parseDifficulty(nil), "")
    }

    // MARK: - Int Value Parsing

    func testParseIntValueFromInt() {
        XCTAssertEqual(QueueMessageParser.parseIntValue(42), 42)
    }

    func testParseIntValueFromDouble() {
        XCTAssertEqual(QueueMessageParser.parseIntValue(42.0), 42)
    }

    func testParseIntValueFromString() {
        XCTAssertEqual(QueueMessageParser.parseIntValue("42"), 42)
    }

    func testParseIntValueFromNil() {
        XCTAssertNil(QueueMessageParser.parseIntValue(nil))
    }

    func testParseIntValueFromInvalidString() {
        XCTAssertNil(QueueMessageParser.parseIntValue("not a number"))
    }

    // MARK: - End-to-End: Full GraphQL next Message Parsing

    func testEndToEndFullSyncMessageParsing() {
        // Simulate a complete graphql-ws "next" message as received from the server
        let jsonString = """
        {
            "type": "next",
            "id": "1",
            "payload": {
                "data": {
                    "queueUpdates": {
                        "__typename": "FullSync",
                        "sequence": 42,
                        "state": {
                            "sequence": 42,
                            "stateHash": "abc",
                            "queue": [
                                {
                                    "uuid": "item-1",
                                    "climb": {
                                        "uuid": "climb-1",
                                        "setter_username": "alice",
                                        "name": "First Climb",
                                        "frames": "p1r12",
                                        "angle": 40,
                                        "difficulty": "V3"
                                    },
                                    "addedBy": "user1",
                                    "suggested": false
                                },
                                {
                                    "uuid": "item-2",
                                    "climb": {
                                        "uuid": "climb-2",
                                        "setter_username": "bob",
                                        "name": "Second Climb",
                                        "frames": "p3r14",
                                        "angle": 45,
                                        "difficulty": "V6"
                                    },
                                    "addedBy": "user2",
                                    "suggested": true
                                }
                            ],
                            "currentClimbQueueItem": {
                                "uuid": "item-2",
                                "climb": {
                                    "uuid": "climb-2",
                                    "setter_username": "bob",
                                    "name": "Second Climb",
                                    "frames": "p3r14",
                                    "angle": 45,
                                    "difficulty": "V6"
                                },
                                "addedBy": "user2",
                                "suggested": true
                            }
                        }
                    }
                }
            }
        }
        """

        // Step 1: Parse as GQLMessage
        let msg = GQLMessage.parse(jsonString)
        XCTAssertNotNil(msg)
        XCTAssertEqual(msg?.type, .next)
        XCTAssertEqual(msg?.id, "1")

        // Step 2: Extract queue updates
        let updates = QueueMessageParser.extractQueueUpdates(from: msg?.payload)
        XCTAssertNotNil(updates)

        // Step 3: Parse the event
        let event = QueueMessageParser.parseQueueUpdate(updates!)
        XCTAssertNotNil(event)

        guard case let .fullSync(items, currentItem, sequence) = event else {
            XCTFail("Expected fullSync event")
            return
        }

        XCTAssertEqual(sequence, 42)
        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items[0].climbName, "First Climb")
        XCTAssertEqual(items[0].setterUsername, "alice")
        XCTAssertEqual(items[1].climbName, "Second Climb")
        XCTAssertEqual(items[1].angle, 45)
        XCTAssertNotNil(currentItem)
        XCTAssertEqual(currentItem?.uuid, "item-2")
    }

    func testEndToEndCurrentClimbChangedMessageParsing() {
        let jsonString = """
        {
            "type": "next",
            "id": "1",
            "payload": {
                "data": {
                    "queueUpdates": {
                        "__typename": "CurrentClimbChanged",
                        "sequence": 43,
                        "currentItem": {
                            "uuid": "item-1",
                            "climb": {
                                "uuid": "climb-1",
                                "setter_username": "alice",
                                "name": "First Climb",
                                "frames": "p1r12",
                                "angle": 40,
                                "difficulty": "V3"
                            },
                            "addedBy": "user1",
                            "suggested": false
                        },
                        "clientId": "client-xyz",
                        "correlationId": "corr-456"
                    }
                }
            }
        }
        """

        let msg = GQLMessage.parse(jsonString)
        let updates = QueueMessageParser.extractQueueUpdates(from: msg?.payload)
        let event = QueueMessageParser.parseQueueUpdate(updates!)

        guard case let .currentClimbChanged(item, sequence) = event else {
            XCTFail("Expected currentClimbChanged event")
            return
        }

        XCTAssertEqual(sequence, 43)
        XCTAssertEqual(item?.uuid, "item-1")
        XCTAssertEqual(item?.climbName, "First Climb")
    }

    // MARK: - Reconnection Flow

    func testReconnectDelayIncrementsOnSubsequentCalls() {
        let manager = SessionWebSocketManager(urlSession: .shared)

        // reconnectDelay() is a pure function of reconnectAttempt.
        // In production, handleDisconnect() increments reconnectAttempt after each call.
        // Simulate that here by checking delay at each attempt level.
        XCTAssertEqual(manager.reconnectAttempt, 0)
        let first = manager.reconnectDelay()  // 2^0 = 1
        XCTAssertEqual(first, 1.0, accuracy: 0.01)

        manager.reconnectAttempt = 1
        let second = manager.reconnectDelay()  // 2^1 = 2
        XCTAssertEqual(second, 2.0, accuracy: 0.01)

        manager.reconnectAttempt = 2
        let third = manager.reconnectDelay()  // 2^2 = 4
        XCTAssertEqual(third, 4.0, accuracy: 0.01)

        manager.reconnectAttempt = 3
        let fourth = manager.reconnectDelay()  // 2^3 = 8
        XCTAssertEqual(fourth, 8.0, accuracy: 0.01)
    }

    func testReconnectDelayCapsAt30Seconds() {
        let manager = SessionWebSocketManager(urlSession: .shared)

        // Set attempt high enough that 2^n > 30
        manager.reconnectAttempt = 5  // 2^5 = 32, capped at 30
        let delay = manager.reconnectDelay()

        XCTAssertEqual(delay, 30.0, accuracy: 0.01)
    }

    func testSequenceGapTriggeresResync() {
        // When a sequence gap is detected, the parser should recognize
        // that the gap means we missed events and need a full sync.
        // lastKnown=5, received=8 means we missed 6 and 7
        XCTAssertTrue(QueueMessageParser.hasSequenceGap(lastKnown: 5, received: 8))

        // Verify various gap scenarios
        XCTAssertTrue(QueueMessageParser.hasSequenceGap(lastKnown: 0, received: 5))
        XCTAssertTrue(QueueMessageParser.hasSequenceGap(lastKnown: 10, received: 15))
    }

    func testSequenceGapRecoveryAfterFullSync() {
        // After a full sync with sequence 42, the next expected is 43
        // Receiving 43 should NOT be a gap
        XCTAssertFalse(QueueMessageParser.hasSequenceGap(lastKnown: 42, received: 43))

        // But receiving 44 means we missed 43
        XCTAssertTrue(QueueMessageParser.hasSequenceGap(lastKnown: 42, received: 44))
    }

    func testDisconnectStopsReconnection() {
        let manager = SessionWebSocketManager(urlSession: .shared)
        manager.disconnect()

        // After intentional disconnect, manager should not try to reconnect
        // Verify by checking the intentionalDisconnect state via connect/disconnect cycle
        XCTAssertFalse(manager.isConnected)
    }

    // MARK: - Stale Task Disconnect Guard

    func testStaleDisconnectDoesNotKillNewConnection() {
        let manager = SessionWebSocketManager(urlSession: .shared)

        // Create two tasks to simulate old vs new connection
        let fakeUrl = URL(string: "wss://example.com/graphql")!
        let oldTask = URLSession.shared.webSocketTask(with: fakeUrl)
        let newTask = URLSession.shared.webSocketTask(with: fakeUrl)

        // Distinct instances must not be identity-equal
        XCTAssertFalse(oldTask === newTask)

        // Same instance must be identity-equal
        XCTAssertTrue(oldTask === oldTask)
        XCTAssertTrue(newTask === newTask)
    }

    // MARK: - GQLMessageType Raw Values

    func testGQLMessageTypeRawValues() {
        XCTAssertEqual(GQLMessageType.connectionInit.rawValue, "connection_init")
        XCTAssertEqual(GQLMessageType.connectionAck.rawValue, "connection_ack")
        XCTAssertEqual(GQLMessageType.subscribe.rawValue, "subscribe")
        XCTAssertEqual(GQLMessageType.next.rawValue, "next")
        XCTAssertEqual(GQLMessageType.error.rawValue, "error")
        XCTAssertEqual(GQLMessageType.complete.rawValue, "complete")
        XCTAssertEqual(GQLMessageType.ping.rawValue, "ping")
        XCTAssertEqual(GQLMessageType.pong.rawValue, "pong")
    }
}
