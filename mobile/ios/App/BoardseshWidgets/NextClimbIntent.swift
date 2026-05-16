import AppIntents

@available(iOS 17.0, *)
struct NextClimbIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Next Climb"
    static var description = IntentDescription("Navigate to the next climb in the queue")

    func perform() async throws -> some IntentResult {
        await ClimbNavigationIntent.perform(direction: .next, label: "NextClimbIntent")
        return .result()
    }
}
