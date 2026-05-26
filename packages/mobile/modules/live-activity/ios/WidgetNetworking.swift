import Foundation

enum WidgetNetworking {
    /// Sends a queue navigation request to the backend.
    /// Returns `true` if the request succeeded (HTTP 200), `false` otherwise.
    @discardableResult
    static func sendNavigation(action: String, currentIndex: Int) async -> Bool {
        // `widgetNavigateUrlKey` is written by `LiveActivityPlugin.startSession`.
        // If the user upgrades the app mid-session without re-running
        // `startSession` (e.g. they had a Live Activity running, installed the
        // new build, didn't relaunch the main app), the key won't be in
        // UserDefaults and the widget will silently no-op. Acceptable: the
        // pre-fix build already had broken widget navigation, and the user
        // gets recovery as soon as they open the main app and start a new
        // session. The optimistic UI update in the widget intent still fires.
        guard let defaults = SharedConstants.sharedDefaults,
              let widgetNavigateUrl = defaults.string(forKey: SharedConstants.widgetNavigateUrlKey),
              let sessionId = defaults.string(forKey: SharedConstants.sessionIdKey)
        else { return false }

        guard let url = URL(string: widgetNavigateUrl) else { return false }

        let body: [String: Any] = [
            "sessionId": sessionId,
            "action": action,
            "currentIndex": currentIndex
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: body) else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10
        request.httpBody = jsonData

        // Attach the APNs Live Activity push token as a Bearer header. The
        // backend looks up `(token, sessionId)` in `activity_push_tokens` to
        // authenticate the request. Token is in the shared keychain (App
        // Group access-group); if it isn't there yet (early in lifecycle),
        // the request goes out without auth and the backend rejects with
        // 401 — the widget then quietly does nothing until the next
        // refresh.
        if let pushToken = SharedKeychain.get(SharedKeychain.livePushTokenKey),
           !pushToken.isEmpty
        {
            request.setValue("Bearer \(pushToken)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            if statusCode == 200 {
                return true
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
                return false
            }
            print("[Widget] Navigation request failed with status \(statusCode)")
            return false
        } catch {
            print("[Widget] Navigation request failed: \(error.localizedDescription)")
            return false
        }
    }
}
