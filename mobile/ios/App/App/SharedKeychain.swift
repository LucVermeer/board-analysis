import Foundation
import Security

/// Shared-access-group Keychain helper for credentials that the widget
/// extension also needs to read (currently the user's app auth token and
/// the APNs Live Activity push token used as a Bearer credential on
/// `/api/widget/navigate`).
///
/// Why not App Group UserDefaults?
/// - UserDefaults are stored in plaintext on disk inside the App Group
///   container, so any process with file-system access (including
///   forensic tools on a confiscated device) can read them.
/// - Keychain entries are encrypted at rest by the Secure Enclave and
///   only accessible to processes that hold the matching
///   `keychain-access-groups` entitlement. Sharing across the main app
///   and the widget extension is still possible via the access-group
///   prefix, but processes outside the group can't read them.
///
/// Accessibility is `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`:
/// - Available after the user unlocks the device once per boot, so
///   widget extensions can read it while the phone is locked.
/// - `ThisDeviceOnly` keeps it out of iCloud Keychain backups, since
///   these are short-lived per-session credentials.
enum SharedKeychain {
    /// Keychain access group declared in both `App.entitlements` and
    /// `BoardseshWidgets.entitlements`. The `$(AppIdentifierPrefix)` is
    /// resolved at build time to the team identifier; at runtime we pass
    /// the bare group name and the OS resolves it from the entitlement.
    private static let accessGroup = "group.com.boardsesh.app"

    static let authTokenKey = "bs_auth_token"
    static let livePushTokenKey = "bs_live_push_token"

    // MARK: - Public API

    /// Write a string value to the shared keychain. Replaces any existing
    /// value for the same account key. No-op (returns `false`) on failure.
    @discardableResult
    static func set(_ value: String, for key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        var query = baseQuery(for: key)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return true
        }
        if updateStatus != errSecItemNotFound {
            return false
        }

        // No existing item — insert a fresh one.
        for (k, v) in attributes {
            query[k] = v
        }
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        return addStatus == errSecSuccess
    }

    /// Read a string value from the shared keychain, or `nil` if absent.
    static func get(_ key: String) -> String? {
        var query = baseQuery(for: key)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnData as String] = true

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    /// Delete the value associated with `key`. No-op if absent.
    static func remove(_ key: String) {
        let query = baseQuery(for: key)
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Internals

    private static func baseQuery(for key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }
}
