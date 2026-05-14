import Capacitor
import ActivityKit
import os.log

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateActivityClimb", returnType: CAPPluginReturnPromise),
    ]

    private let logger = Logger(subsystem: "com.boardsesh.app", category: "LiveActivityPlugin")
    private var observingDarwinNotification = false

    /// Serial queue protecting push token state accessed from both the Capacitor
    /// thread and the LiveActivityManager push token callback.
    private let tokenQueue = DispatchQueue(label: "com.boardsesh.LiveActivityPlugin.token")
    private var _currentPushToken: String?
    private var _currentServerUrl: String?
    private var _currentSessionId: String?

    // MARK: - Darwin Notification (Widget → JS bridge)

    /// Start observing Darwin notifications from the widget's Next/Previous intents.
    /// When the widget navigates, we forward the action to the JS side so it can
    /// send the server mutation via its GraphQL connection.
    private func startDarwinObservation() {
        guard !observingDarwinNotification else { return }
        observingDarwinNotification = true

        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let name = CFNotificationName(SharedConstants.queueNavigateNotification as CFString)
        let observer = Unmanaged.passUnretained(self).toOpaque()

        CFNotificationCenterAddObserver(
            center,
            observer,
            { (_, observer, _, _, _) in
                guard let observer = observer else { return }
                let plugin = Unmanaged<LiveActivityPlugin>.fromOpaque(observer).takeUnretainedValue()
                plugin.handleQueueNavigateFromWidget()
            },
            name.rawValue,
            nil,
            .deliverImmediately
        )
    }

    deinit {
        stopDarwinObservation()
    }

    private func stopDarwinObservation() {
        guard observingDarwinNotification else { return }
        observingDarwinNotification = false

        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterRemoveObserver(center, observer, nil, nil)
    }

    private func handleQueueNavigateFromWidget() {
        guard let defaults = SharedConstants.sharedDefaults else { return }
        guard let action = defaults.string(forKey: SharedConstants.pendingActionKey) else { return }
        defaults.removeObject(forKey: SharedConstants.pendingActionKey)

        // Read the updated queue state that the widget intent already saved.
        let (items, currentIndex) = SharedQueueState.load(from: defaults)

        // Generate a shared correlationId so the JS side can register the
        // optimistic update and suppress the server echo when it arrives.
        let correlationId = UUID().uuidString

        // Send the server mutation via the native WebSocket.
        // This works even from the lock screen (no web view needed).
        if !items.isEmpty, currentIndex >= 0, currentIndex < items.count {
            let item = items[currentIndex]
            SessionWebSocketManager.shared.navigateToItem(item, at: currentIndex, totalItems: items, correlationId: correlationId)
        }

        // Also notify JS so it can dispatch an optimistic reducer update
        // using the same correlationId. retainUntilConsumed ensures the event
        // is queued if no listener is attached yet (e.g. app was on the lock screen).
        notifyListeners("queueNavigate", data: [
            "action": action,
            "currentIndex": currentIndex,
            "correlationId": correlationId,
        ], retainUntilConsumed: true)
    }

    // MARK: - Push Token Registration

    private func registerPushTokenWithBackend(token: String, sessionId: String, serverUrl: String) {
        // The backend resolver authenticates via ConnectionContext, so we MUST
        // attach the user's app auth token. Without it the resolver rejects.
        guard let authToken = SharedKeychain.get(SharedKeychain.authTokenKey),
              !authToken.isEmpty
        else {
            logger.warning("Skipping push token registration: no auth token in keychain")
            return
        }

        let query = """
        mutation RegisterToken($sessionId: ID!, $token: String!) {
          registerActivityPushToken(sessionId: $sessionId, token: $token)
        }
        """
        let body: [String: Any] = [
            "query": query,
            "variables": ["sessionId": sessionId, "token": token]
        ]
        guard let url = URL(string: "\(serverUrl)/graphql"),
              let jsonData = try? JSONSerialization.data(withJSONObject: body) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = jsonData

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            if let error = error {
                self?.logger.error("Failed to register push token: \(error.localizedDescription, privacy: .public)")
            } else if let httpResponse = response as? HTTPURLResponse,
                      !(200...299).contains(httpResponse.statusCode) {
                self?.logger.error("Failed to register push token: HTTP \(httpResponse.statusCode, privacy: .public)")
            } else if let graphQLError = Self.graphQLErrorMessage(from: data) {
                self?.logger.error("Failed to register push token: \(graphQLError, privacy: .public)")
            } else {
                self?.logger.info("Push token registered with backend")
            }
        }.resume()
    }

    private func unregisterPushTokenFromBackend(token: String, sessionId: String, serverUrl: String) {
        // The backend resolver authenticates via ConnectionContext, so we MUST
        // attach the user's app auth token. Without it the resolver rejects.
        guard let authToken = SharedKeychain.get(SharedKeychain.authTokenKey),
              !authToken.isEmpty
        else {
            logger.warning("Skipping push token unregistration: no auth token in keychain")
            return
        }

        let query = """
        mutation UnregisterToken($sessionId: ID!, $token: String!) {
          unregisterActivityPushToken(sessionId: $sessionId, token: $token)
        }
        """
        let body: [String: Any] = [
            "query": query,
            "variables": ["sessionId": sessionId, "token": token]
        ]
        guard let url = URL(string: "\(serverUrl)/graphql"),
              let jsonData = try? JSONSerialization.data(withJSONObject: body) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = jsonData

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            if let error = error {
                self?.logger.error("Failed to unregister push token: \(error.localizedDescription, privacy: .public)")
            } else if let httpResponse = response as? HTTPURLResponse,
                      !(200...299).contains(httpResponse.statusCode) {
                self?.logger.error("Failed to unregister push token: HTTP \(httpResponse.statusCode, privacy: .public)")
            } else if let graphQLError = Self.graphQLErrorMessage(from: data) {
                self?.logger.error("Failed to unregister push token: \(graphQLError, privacy: .public)")
            } else {
                self?.logger.info("Push token unregistered from backend")
            }
        }.resume()
    }

    private static func graphQLErrorMessage(from data: Data?) -> String? {
        guard let data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let errors = json["errors"] as? [[String: Any]],
              !errors.isEmpty
        else {
            return nil
        }

        let messages = errors.compactMap { $0["message"] as? String }
        if messages.isEmpty {
            return "GraphQL returned errors"
        }
        return messages.joined(separator: "; ")
    }

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            let available = LiveActivityManager.shared.isAvailable
            call.resolve(["available": available])
        } else {
            call.resolve(["available": false])
        }
    }

    // MARK: - startSession

    @objc func startSession(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("Live Activities require iOS 17.0 or later")
            return
        }

        guard let sessionId = call.getString("sessionId") else {
            call.reject("Missing required parameter: sessionId")
            return
        }

        guard let serverUrl = call.getString("serverUrl") else {
            call.reject("Missing required parameter: serverUrl")
            return
        }

        guard let boardName = call.getString("boardName") else {
            call.reject("Missing required parameter: boardName")
            return
        }

        let layoutId = call.getInt("layoutId") ?? 0
        let sizeId = call.getInt("sizeId") ?? 0
        let setIds = call.getString("setIds") ?? ""
        let authToken = call.getString("authToken")
        let wsUrl = call.getString("wsUrl")

        // Store session details for push token registration.
        tokenQueue.sync {
            _currentServerUrl = serverUrl
            _currentSessionId = sessionId
        }

        // Store board details in shared UserDefaults for App Intents
        // and thumbnail URL construction. Auth + push tokens go through
        // the shared Keychain instead — App Group UserDefaults are
        // unencrypted on disk and we don't want Bearer credentials there.
        if let defaults = SharedConstants.sharedDefaults {
            defaults.set(sessionId, forKey: SharedConstants.sessionIdKey)
            defaults.set(serverUrl, forKey: SharedConstants.serverUrlKey)
            defaults.set(boardName, forKey: SharedConstants.boardNameKey)
            defaults.set(layoutId, forKey: SharedConstants.layoutIdKey)
            defaults.set(sizeId, forKey: SharedConstants.sizeIdKey)
            defaults.set(setIds, forKey: SharedConstants.setIdsKey)
        }
        if let authToken = authToken {
            if authToken.isEmpty {
                logger.warning("Skipping shared keychain auth token write: authToken was empty")
            } else if !SharedKeychain.set(authToken, for: SharedKeychain.authTokenKey) {
                logger.error("Failed to write auth token to shared keychain")
            }
        } else {
            logger.debug("Skipping shared keychain auth token write: authToken was not provided")
        }

        // For party mode (real session), connect the WebSocket manager
        // so queue updates flow through to the Live Activity.
        // Set callback BEFORE connect to avoid race where a fast connection
        // fires events before the callback is installed.
        let wsManager = SessionWebSocketManager.shared
        let activityManager = LiveActivityManager.shared

        wsManager.onQueueStateChanged = { [weak self] items, currentIndex in
            guard let self else { return }
            guard let state = LiveActivityManager.buildContentState(
                items: items,
                currentIndex: currentIndex
            ) else {
                self.logger.debug("Queue state changed but no valid content state could be built")
                return
            }
            Task {
                await activityManager.updateActivity(state: state)
            }
        }

        // Connect after callback is set to ensure no events are missed.
        wsManager.connect(serverUrl: serverUrl, sessionId: sessionId, authToken: authToken, wsUrl: wsUrl)

        // Observe widget navigation intents and forward to JS.
        startDarwinObservation()

        // Start the Live Activity with an initial "Loading..." state.
        let initialState = ClimbSessionAttributes.ContentState(
            climbName: "Loading...",
            climbDifficulty: "",
            angle: 0,
            currentIndex: 0,
            totalClimbs: 0,
            hasNext: false,
            hasPrevious: false,
            climbUuid: ""
        )

        // Build the push-token callback up front so it's installed atomically
        // with the activity creation — ActivityKit can emit the first token
        // before a follow-up setOnPushTokenUpdate would land, which would
        // silently drop it.
        let pushTokenHandler: @Sendable (String) -> Void = { [weak self] token in
            guard let self else { return }
            // Single sync block: write the token and read sessionId/serverUrl
            // in one critical section. Two separate tokenQueue.sync calls
            // would deadlock if ActivityKit ever delivers the token on a
            // thread already holding the queue (Swift serial DispatchQueues
            // are not reentrant).
            let (sid, surl) = self.tokenQueue.sync { () -> (String?, String?) in
                self._currentPushToken = token
                return (self._currentSessionId, self._currentServerUrl)
            }
            // Write the APNs push token to the shared keychain so the
            // widget extension can attach it as a Bearer header on
            // /api/widget/navigate calls.
            if !SharedKeychain.set(token, for: SharedKeychain.livePushTokenKey) {
                self.logger.error("Failed to write Live Activity push token to shared keychain")
            }
            if let sessionId = sid, let serverUrl = surl {
                self.registerPushTokenWithBackend(token: token, sessionId: sessionId, serverUrl: serverUrl)
            }
        }

        Task {
            do {
                try await activityManager.startActivity(
                    boardName: boardName,
                    sessionId: sessionId,
                    initialState: initialState,
                    onPushTokenUpdate: pushTokenHandler
                )
                self.logger.info("Started session \(sessionId, privacy: .public) with Live Activity")
                call.resolve()
            } catch {
                self.logger.error("Failed to start Live Activity: \(error.localizedDescription, privacy: .public)")
                call.reject("Failed to start Live Activity: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - endSession

    @objc func endSession(_ call: CAPPluginCall) {
        stopDarwinObservation()

        // Unregister the push token from the backend before tearing down.
        let (token, sessionId, serverUrl) = tokenQueue.sync {
            (_currentPushToken, _currentSessionId, _currentServerUrl)
        }
        if let token, let sessionId, let serverUrl {
            unregisterPushTokenFromBackend(token: token, sessionId: sessionId, serverUrl: serverUrl)
        }
        tokenQueue.sync {
            _currentPushToken = nil
            _currentServerUrl = nil
            _currentSessionId = nil
        }

        let wsManager = SessionWebSocketManager.shared
        wsManager.onQueueStateChanged = nil
        wsManager.disconnect()

        // Clear shared UserDefaults queue state.
        if let defaults = SharedConstants.sharedDefaults {
            defaults.removeObject(forKey: SharedConstants.queueItemsKey)
            defaults.removeObject(forKey: SharedConstants.currentIndexKey)
            defaults.removeObject(forKey: SharedConstants.sessionIdKey)
            defaults.removeObject(forKey: SharedConstants.pendingActionKey)
            // Cover earlier builds that wrote tokens to UserDefaults so
            // we don't leave plaintext credentials behind after upgrade.
            defaults.removeObject(forKey: SharedConstants.authTokenKey)
            defaults.removeObject(forKey: SharedConstants.livePushTokenKey)
        }
        SharedKeychain.remove(SharedKeychain.authTokenKey)
        SharedKeychain.remove(SharedKeychain.livePushTokenKey)

        if #available(iOS 17.0, *) {
            Task {
                await LiveActivityManager.shared.endAllActivities()
                self.logger.info("Ended session and cleaned up Live Activity")
                call.resolve()
            }
        } else {
            logger.info("Ended session")
            call.resolve()
        }
    }

    // MARK: - updateActivity

    @objc func updateActivity(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("Live Activities require iOS 17.0 or later")
            return
        }

        let climbName = call.getString("climbName") ?? ""
        let climbDifficulty = call.getString("climbDifficulty") ?? ""
        let angle = call.getInt("angle") ?? 0
        let currentIndex = call.getInt("currentIndex") ?? 0
        let totalClimbs = call.getInt("totalClimbs") ?? 0
        let hasNext = call.getBool("hasNext") ?? false
        let hasPrevious = call.getBool("hasPrevious") ?? false
        let climbUuid = call.getString("climbUuid") ?? ""

        // Parse the queue array from the call and store in shared UserDefaults
        // so App Intents can navigate locally.
        if let defaults = SharedConstants.sharedDefaults {
            var queueItems: [SharedQueueItem] = []

            if let queueArray = call.getArray("queue") as? [JSObject] {
                for item in queueArray {
                    let itemUuid = item["uuid"] as? String ?? ""
                    let itemClimbUuid = item["climbUuid"] as? String ?? ""
                    let itemClimbName = item["climbName"] as? String ?? ""
                    let itemDifficulty = item["difficulty"] as? String ?? ""
                    let itemAngle = item["angle"] as? Int ?? 0
                    let itemFrames = item["frames"] as? String ?? ""
                    let itemSetterUsername = item["setterUsername"] as? String ?? ""

                    queueItems.append(SharedQueueItem(
                        uuid: itemUuid,
                        climbUuid: itemClimbUuid,
                        climbName: itemClimbName,
                        difficulty: itemDifficulty,
                        angle: itemAngle,
                        frames: itemFrames,
                        setterUsername: itemSetterUsername
                    ))
                }
            }

            SharedQueueState.save(items: queueItems, currentIndex: currentIndex, to: defaults)
        }

        // Build and push the new content state to the Live Activity.
        let state = ClimbSessionAttributes.ContentState(
            climbName: climbName,
            climbDifficulty: VGradeFormatter.formatVGrade(climbDifficulty),
            angle: angle,
            currentIndex: currentIndex,
            totalClimbs: totalClimbs,
            hasNext: hasNext,
            hasPrevious: hasPrevious,
            climbUuid: climbUuid
        )

        let activityManager = LiveActivityManager.shared

        Task {
            // Skip the ActivityKit push if the native WebSocket callback already
            // updated the Live Activity within the dedup window. The UserDefaults
            // write above still runs to keep state consistent.
            let elapsed = await activityManager.timeSinceLastUpdate()
            if let elapsed, elapsed < SharedConstants.liveActivityDedupWindow {
                self.logger.debug("Skipping redundant ActivityKit push (\(Int(elapsed * 1000))ms since last native update)")
            } else {
                await activityManager.updateActivity(state: state)
            }
        }

        call.resolve()
    }

    // MARK: - updateActivityClimb (lightweight — no queue serialization)

    /// Lightweight update that only sends scalar climb data + current index.
    /// Skips re-encoding the full queue array to UserDefaults.
    /// Use this for climb navigation; use `updateActivity` for queue changes.
    @objc func updateActivityClimb(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("Live Activities require iOS 17.0 or later")
            return
        }

        let climbName = call.getString("climbName") ?? ""
        let climbDifficulty = call.getString("climbDifficulty") ?? ""
        let angle = call.getInt("angle") ?? 0
        let currentIndex = call.getInt("currentIndex") ?? 0
        let totalClimbs = call.getInt("totalClimbs") ?? 0
        let hasNext = call.getBool("hasNext") ?? false
        let hasPrevious = call.getBool("hasPrevious") ?? false
        let climbUuid = call.getString("climbUuid") ?? ""

        // Only update the current index in shared UserDefaults (not the full items array).
        if let defaults = SharedConstants.sharedDefaults {
            SharedQueueState.saveCurrentIndex(currentIndex, to: defaults)
        }

        let state = ClimbSessionAttributes.ContentState(
            climbName: climbName,
            climbDifficulty: VGradeFormatter.formatVGrade(climbDifficulty),
            angle: angle,
            currentIndex: currentIndex,
            totalClimbs: totalClimbs,
            hasNext: hasNext,
            hasPrevious: hasPrevious,
            climbUuid: climbUuid
        )

        let activityManager = LiveActivityManager.shared

        Task {
            let elapsed = await activityManager.timeSinceLastUpdate()
            if let elapsed, elapsed < SharedConstants.liveActivityDedupWindow {
                self.logger.debug("Skipping redundant climb ActivityKit push (\(Int(elapsed * 1000))ms since last native update)")
            } else {
                await activityManager.updateActivity(state: state)
            }
        }

        call.resolve()
    }
}
