import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct ClimbSessionAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var climbName: String
        var climbDifficulty: String
        var angle: Int
        var currentIndex: Int
        var totalClimbs: Int
        var hasNext: Bool
        var hasPrevious: Bool
        var climbUuid: String
    }

    var boardName: String
    var sessionId: String
}
