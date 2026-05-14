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
        // authenticate the request. If the token isn't in shared defaults yet
        // (early in lifecycle), the request goes out without auth and the
        // backend will reject with 401 — that's acceptable; the widget will
        // simply do nothing until the next refresh.
        if let pushToken = defaults.string(forKey: SharedConstants.livePushTokenKey),
           !pushToken.isEmpty
        {
            request.setValue("Bearer \(pushToken)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                return true
            }
            print("[Widget] Navigation request failed with status \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return false
        } catch {
            print("[Widget] Navigation request failed: \(error.localizedDescription)")
            return false
        }
    }
}
