# App Store Submission Guide

Step-by-step instructions for submitting Boardsesh to the iOS App Store.

## Prerequisites

- Apple Developer Program membership ($99/year) - https://developer.apple.com/programs/
- Xcode 15 or later installed
- An iOS Distribution certificate in your Apple Developer account
- An App Store provisioning profile for `com.boardsesh.app`
- Team ID: `9L3HKPZBH3`
- Bundle ID: `com.boardsesh.app`

Make sure your signing certificate and provisioning profile are installed in Xcode before starting. You can check this in Xcode > Settings > Accounts > your Apple ID > Manage Certificates.

---

## 1. Generate Assets (App Icon, Splash Screen)

From the repo root:

```bash
cd mobile
bun run generate-assets
```

This generates all required icon sizes and splash screen assets from the source images in `mobile/resources/`. The output goes into `mobile/ios/App/App/Assets.xcassets/`.

Verify the generated assets look correct before proceeding.

---

## 2. Take Screenshots

Automated native capture (the real RN app, dark theme) via Maestro:

```bash
vp run mobile:screenshots -- --platform ios --backend prod --theme dark
```

This drives an iPhone 16 Pro Max simulator against prod (signed in as the test
user) and saves PNGs to `app-stores/apple/screenshots/<device>/` — e.g.
`app-stores/apple/screenshots/iphone-16-pro-max/`. See
`packages/mobile/.maestro/README.md` for prerequisites (Maestro, the
`SCREENSHOT_USER_PASSWORD` env, etc.).

### Required screenshot sizes

| Device                          | Resolution | Required?                          |
| ------------------------------- | ---------- | ---------------------------------- |
| 6.9" iPhone (iPhone 16 Pro Max) | 1320x2868  | Yes — captured by the Maestro flow |
| 6.5" iPhone (iPhone 14 Plus)    | 1284x2778  | Optional (the 6.9" asset is accepted) |
| 13" iPad (iPad Pro)             | 2064x2752  | No, but recommended if iPad is supported |

Dark is the canonical appearance; pass `--theme light` for a light set.

### Manual alternative

If you need a specific screen the flow doesn't cover:

1. Open Xcode > Window > Devices and Simulators
2. Create or select an iPhone 16 Pro Max simulator
3. Run the app in the simulator
4. Navigate to each key screen:
   - Board selection / home feed
   - Climb list with search results
   - Climb detail with hold overlay on board image
   - Record / start a session
   - Discover / playlists
   - Profile stats
   - Logbook / profile stats
5. Press Cmd+S in the simulator to save a screenshot

### Screenshot tips

- Use the demo account (test@boardsesh.com / test) so there is real data in the logbook.
- Show a variety of boards (Kilter and Tension at minimum).
- Make sure the queue has 3-5 climbs to show the feature clearly.
- For the Bluetooth screenshot, show the scanning/pairing UI (it does not need a connected board).

---

## 3. Build & Archive

1. Open `mobile/ios/App/App.xcworkspace` in Xcode.
2. In the top toolbar, set the build target to **Any iOS Device (arm64)** (not a simulator).
3. Menu: **Product > Archive**.
4. Wait for the build and archive to complete. This can take a few minutes.
5. When done, the Xcode Organizer window opens automatically showing your new archive.

If the archive fails:

- Check that your signing certificate is valid and not expired.
- Check that the provisioning profile matches the bundle ID `com.boardsesh.app`.
- Check that Capacitor native dependencies are installed: `cd mobile/ios/App && pod install`.

---

## 4. Upload to App Store Connect

1. In the Xcode Organizer (**Window > Organizer**), select the archive you just created.
2. Click **Distribute App**.
3. Select **App Store Connect** as the distribution method.
4. Select **Upload** (not Export).
5. Leave the default options (bitcode, symbols, etc.) and click **Next**.
6. Select the signing profile **Boardsesh App Store Distribution** (should be auto-detected).
7. Click **Upload**.
8. Wait for the upload to complete. You will see a success message.

The build will appear in App Store Connect within 5-30 minutes after upload. Apple runs automated processing (including a basic compliance check) before it becomes available.

---

## 5. Configure in App Store Connect

Go to https://appstoreconnect.apple.com and sign in with your Apple Developer account.

### If this is the first submission

1. **My Apps > + (New App)**
2. Fill in:
   - Platform: iOS
   - Name: Boardsesh
   - Primary Language: English (U.S.)
   - Bundle ID: com.boardsesh.app
   - SKU: com.boardsesh.app (or any unique string)

### For all submissions

1. Select the app, then go to the current version (e.g., 1.0).
2. Fill in each field using the values from `mobile/metadata/app-store-metadata.md`:
   - **Subtitle**: Train on Kilter, Tension & more
   - **Description**: Copy the full description from the metadata file.
   - **Keywords**: Copy the keyword string from the metadata file.
   - **Support URL**: https://boardsesh.com
   - **Marketing URL**: https://boardsesh.com
   - **What's New**: Copy from the metadata file.
   - **Review Notes**: Copy the full review notes section from the metadata file.
3. Upload screenshots for each required device size.
4. Set the **App Category** to Health & Fitness (primary) and Sports (secondary).
5. Set **Age Rating** to 4+ (no objectionable content).
6. Set **Copyright** to `2024-2026 Boardsesh contributors`.
7. Set **Privacy Policy URL** to `https://boardsesh.com/privacy`.

---

## 6. Privacy Questionnaire

App Store Connect asks about data collection during submission. Answer based on the privacy labels in the metadata doc.

### Do you collect data? **Yes**

### Data types collected

**Contact Info - Email Address**

- Usage: App Functionality
- Linked to user's identity: Yes
- Used for tracking: No

**Contact Info - Name**

- Usage: App Functionality
- Linked to user's identity: Yes
- Used for tracking: No

**Location - Precise Location**

- Usage: App Functionality
- Linked to user's identity: Yes
- Used for tracking: No

**Health & Fitness - Fitness Activity**

- Usage: App Functionality
- Linked to user's identity: Yes
- Used for tracking: No

**Diagnostics - Usage Data**

- Usage: Analytics
- Linked to user's identity: No
- Used for tracking: No

### For all data types

- **Do you or your third-party partners use this data for tracking?** No
- **Is this data required for the app to function, or can users choose to provide it?**
  - Email and username: Required
  - Location: Optional
  - Fitness activity: Optional (app works without logging climbs)
  - Usage data: Collected automatically, but anonymous

---

## 7. Submit for Review

1. In App Store Connect, under **Pricing and Availability**:
   - Set price to **Free**.
   - Set availability to **All Territories**.
2. Under **App Review Information**:
   - Sign-in required: Yes
   - Demo account email: test@boardsesh.com
   - Demo account password: test
   - Notes: Paste the review notes from the metadata doc.
3. Under **Version Release**:
   - Select **Manually release this version** (so you can control the launch timing).
4. Click **Submit for Review**.

---

## 8. Common Rejection Reasons and How to Avoid Them

### 4.2 Minimum Functionality (web wrapper)

Apple rejects apps that are just websites wrapped in a WebView without meaningful native functionality. Our defense:

- **This app requires native CoreBluetooth to communicate with Kilter Board and Tension Board hardware.** The Web Bluetooth API is not supported on iOS (https://caniuse.com/web-bluetooth). This is the sole reason the native app exists.
- The app declares `bluetooth-le` in `UIRequiredDeviceCapabilities` and `bluetooth-central` in `UIBackgroundModes`, signaling that BLE is core functionality.
- The Capacitor BluetoothLe plugin (CapacitorCommunityBluetoothLe) provides the CoreBluetooth bridge. The native implementation uses `CBCentralManager` for device discovery and `CBPeripheral` for characteristic writes to the board's Nordic UART Service.
- Include a screenshot of the Bluetooth pairing flow in the screenshots.
- If questioned, respond with: "This app requires native CoreBluetooth to communicate with Kilter Board hardware. Web Bluetooth is not supported on iOS. The app uses CBCentralManager to scan for boards advertising the Aurora BLE service (UUID 4488b571-7806-4df6-bcff-a2897e4953ff) and writes LED lighting commands to the Nordic UART RX characteristic (UUID 6e400002-b5a3-f393-e0a9-e50e24dcca9e). This functionality is not available in any iOS browser."

### 5.1.1(v) Account Deletion

Apple requires all apps with account creation to also support account deletion.

- Before submitting, verify that **Settings > Delete Account** works and fully removes the user's data.
- Test this with a throwaway account, not the demo account.

### 2.1 Performance (App Completeness)

- Test the app on a real device (not just simulator) before submitting.
- Make sure the app loads within a few seconds on a good network connection.
- If the Capacitor WebView takes too long to load, Apple may reject for performance. Consider adding a native splash screen that stays visible until the web content is ready.

### 2.5.1 Software Requirements

- Make sure the app does not crash on the latest iOS version.
- Test on the oldest iOS version you support (check `IPHONEOS_DEPLOYMENT_TARGET` in the Xcode project).

---

## 9. Post-Submission

- Apple reviews typically take **1 to 3 days**, sometimes faster.
- You will get an email if the app is approved or rejected.
- If approved with "Manually release" selected, go to App Store Connect and click "Release this version" when you are ready.

### If rejected

1. Read the rejection reason carefully. Apple usually cites a specific guideline number.
2. Fix the issue.
3. Upload a new build (increment the build number, not necessarily the version number).
4. Resubmit with a reply in the Resolution Center explaining what you changed.

### BLE-specific questions from review

Apple reviewers sometimes ask for more detail about Bluetooth usage. Be ready to explain:

- **Framework used:** CoreBluetooth, accessed via the CapacitorCommunityBluetoothLe plugin. The native implementation uses `CBCentralManager` (Central role) and `CBPeripheral` for GATT operations.
- **Services and characteristics:** The app scans for devices advertising the Aurora service (UUID `4488b571-7806-4df6-bcff-a2897e4953ff`). After connecting, it discovers the Nordic UART Service (UUID `6e400001-b5a3-f393-e0a9-e50e24dcca9e`) and writes to the RX characteristic (UUID `6e400002-b5a3-f393-e0a9-e50e24dcca9e`).
- **Data direction:** One-way only — phone to board. The app sends LED lighting commands (hold positions and colors) so the board illuminates the correct holds for a climb.
- **No personal data:** No personal, health, or identifying information is transmitted over Bluetooth. Only LED position and color bytes.
- **Background mode:** The app declares `bluetooth-central` in `UIBackgroundModes` to maintain the BLE connection when the user briefly switches apps during a climbing session. No background scanning or reconnection is performed.
- **Device capability:** The app declares `bluetooth-le` in `UIRequiredDeviceCapabilities` because BLE board control is core functionality.

### After approval

- Monitor crash reports in App Store Connect > App Analytics.
- Update the `What's New` text for each new version.
- Subsequent updates go through the same build > upload > submit flow but are usually reviewed faster.
