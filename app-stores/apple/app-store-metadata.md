# App Store Metadata - Boardsesh

## Basic Info

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| App Name           | Boardsesh                                      |
| Subtitle           | Train on Kilter, Tension & more                |
| Bundle ID          | com.boardsesh.app                              |
| Category           | Health & Fitness (primary), Sports (secondary) |
| Age Rating         | 4+                                             |
| Copyright          | 2024-2026 Boardsesh contributors               |
| Support URL        | https://boardsesh.com                          |
| Marketing URL      | https://boardsesh.com                          |
| Privacy Policy URL | https://boardsesh.com/privacy                  |

## Keywords

```
kilter board,tension board,moonboard,climbing,training,bluetooth,LED,bouldering,spray wall,queue
```

(97 characters)

## Description

Boardsesh connects your phone to your Kilter Board, Tension Board, or MoonBoard over Bluetooth and lights up the holds on your wall. Search tens of thousands of community-set climbs, filter by grade and quality, build a queue, and start climbing.

**One app for every board**

Pick your board, pick your angle, and browse. Boardsesh pulls from the same climb databases you already know (Aurora Climbing for Kilter and Tension, MoonBoard for Moon). Filter by grade range, rating, hold count, and more. When you find something worth trying, tap to light it up on the wall.

**Build a queue, skip the phone fumbling**

Line up your climbs before you get to the gym or between burns. Reorder your list, swipe to remove, and cycle through with one tap. No more unlocking your phone mid-session to find the next problem.

**Climb with your crew**

Party Mode lets you run a shared session over the internet. Everyone in the session sees the same queue and can add climbs, reorder, and vote. One person's phone controls the board. Works across the gym or across the country.

**Track your sends**

Log every attempt and send. See your progression over time, check your hardest grades, and look back at what you climbed last week or last year. Your logbook syncs with your Aurora Climbing account.

**Why a native app?**

iOS Safari does not support Web Bluetooth, which means a website cannot talk to your board's LED controller on iPhone. Boardsesh exists as a native app specifically so you can connect to your board from your phone. On Android and desktop, you can also use boardsesh.com directly in the browser.

**Free and open source**

No ads, no subscriptions, no paywalls. Boardsesh is open source and built by climbers. The code is on GitHub if you want to contribute or just see how it works.

Supported boards:

- Kilter Board (all sizes and angles)
- Tension Board (all sizes and angles)
- MoonBoard (2016, 2017, 2019, 2024 setups)

Requires Bluetooth Low Energy (BLE) for board connection. Works without a board for browsing, queuing, and logbook features.

## What's New (Version 1.0)

First release. Connect to your Kilter, Tension, or MoonBoard over Bluetooth. Browse and search climbs, build queues, track sends, and run shared sessions with Party Mode.

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
