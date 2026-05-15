import XCTest
@testable import App

final class BoardBleEncodingTests: XCTestCase {
    private func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    func testAuroraV3PacketMatchesTypeScriptFixture() {
        let ledPlacements = BoardPlacementData.getLedPlacements(boardName: "kilter", layoutId: 8, sizeId: 25)
        let result = BoardBleEncoding.makeAuroraPacket(
            frames: "p4265r45p4269r45p4331r43p4334r44p4350r45p4356r42p4363r44p4412r45p4415r42",
            placementPositions: ledPlacements,
            boardName: "kilter",
            apiLevel: 3
        )

        XCTAssertEqual(
            hex(result.packet),
            "011c6102540a01f40601f448011f4501e37501f46f011c6801e3b701f4b4011c03"
        )
        XCTAssertEqual(result.skippedPositionCount, 0)
        XCTAssertEqual(result.skippedRoleCount, 0)
    }

    func testAuroraV2PacketMatchesTypeScriptFixture() {
        let ledPlacements = BoardPlacementData.getLedPlacements(boardName: "kilter", layoutId: 8, sizeId: 25)
        let result = BoardBleEncoding.makeAuroraPacket(
            frames: "p4265r45p4269r45p4331r43p4334r44p4350r45p4356r42p4363r44p4412r45p4415r42",
            placementPositions: ledPlacements,
            boardName: "kilter",
            apiLevel: 2
        )

        XCTAssertEqual(hex(result.packet), "01139e02500ae106e1483d45cd75e16f3168cdb7e1b43103")
    }

    func testClearPacketsMatchTypeScriptBehavior() {
        XCTAssertEqual(
            hex(BoardBleEncoding.makeAuroraPacket(frames: "", placementPositions: [:], boardName: "kilter", apiLevel: 3).packet),
            "0101ab025403"
        )
        XCTAssertEqual(
            hex(BoardBleEncoding.makeAuroraPacket(frames: "", placementPositions: [:], boardName: "kilter", apiLevel: 2).packet),
            "0101af025003"
        )
    }

    func testMirroredFramesUseGeneratedPlacementMap() {
        let mirroredFrames = BoardBleEncoding.mirroredFrames(frames: "p4265r45p4331r43", boardName: "kilter", layoutId: 8)

        XCTAssertNotNil(mirroredFrames)
        XCTAssertNotEqual(mirroredFrames, "p4265r45p4331r43")
    }
}
