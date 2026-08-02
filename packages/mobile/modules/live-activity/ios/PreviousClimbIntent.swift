import AppIntents

@available(iOS 17.0, *)
struct PreviousClimbIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Previous Climb"
    static let description = IntentDescription("Navigate to the previous climb in the queue")

    func perform() async throws -> some IntentResult {
        await ClimbNavigationIntent.perform(direction: .previous, label: "PreviousClimbIntent")
        return .result()
    }
}
