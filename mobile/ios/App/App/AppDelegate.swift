import UIKit
import Capacitor

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Initialize during launch so CoreBluetooth state restoration can
        // deliver willRestoreState — it only fires if CBCentralManager is
        // constructed before the run loop services other events. Required
        // when iOS background-launches us for a Live Activity intent.
        //
        // Gated on a saved BLE board config so fresh installs (no prior
        // connection) don't see a Bluetooth permission prompt at first
        // launch. If there's nothing to restore, the manager is created
        // lazily later when the user explicitly connects.
        let hasSavedBleConfig = SharedConstants.sharedDefaults?.data(forKey: SharedConstants.bleBoardConfigKey) != nil
        if launchOptions?[.bluetoothCentrals] != nil || hasSavedBleConfig {
            _ = BoardBleManager.shared
        }
        return true
    }

    // MARK: UISceneSession Lifecycle

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {}

    func applicationWillTerminate(_ application: UIApplication) {
        // End Live Activity and disconnect WebSocket on app termination
        SessionWebSocketManager.shared.disconnect()
        if #available(iOS 16.1, *) {
            Task.detached(priority: .utility) {
                await LiveActivityManager.shared.endAllActivities()
            }
        }
    }
}
