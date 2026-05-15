import UIKit
import Capacitor

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if launchOptions?[.bluetoothCentrals] != nil {
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
