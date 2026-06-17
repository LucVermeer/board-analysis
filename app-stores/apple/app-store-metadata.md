# App Store Metadata - Boardsesh

> **Listing text is source-controlled in `fastlane/metadata/en-US/`** and pushed to
> App Store Connect by the `ios metadata` lane (see `fastlane/Fastfile` and the
> `Mobile Store Metadata` workflow). Edit the `.txt` files there, not the prose
> below — the App Name, Subtitle, Description, Keywords, and What's New copy live
> in `name.txt`, `subtitle.txt`, `description.txt`, `keywords.txt`, and
> `release_notes.txt` respectively. This doc keeps the operational material that
> `deliver` can't upload: review notes, privacy labels, and the screenshot map.

## Basic Info

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| App Name           | Boardsesh                                      |
| Subtitle           | Light up climbs on any board (subtitle.txt)    |
| Bundle ID          | com.boardsesh.app                              |
| Category           | Health & Fitness (primary), Sports (secondary) |
| Age Rating         | 4+                                             |
| Copyright          | 2024-2026 Boardsesh contributors               |
| Support URL        | https://boardsesh.com                          |
| Marketing URL      | https://boardsesh.com                          |
| Privacy Policy URL | https://boardsesh.com/privacy                  |

## Keywords

Canonical: [`fastlane/metadata/en-US/keywords.txt`](../../fastlane/metadata/en-US/keywords.txt) (App Store limit: 100 characters, comma-separated, no spaces after commas).

## Description

Canonical: [`fastlane/metadata/en-US/description.txt`](../../fastlane/metadata/en-US/description.txt). App Name and Subtitle live in [`name.txt`](../../fastlane/metadata/en-US/name.txt) and [`subtitle.txt`](../../fastlane/metadata/en-US/subtitle.txt).

## What's New

Canonical: [`fastlane/metadata/en-US/release_notes.txt`](../../fastlane/metadata/en-US/release_notes.txt) — the "What's New in This Version" text. Update it on every release before running the `ios metadata` lane.

## Screenshots

iPhone 6.9" (1320×2868), captured + uploaded by `vp run mobile:screenshots` (Maestro → fastlane; see `packages/mobile/.maestro/README.md`). Ten slots, in store display order (the filename prefix sets the order):

1. `00-home` — activity feed, your crew's sessions
2. `01-climbs` — browse the board's climbs
3. `02-board-view` — a climb with the holds lit (the signature view)
4. `03-party` — a live, shared Party Mode session (filled by the party flow)
5. `04-session-detail` — a session recap: stats, leaderboard, sends
6. `05-workout-generator` — the Record tab's workout generator
7. `06-discover` — the playlist library
8. `07-playlist-detail` — a smart playlist (crowd favourites)
9. `08-logbook` — your logged sends and progression
10. `09-profile` — your stats and progression

Apple allows up to 10 and this set fills all 10; the board-switcher sheet shot was retired to make room. Google Play caps phones at 8, so its set drops party, playlist detail, and logbook (see the Play metadata).

## Review Notes

**Demo Account**

- Email: test@boardsesh.com
- Password: test

**Why this app needs to be native**

The core feature of Boardsesh is connecting to climbing board LED controllers via Bluetooth Low Energy (BLE). iOS Safari does not support the Web Bluetooth API (https://caniuse.com/web-bluetooth), which makes it impossible to control the board from a web browser on iPhone. This is the primary reason the app exists as a native iOS app. The web version at boardsesh.com works on Android and desktop browsers that support Web Bluetooth.

**Testing without a physical board**

You do not need a climbing board to test the app. Here is what you can verify:

1. **Sign in**: Use the demo account above. You will see the board selection screen.
2. **Browse climbs**: Select "Kilter Board" > pick any layout/size/angle combination. You will see a searchable list of thousands of community climbs with grade ratings and quality stars.
3. **Search and filter**: Use the filter controls to narrow by grade range, minimum quality rating, and hold count.
4. **View a climb**: Tap any climb to see the hold layout rendered on the board image. The colored circles show hand and foot positions.
5. **Queue management**: Tap the "+" button on a climb to add it to your queue. Open the queue panel to see your list. You can reorder by dragging and remove by swiping.
6. **Bluetooth pairing**: Go to the Bluetooth connection screen (gear icon or connection prompt). The app will request Bluetooth permission and scan for nearby BLE devices. Without a physical board, the scan will complete with no devices found. This is expected behavior.
7. **Party Mode**: Start a party session from the queue panel. This creates a WebSocket-backed collaborative session. You can open a second browser tab at boardsesh.com, sign in with a different account, and join the same session to test real-time sync (climb additions, queue reordering, and voting all sync live).
8. **Logbook**: After signing in, check the logbook/profile section to see logged climbs and stats.

**Native Bluetooth (CoreBluetooth)**

This app requires native CoreBluetooth to communicate with Kilter Board and Tension Board hardware. Web Bluetooth is not supported on iOS (https://caniuse.com/web-bluetooth), which is why this app exists as a native iOS app rather than a web app.

The app acts as a BLE Central and connects to climbing boards that advertise the Aurora service (UUID 4488b571-7806-4df6-bcff-a2897e4953ff). It discovers the Nordic UART Service (UUID 6e400001-b5a3-f393-e0a9-e50e24dcca9e) and writes LED lighting commands to the RX characteristic (UUID 6e400002-b5a3-f393-e0a9-e50e24dcca9e). Data flows one direction only: phone to board. No personal data is transmitted over Bluetooth.

The Capacitor BluetoothLe plugin (CapacitorCommunityBluetoothLe) provides the CoreBluetooth bridge. The native implementation uses CBCentralManager for device discovery and CBPeripheral for characteristic writes. The app declares bluetooth-le in UIRequiredDeviceCapabilities and bluetooth-central in UIBackgroundModes.

**Other technical notes**

- Network requests go to boardsesh.com (production API).
- WebSocket connections for Party Mode go to the backend at wss://backend.boardsesh.com.

## App Privacy - Data Collection Labels

### Data Linked to You

| Data Type        | Category         | Purpose                                                                             |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------- |
| Email Address    | Contact Info     | Account creation and authentication                                                 |
| Name / Username  | Contact Info     | Profile display, shown to other users in Party Mode and social features             |
| Precise Location | Location         | Party session discovery (finding nearby sessions), only when user grants permission |
| Fitness Activity | Health & Fitness | Climb ticks and logbook entries (sends, attempts, grades)                           |

### Data Not Linked to You

| Data Type  | Category    | Purpose                                                                        |
| ---------- | ----------- | ------------------------------------------------------------------------------ |
| Usage Data | Diagnostics | Vercel Analytics for page views and performance metrics, collected anonymously |

### Data Not Collected

- Financial information
- Contacts or address book
- Browsing history
- Purchases
- Photos or videos
- Health data (beyond fitness activity above)
- Sensitive information
- Advertising data
