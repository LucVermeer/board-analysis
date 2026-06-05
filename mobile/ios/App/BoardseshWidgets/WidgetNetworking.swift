import Foundation

enum WidgetNavigationResult: Equatable {
    case success
    case serverRejected
    case retryableFailure
}

enum WidgetNetworking {
    /// Sends a queue navigation request to the backend.
    /// Returns whether the request succeeded, was explicitly rejected by the
    /// server, or failed before the server could make an authoritative decision.
    @discardableResult
    static func sendNavigation(action: String, currentIndex: Int) async -> WidgetNavigationResult {
        // `widgetNavigateUrlKey` is written by `LiveActivityPlugin.startSession`.
        // If the user upgrades the app mid-session without re-running
        // `startSession` (e.g. they had a Live Activity running, installed the
        // new build, didn't relaunch the main app), the key won't be in
        // UserDefaults and the widget falls back to the local mutation path.
        // Acceptable: the user gets recovery as soon as they open the main app
        // and start a new session.
        guard let defaults = SharedConstants.sharedDefaults,
              let widgetNavigateUrl = defaults.string(forKey: SharedConstants.widgetNavigateUrlKey),
              let sessionId = defaults.string(forKey: SharedConstants.sessionIdKey)
        else { return .retryableFailure }

        guard let url = URL(string: widgetNavigateUrl) else { return .retryableFailure }

        let body: [String: Any] = [
            "sessionId": sessionId,
            "action": action,
            "currentIndex": currentIndex
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else { return .retryableFailure }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10
        request.httpBody = jsonData

        // Attach the APNs Live Activity push token as a Bearer header. The
        // backend looks up `(token, sessionId)` in `activity_push_tokens` to
        // authenticate the request. Token is in the shared keychain (App
        // Group access-group); if it isn't there yet (early in lifecycle),
        // fail closed instead of falling back through a non-authoritative
        // mutation path.
        if let pushToken = SharedKeychain.get(SharedKeychain.livePushTokenKey),
           !pushToken.isEmpty
        {
            request.setValue("Bearer \(pushToken)", forHTTPHeaderField: "Authorization")
        } else {
            return .serverRejected
        }

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            if statusCode == 200 {
                return .success
            }
            if statusCode == 410 {
                // The push token was rebound to a different session (the main
                // app joined another session on the same device). Post the
                // Darwin notification so the main app re-registers; do NOT
                // clear the keychain entry. The Bearer is still the right
                // APNs token — the backend just needs to update its
                // (token, sessionId) mapping. Wiping the keychain here would
                // turn subsequent widget calls into 401s (no Bearer), which
                // do NOT trigger the Darwin notification, so the widget
                // would silently fail until the foreground observer runs.
                print("[Widget] Navigation request received 410; signaling re-registration")
                let name = CFNotificationName(SharedConstants.pushRegistrationStaleNotification as CFString)
                CFNotificationCenterPostNotification(
                    CFNotificationCenterGetDarwinNotifyCenter(),
                    name,
                    nil,
                    nil,
                    true
                )
                return .serverRejected
            }
            if (400...499).contains(statusCode) {
                print("[Widget] Navigation request rejected with status \(statusCode)")
                return .serverRejected
            }
            print("[Widget] Navigation request failed with status \(statusCode)")
            return .retryableFailure
        } catch {
            print("[Widget] Navigation request failed: \(error.localizedDescription)")
            return .retryableFailure
        }
    }
}
