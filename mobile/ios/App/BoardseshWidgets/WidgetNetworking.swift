import Foundation

enum WidgetNetworking {
    /// Sends a queue navigation request to the backend.
    /// Returns `true` if the request succeeded (HTTP 200), `false` otherwise.
    @discardableResult
    static func sendNavigation(action: String, currentIndex: Int) async -> Bool {
        guard let defaults = SharedConstants.sharedDefaults,
              let serverUrl = defaults.string(forKey: SharedConstants.serverUrlKey),
              let sessionId = defaults.string(forKey: SharedConstants.sessionIdKey)
        else { return false }

        guard let url = URL(string: "\(serverUrl)/api/widget/navigate") else { return false }

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
                // Darwin notification BEFORE the keychain delete — iOS can
                // suspend the widget extension at any point once URLSession
                // returns, and we'd rather the main app get the re-register
                // signal than wake up to a wiped widget token with no hint
                // about why it's gone.
                print("[Widget] Navigation request received 410; signaling re-registration")
                let name = CFNotificationName(SharedConstants.pushRegistrationStaleNotification as CFString)
                CFNotificationCenterPostNotification(
                    CFNotificationCenterGetDarwinNotifyCenter(),
                    name,
                    nil,
                    nil,
                    true
                )
                SharedKeychain.remove(SharedKeychain.livePushTokenKey)
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
