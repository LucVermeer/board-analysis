# Google Play Store Metadata - Boardsesh

## Basic Info

| Field              | Value                            |
| ------------------ | -------------------------------- |
| App Name           | Boardsesh                        |
| Package Name       | com.boardsesh.app                |
| Category           | Health & Fitness                 |
| Tags               | Sports, Fitness                  |
| Content Rating     | Everyone (IARC)                  |
| Pricing            | Free                             |
| Contains Ads       | No                               |
| In-app Purchases   | No                               |
| Contact Email      | TODO: fill in team contact email |
| Support URL        | https://boardsesh.com            |
| Privacy Policy URL | https://boardsesh.com/privacy    |

## Short Description

```
Connect to your Kilter, Tension, or MoonBoard and light up holds via Bluetooth.
```

(79 characters)

## Full Description

```
Boardsesh connects your phone to your Kilter Board, Tension Board, or MoonBoard over Bluetooth and lights up the holds on your wall. Search tens of thousands of community-set climbs, filter by grade and quality, build a queue, and start climbing.

ONE APP FOR EVERY BOARD

Pick your board, pick your angle, and browse. Boardsesh pulls from the same climb databases you already know (Aurora Climbing for Kilter and Tension, MoonBoard for Moon). Filter by grade range, rating, hold count, and more. When you find something worth trying, tap to light it up on the wall.

BUILD A QUEUE, SKIP THE PHONE FUMBLING

Line up your climbs before you get to the gym or between burns. Reorder your list, swipe to remove, and cycle through with one tap. No more unlocking your phone mid-session to find the next problem.

CLIMB WITH YOUR CREW

Party Mode lets you run a shared session over the internet. Everyone in the session sees the same queue and can add climbs, reorder, and vote. One person's phone controls the board. Works across the gym or across the country.

TRACK YOUR SENDS

Log every attempt and send. See your progression over time, check your hardest grades, and look back at what you climbed last week or last year. Your logbook syncs with your Aurora Climbing account.

WHY A NATIVE APP?

While Web Bluetooth works in Chrome on Android, the native app provides better BLE reliability, persistent connections that survive screen-off, background support so your board stays lit while you climb, native deep linking into climbs and sessions, and a proper app experience with notifications and home screen presence. You get a more stable connection and fewer dropped signals mid-session.

FREE AND OPEN SOURCE

No ads, no subscriptions, no paywalls. Boardsesh is open source and built by climbers. The code is on GitHub if you want to contribute or just see how it works.

Supported boards:
- Kilter Board (all sizes and angles)
- Tension Board (all sizes and angles)
- MoonBoard (2016, 2017, 2019, 2024 setups)

Requires Bluetooth Low Energy (BLE) for board connection. Works without a board for browsing, queuing, and logbook features.
```

(2139 characters)

## Feature Graphic

**Specs:** 1024x500 PNG or JPG, no transparency, no rounded corners applied by developer (Play Store rounds them).

**Design brief:** The feature graphic should show the Boardsesh logo/wordmark centered on a dark background (#0A0A0A or similar). Optionally include a faded image of a climbing wall or lit-up board holds behind the logo. Keep text minimal: the app name and a short tagline at most (e.g. "Light up your board"). Avoid screenshots in the feature graphic. Use high contrast so the logo reads well at small sizes in the Play Store browse view.

## Screenshots

**Specs:**

- Minimum 2, maximum 8 per device type (phone, 7-inch tablet, 10-inch tablet)
- JPEG or PNG, 16:9 or 9:16 aspect ratio
- Minimum 320px, maximum 3840px per side

**Screens to capture:**

1. Board selection screen (Kilter, Tension, MoonBoard options)
2. Climb list with filters (grade range, rating, hold count)
3. Climb detail view with holds lit up on the board image
4. Queue panel with multiple climbs lined up
5. Bluetooth scanning / device connection screen
6. Party Mode session with shared queue and participants
7. Logbook / profile with send history and grade progression

## What's New (Version 1.0)

```
First release. Connect to your Kilter, Tension, or MoonBoard over Bluetooth. Browse and search climbs, build queues, track sends, and run shared sessions with Party Mode.
```

## Testing Instructions

Internal reference for QA and closed testing tracks. Not a Play Store field.

**Demo Account**

- Email: test@boardsesh.com
- Password: test

**Testing steps:**

1. Sign in with the demo account. You will see the board selection screen.
2. Browse climbs: Select "Kilter Board" and pick any layout/size/angle combination. You will see a searchable list of thousands of community climbs with grade ratings and quality stars.
3. Search and filter: Use the filter controls to narrow by grade range, minimum quality rating, and hold count.
4. View a climb: Tap any climb to see the hold layout rendered on the board image. Colored circles show hand and foot positions.
5. Queue management: Tap the "+" button on a climb to add it to your queue. Open the queue panel to see your list. Reorder by dragging, remove by swiping.
6. Bluetooth pairing: Go to the Bluetooth connection screen. The app will request Bluetooth permission and scan for nearby BLE devices. Without a physical board, the scan will complete with no devices found. This is expected.
7. Party Mode: Start a party session from the queue panel. This creates a WebSocket-backed collaborative session. You can open a second browser or device, sign in with a different account, and join the same session to test real-time sync (climb additions, queue reordering, and voting all sync live).
8. Logbook: Check the logbook/profile section to see logged climbs and stats.

## Data Safety Form

**Does your app collect or share any of the required user data types?** Yes

**Is all of the user data collected by your app encrypted in transit?** Yes

**Do you provide a way for users to request that their data is deleted?** Yes

### Data Collected

| Data type                      | Collected | Shared | Purpose                            | Optional                     |
| ------------------------------ | --------- | ------ | ---------------------------------- | ---------------------------- |
| Email address                  | Yes       | No     | Account management                 | No (required for account)    |
| Name                           | Yes       | No     | App functionality, personalization | No (required for profile)    |
| Approximate location           | Yes       | No     | App functionality                  | Yes                          |
| Precise location               | Yes       | No     | App functionality                  | Yes                          |
| Health info - Fitness activity | Yes       | No     | App functionality                  | Yes                          |
| App interactions               | Yes       | No     | Analytics                          | No (collected automatically) |
| Crash logs                     | Yes       | No     | Analytics                          | No (collected automatically) |

### Data NOT Collected

- Financial info (no payments in app)
- Messages or chat content (Party Mode is queue-based, not chat)
- Photos, videos, or audio
- Files or documents
- Calendar or contacts
- Device identifiers for advertising
- Browsing history
