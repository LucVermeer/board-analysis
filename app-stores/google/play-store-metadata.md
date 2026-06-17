# Google Play Store Metadata - Boardsesh

> **Listing text is source-controlled in `fastlane/metadata/android/en-US/`** and
> pushed to Google Play by the `android metadata` lane (see `fastlane/Fastfile`
> and the `Mobile Store Metadata` workflow). Edit the `.txt` files there, not the
> prose below — the App Name, Short Description, Full Description, and What's New
> copy live in `title.txt`, `short_description.txt`, `full_description.txt`, and
> `changelogs/default.txt` respectively. The listing is localized: `en-US`
> (default), `es-ES`, and `fr-FR` each have their own folder under
> `fastlane/metadata/android/`, and `supply` uploads every locale folder it finds.
> This doc keeps the operational material that `supply` can't upload: the
> feature-graphic brief, testing instructions, data-safety form, and the
> screenshot map.

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

Canonical: [`fastlane/metadata/android/en-US/short_description.txt`](../../fastlane/metadata/android/en-US/short_description.txt) (Play limit: 80 characters). App Name lives in [`title.txt`](../../fastlane/metadata/android/en-US/title.txt) (Play limit: 30 characters).

## Full Description

Canonical: [`fastlane/metadata/android/en-US/full_description.txt`](../../fastlane/metadata/android/en-US/full_description.txt) (Play limit: 4000 characters).

## Listing images

Source-controlled under `fastlane/metadata/android/en-US/images/` and pushed by
the `android images` lane (see `fastlane/Fastfile` and the `Mobile Store Metadata`
workflow), so the Play store listing icon is updated from code, not the Play
Console UI.

- `icon.png` (512x512, 32-bit PNG, under 1MB): committed, resized from `packages/mobile/assets/icon.png`.
- `featureGraphic.png` (1024x500, no transparency): committed, the app logo (`packages/mobile/assets/adaptive-icon.png`) centered on a #0A0A0A background. A clean stopgap; swap in a designed banner (brief below) when one is ready.

The lane only uploads images that exist locally and never deletes a remote one,
so swapping either file and re-running is all it takes to update the listing.

**Feature graphic design brief:** show the Boardsesh logo/wordmark centered on a dark background (#0A0A0A or similar). Optionally include a faded image of a climbing wall or lit-up board holds behind the logo. Keep text minimal: the app name and a short tagline at most (e.g. "Light up your board"). Avoid screenshots in the feature graphic. Use high contrast so the logo reads well at small sizes in the Play Store browse view.

## Screenshots

**Specs:**

- Minimum 2, maximum 8 per device type (phone, 7-inch tablet, 10-inch tablet)
- JPEG or PNG, 16:9 or 9:16 aspect ratio
- Minimum 320px, maximum 3840px per side

**Screens to capture** (8 = the Play Store phone max; captured + uploaded by `vp run mobile:screenshots --platform android`, in store display order):

1. `00-home` — activity feed, your crew's sessions
2. `01-climbs` — browse the board's climbs
3. `02-board-view` — a climb with the holds lit (the signature view)
4. `03-discover` — the playlist library
5. `04-workout-generator` — the Record tab's workout generator
6. `05-profile` — your stats and progression
7. `06-board-sheet` — the board switcher
8. `07-session-detail` — a session recap: stats, leaderboard, sends

(Party Mode, playlist detail, and the logbook are on the iOS 10-shot set but don't fit Android's 8-shot cap.)

## What's New

Canonical: [`fastlane/metadata/android/en-US/changelogs/default.txt`](../../fastlane/metadata/android/en-US/changelogs/default.txt). Ships with the AAB at release time — `android-apk-rn.yml` stages it as the release's `whatsNewDirectory` (Play limit: 500 characters). Update it on every release.

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
7. Party Mode: Start a party session from the queue panel. This creates a WebSocket-backed collaborative session. You can open a second browser or device, sign in with a different account, and join the same session to test real-time sync. Sessions are always live: any participant can set the next climb and it broadcasts to everyone instantly. There is no single "driver" and no voting step (the older driver/vote model is deprecated). Whoever is connected to the board over Bluetooth relays the lit climb to the wall.
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
