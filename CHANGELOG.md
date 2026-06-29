# Changelog

User-facing changes to Boardsesh, newest first. Auto-generated from the "Release
Notes" section of merged pull requests — do not edit by hand (a CI check rejects
manual changes). See docs/mobile-ota-updates.md.

## 2026-06-29

### App update

A new version shipped to the App Store and Play Store.

### New

- Android: your climb filters now live in a tappable chip row right under the search bar — change grade, popularity, min rating, and what's shown in a single tap, no digging through a menu. ([#3310](https://github.com/boardsesh/boardsesh/pull/3310))
  Long-press the Tall or Wide chip to pin it so it sticks through clears.
- The workout generator's count steppers are easier to use — the number now sits between the − and + buttons, and you can press and hold to fly through the range. ([#3291](https://github.com/boardsesh/boardsesh/pull/3291))
- Buttons across the app now use the real iOS and Android button — so a tap feels native: the system's own press animation, a crisp spinner while something's loading instead of three dots, and delete/disconnect actions that turn the proper system red. Your main violet action button stays bold and solid over busy board art and in dark mode, while quieter buttons pick up iOS 26's Liquid Glass on a calm background. ([#3309](https://github.com/boardsesh/boardsesh/pull/3309))
- Sign-in and profile fields now use your phone's own keyboard, password autofill, and (on iPhone) Strong Password. ([#3284](https://github.com/boardsesh/boardsesh/pull/3284))
- Mini MoonBoard is here — both the 2020 and 2025 Mini boards now show up with the right holds, so you can find problems, build a queue and log your sends on a Mini just like the full-size wall. ([#3287](https://github.com/boardsesh/boardsesh/pull/3287))
- Android: the Home scope switcher now opens a smoother, native dropdown. ([#3279](https://github.com/boardsesh/boardsesh/pull/3279))
- In the logbook, Latest and Hardest are now quick-tap chips at the top — switch how your ticks are sorted without opening the filter sheet. (iOS; the rest of the filters stay one tap away in the sheet.) ([#3265](https://github.com/boardsesh/boardsesh/pull/3265))
- See the grade you gave each climb right in its logbook ([#3274](https://github.com/boardsesh/boardsesh/pull/3274))
  Logbook, community, and similar-climbs sections now stay open if you leave them open
  Long-press a climb's name to copy it
- Find What's New in the user menu now — tap your avatar to see the latest updates, with a badge when there's something fresh. ([#3276](https://github.com/boardsesh/boardsesh/pull/3276))

### Fixed

- Long boulder names read in full again — the climb view and the play bar scroll a long name so nothing gets cut off. ([#3255](https://github.com/boardsesh/boardsesh/pull/3255))
- The board, layout, and size buttons on board setup no longer cut off their labels — they wrap to fit and every option is visible. ([#3292](https://github.com/boardsesh/boardsesh/pull/3292))
- MoonBoard sends now show the board preview in your crew's session feed, just like Kilter and Tension. ([#3286](https://github.com/boardsesh/boardsesh/pull/3286))

## 2026-06-28

### App update

A new version shipped to the App Store and Play Store.

### New

- Your settings now use your phone's own native controls and layout — the More screen looks and moves like the rest of iOS and Android. ([#3261](https://github.com/boardsesh/boardsesh/pull/3261))
- Switches, segmented pickers, and the angle slider now use your phone's own native controls, so they look and move like the rest of iOS and Android. ([#3254](https://github.com/boardsesh/boardsesh/pull/3254))
- See which playlists a climb is in, right from the list. Turn on **Show playlist tags** under More → Display. ([#3260](https://github.com/boardsesh/boardsesh/pull/3260))
- Curious what's coming? Open What's New and tap **Try a preview** to load an upcoming change before it ships — then reset to jump back to the shipped version anytime. ([#3258](https://github.com/boardsesh/boardsesh/pull/3258))
- The current climb's bar now stays on your main tabs and gets out of the way on detail, filter, and settings screens. ([#3253](https://github.com/boardsesh/boardsesh/pull/3253))
- See who's on the wall at a glance — when a crewmate lights up a different climb, their face and the climb show in a capsule up top, and the bottom bar stays your own queue. ([#3247](https://github.com/boardsesh/boardsesh/pull/3247))

### Improved

- Internal CI change — no user-facing or runtime behavior change. Wires the existing mobile dependency-health check into the CI pipeline so native-module drift from the Expo SDK fails the build instead of being opt-in. ([#3248](https://github.com/boardsesh/boardsesh/pull/3248))
- Draft pilot enabling React Compiler auto-memoization; not yet shipped — pending measurement. ([#3239](https://github.com/boardsesh/boardsesh/pull/3239))

### Fixed

- The grade filter button on the climbs screen now just says "Grade" until you pick a range. ([#3264](https://github.com/boardsesh/boardsesh/pull/3264))
- The grade filter now opens where you left off — on your recent grades instead of scrolled all the way back to the easy end. ([#3256](https://github.com/boardsesh/boardsesh/pull/3256))

## 2026-06-27

### App update

A new version shipped to the App Store and Play Store.

### New

- Filter the climb list right where you are — grade, sort, popularity, and your recent filters now sit in a chip row under the title instead of behind a button. ([#3245](https://github.com/boardsesh/boardsesh/pull/3245))
  Home-wall boards get Tall/Wide chips; long-press to lock one so the right climbs always show.
- Internal/ops change — no user-facing behavior change. Adds a non-blocking post-publish health check for production OTA updates and a documented rollback runbook. The health gate ships inert and activates once the `POSTHOG_PERSONAL_API_KEY` repo secret is added to the Production environment. ([#3243](https://github.com/boardsesh/boardsesh/pull/3243))

### Improved

- Internal dependency-hygiene change. No user-facing or runtime behavior change — native module versions are unchanged, only their version *ranges* are tightened to the already-installed versions, plus a new read-only CI check. ([#3237](https://github.com/boardsesh/boardsesh/pull/3237))
- App Store metadata copy + version bump only; no in-app behaviour changes. ([#3246](https://github.com/boardsesh/boardsesh/pull/3246))
- Internal CI/build hygiene — no user-facing change. ([#3238](https://github.com/boardsesh/boardsesh/pull/3238))

### Fixed

- Internal preview-tester tooling hardening — removes a write-capable EAS token from preview builds; the in-app branch switcher now repoints the build at a branch device-locally. No public, user-facing change. ([#3241](https://github.com/boardsesh/boardsesh/pull/3241))
- Playlist creation errors now appear inside the sheet instead of an invisible toast behind it. ([#3240](https://github.com/boardsesh/boardsesh/pull/3240))
- Filter climbs by setter, hold type, or board region again — these pickers were opening to a blank sheet that vanished on its own, and now open full-screen. ([#3236](https://github.com/boardsesh/boardsesh/pull/3236))
  Scroll the whole filter sheet — expanding the Refine or Advanced sections no longer hides options below the fold.
- Party-mode realtime now reconnects after an auth refresh, and queries pause offline and refetch when the connection returns. ([#3242](https://github.com/boardsesh/boardsesh/pull/3242))
- Kilter and Tension boards light up reliably again on iPhone — climbs send to the wall instead of the board connecting but staying dark. ([#3228](https://github.com/boardsesh/boardsesh/pull/3228))

## 2026-06-26

### App update

A new version shipped to the App Store and Play Store.

### New

- Tap any climb in a circuit or playlist and the whole list drops into your queue in order — swipe right or hit back to revisit the boulders above, not just jump to the next one. ([#2773](https://github.com/boardsesh/boardsesh/pull/2773))
  A heads-up before a playlist takes over your queue, so you don't lose climbs you'd lined up.
- Connect your Kilter account with your username and password to pull your sends, attempts, ratings, and circuits into Boardsesh. ([#3170](https://github.com/boardsesh/boardsesh/pull/3170))
  Used the old Kilter app built by Aurora? Import a JSON export or request your data from the new "Kilter (Aurora)" card.
- MoonBoard hold circles are now bigger and easier to read at a glance. ([#3218](https://github.com/boardsesh/boardsesh/pull/3218))
- Thousands more MoonBoard problems, now with real grades, star ratings and send counts — and the Mini 2025 and original 2010 boards join the lineup. Your 25° sessions on the 2016 and 2024 boards finally have their own graded problems too. ([#3214](https://github.com/boardsesh/boardsesh/pull/3214))
- Pick hold colours with a real colour picker — slide lightness, saturation, and hue instead of typing numbers ([#3212](https://github.com/boardsesh/boardsesh/pull/3212))
  Built for colour blindness: a lightness-first picker, plus a toggle to preview your colours through red-green and blue-yellow colour blindness
  New octagon marker shape, so every hold role can have its own distinct shape
  Accessibility hold settings now live on their own page, with a live preview on your board
- Sorting by Hardest now reads top-to-bottom the way you'd expect, and every logbook entry shows both grades — the grade you logged, plus the community consensus beside it when the crowd disagrees (and on climbs you never graded yourself). ([#3202](https://github.com/boardsesh/boardsesh/pull/3202))

### Fixed

- MoonBoard holds now light up on iPhone — connect and your problem shows on the wall. ([#3225](https://github.com/boardsesh/boardsesh/pull/3225))
- Pinch-to-zoom now works first try when setting a climb or filtering holds on Android, instead of taking several tries or swiping the sheet shut ([#3045](https://github.com/boardsesh/boardsesh/pull/3045))
- The Ascents by angle chart now reads clearly when a climb is popular at lots of angles — angle labels stay readable and rarely-climbed angles no longer vanish next to a dominant one. ([#3221](https://github.com/boardsesh/boardsesh/pull/3221))
- The Accessibility settings now make it clear that custom hold colours light up your board, not just the in-app markers — so the feature stops looking like it's missing. ([#3220](https://github.com/boardsesh/boardsesh/pull/3220))
- MoonBoard on iPhone now recovers and re-lights the wall after a flaky Bluetooth moment instead of going dark, and the Dynamic Island climb controls drive a MoonBoard too. ([#3219](https://github.com/boardsesh/boardsesh/pull/3219))
- Fixed an iOS freeze where the app could stop responding to taps after opening and closing sheets (board history, the queue, filters) or after using the sidebar. ([#3211](https://github.com/boardsesh/boardsesh/pull/3211))
- Smoothed out the logbook filter: swipe down or tap outside to close it and your filters and sort apply automatically (no more Apply button), the grade picker opens at the start instead of jumping to the middle, and the Refine and Advanced sections start tucked away so it opens tidy. ([#3201](https://github.com/boardsesh/boardsesh/pull/3201))

## 2026-06-25

### App update

A new version shipped to the App Store and Play Store.

### New

- Logbook search and filters are tucked away while we put the finishing touches on them ([#3200](https://github.com/boardsesh/boardsesh/pull/3200))
- Testers can now flip feature flags on or off right in the app, no new build needed ([#3199](https://github.com/boardsesh/boardsesh/pull/3199))
- Your logbook is searchable again on mobile. Head to You → Logbook to find a climb by name, narrow by grade, angle, date, or sends/attempts, and sort by **Latest** or **Hardest** so your hardest ticks rise to the top. The filter button is amber, so you always know you're searching your logbook, not the whole board. ([#3179](https://github.com/boardsesh/boardsesh/pull/3179))
- The full MoonBoard 2024 catalog is now on Boardsesh — every problem shows its style (footless, footless + kickboard, no-kickboard) as a tag. ([#3151](https://github.com/boardsesh/boardsesh/pull/3151))
- Forgot your password? Now you can reset it — tap "Forgot password?" on the login screen and we'll email you a secure reset link. Works on web and mobile. ([#3185](https://github.com/boardsesh/boardsesh/pull/3185))
- MoonBoard problems now carry their style — footless, footless + kickboard, and no-kickboard show as tags right on the climb, and you can pick one when you set a problem. Benchmarks are now set by the crew that curates them, not anyone with the create screen open. Under the hood, "no matching" is proper climb data now instead of a note buried in the description. ([#3171](https://github.com/boardsesh/boardsesh/pull/3171))

### Fixed

- Flick through climbs in the player without the view accidentally sliding shut mid-swipe. ([#3195](https://github.com/boardsesh/boardsesh/pull/3195))
  On Android, the next climb now lands cleanly at the end of a swipe — no more flash.
- Fixed password reset emails linking to `localhost:3000` instead of `www.boardsesh.com` — the reset link in your inbox will now take you to the right place. ([#3196](https://github.com/boardsesh/boardsesh/pull/3196))
- Tap a climb on a flaky Bluetooth link and the wall now re-lights itself instead of staying dark — no more re-tapping a climb that didn't show up. ([#3186](https://github.com/boardsesh/boardsesh/pull/3186))

## 2026-06-24

### App update

A new version shipped to the Play Store.

### New

- Find a gym by board type ([#3178](https://github.com/boardsesh/boardsesh/pull/3178))
  Filter the map to gyms that have a Kilter, Tension, or MoonBoard.

### Improved

- https://claude.ai/code/session_0169kjQT2BwqYRfTXGwZ4srZ ([#3180](https://github.com/boardsesh/boardsesh/pull/3180))

## 2026-06-23

### New

- Bring your Instagram climbing beta into Boardsesh. On your Instagram profile, run the quick scan, paste it into Import Beta, and Boardsesh shows which of your filmed climbs aren't linked yet. Attach the missing ones in a couple of taps and your videos show up as beta on those climbs for the whole crew. Works with Kilter and Tension. ([#3117](https://github.com/boardsesh/boardsesh/pull/3117))

### Fixed

- Fixed the app freezing on some Android phones (Samsung S24/S25, Pixel) — if you'd changed your phone's display size, the app could open but ignore every tap and swipe. Touch works again. ([#3165](https://github.com/boardsesh/boardsesh/pull/3165))

## 2026-06-22

### App update

A new version shipped to the App Store and Play Store.

### Fixed

- Android: if the sign-in screen won't respond to taps on a newer phone, the login screen now shows how to sign in using split-screen while we fix the freeze. ([#3159](https://github.com/boardsesh/boardsesh/pull/3159))
- Sign-in on recent Android phones no longer leaves the login form unresponsive — you can tap and sign in without the split-screen workaround. ([#3158](https://github.com/boardsesh/boardsesh/pull/3158))
- Android: fixed a freeze on some phones (Pixel 10, Galaxy S24+) where the login screen and climb list stopped responding to taps — the app stays responsive now. ([#3148](https://github.com/boardsesh/boardsesh/pull/3148))

## 2026-06-21

### App update

A new version shipped to the Play Store.

### New

- Stuck at sign-in? Report a bug or jump into Discord without logging in first. ([#3131](https://github.com/boardsesh/boardsesh/pull/3131))
- You can now see at a glance when you're driving the board: the bar lights up when you have control, shows who's driving when a crewmate has it, and lets you connect or open board controls right from the bar — no digging into the climb view. ([#3115](https://github.com/boardsesh/boardsesh/pull/3115))

### Fixed

- Your session stats now count only your own climbs. On the You and profile Sessions tabs, your weekly sends and flashes, grade spread, and hardest send no longer fold in your crew's climbs from group sessions. ([#3140](https://github.com/boardsesh/boardsesh/pull/3140))
- Tester-only dev tooling + backend security/integrity hardening; nothing climber-facing. ([#3116](https://github.com/boardsesh/boardsesh/pull/3116))

## 2026-06-20

### App update

A new version shipped to the App Store and Play Store.

### New

- Beta testers can now switch OTA update channels right in the app to preview a specific build. ([#3068](https://github.com/boardsesh/boardsesh/pull/3068))
- See when a new app version landed — What's New now flags store updates, so you can tell what arrived over the air from what needs an app update. ([#3101](https://github.com/boardsesh/boardsesh/pull/3101))
  Tap "Check for updates" in What's New to grab the latest fixes on the spot.
- See a climber's recent beta videos right on their profile — swipe through the shelf or tap See all for the full grid. ([#3076](https://github.com/boardsesh/boardsesh/pull/3076))
- Drive your board from the Android session notification ([#3073](https://github.com/boardsesh/boardsesh/pull/3073))
  The session notification now shows your current climb with its grade, angle, and your spot in the queue, and draws the board art right on your phone. Previous and Next move the board through your queue without opening the app, and the lightbulb shows when you're connected. When a crewmate takes the board, the card steps back to show what's on the wall.
- The lock-screen Live Activity got a cleaner look and now knows who's on the board. ([#3077](https://github.com/boardsesh/boardsesh/pull/3077))
  When you're connected, the bulb glows and Prev/Next move the wall through your
  queue; when a crewmate takes over, it shows what they're climbing instead. The
  grade shows in its real grade colour up in the corner, and the board thumbnail is
  easier to read at a glance.

### Improved

- Boards open without a hitch on Android — selecting a board no longer briefly freezes the app. ([#3099](https://github.com/boardsesh/boardsesh/pull/3099))

### Fixed

- Find a gym on a full-screen map you can drag to resize, pan to explore new areas, and search by city — board picking right from the map. ([#3118](https://github.com/boardsesh/boardsesh/pull/3118))
- The wall history keeps up with your crew now — sends from friends show up right away, even after your phone's been in your pocket or your signal dropped for a moment. Pull down on the history list any time to refresh it. ([#3111](https://github.com/boardsesh/boardsesh/pull/3111))
- Fixed an Android freeze where the app could stop responding after a couple of minutes — the climb list wouldn't scroll and both bars went dead until you reopened the app. It stays live now. ([#3108](https://github.com/boardsesh/boardsesh/pull/3108))
- Fixed an Android freeze where the top and bottom bars stopped responding right after you picked a climb. ([#3104](https://github.com/boardsesh/boardsesh/pull/3104))
- Sign in with Apple now falls back to a browser sign-in on iPhone when the native prompt can't complete, so you're not locked out. ([#3092](https://github.com/boardsesh/boardsesh/pull/3092))
- Pick a board and keep climbing — fixed an Android freeze that hit right after switching boards. ([#3097](https://github.com/boardsesh/boardsesh/pull/3097))
- Playlist grades now match the wall angle you've dialed in, instead of a climb's most-popular angle ([#3090](https://github.com/boardsesh/boardsesh/pull/3090))

## 2026-06-19

### App update

A new version shipped to the App Store and Play Store.

### New

- See what's new right in the app — a What's New page now lives under Settings, with a "New" dot when there's an update you haven't read yet. ([#3066](https://github.com/boardsesh/boardsesh/pull/3066))

### Fixed

- The board view now renders natively on the newest Android phones that use 16 KB memory pages (Android 15 and later, 64-bit devices). ([#3069](https://github.com/boardsesh/boardsesh/pull/3069))
