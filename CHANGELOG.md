# Changelog

User-facing changes to Boardsesh, newest first. Auto-generated from the "Release
Notes" section of merged pull requests — do not edit by hand (a CI check rejects
manual changes). See docs/mobile-ota-updates.md.

## 2026-07-06

### New

- Own a gym? Claim your listing and keep it accurate — verify with a work email or ask us to review. ([#3409](https://github.com/boardsesh/boardsesh/pull/3409))
  Gym owners and community leaders can now hand a crew member write access to keep a gym's details up to date.

### Fixed

- Fixed a crash where the app could be killed for using too much memory while browsing boards — most noticeable on older iPhones. ([#3482](https://github.com/boardsesh/boardsesh/pull/3482))

## 2026-07-05

### New

- Pair your gym's workout timer to your board — while you're lit up on the wall, every send starts the clock. ([#3473](https://github.com/boardsesh/boardsesh/pull/3473))
- The home screen now points you straight to the app in the App Store or Google Play. ([#3469](https://github.com/boardsesh/boardsesh/pull/3469))
- On iPad, the On the Wall view now keeps the screen from dimming so the board stays visible for your whole session. ([#3465](https://github.com/boardsesh/boardsesh/pull/3465))

### Fixed

- MoonBoard sends now add to a climb's community repeat count instead of wiping it — so popular benchmarks like Birthday Cake Trail Mix show their real numbers and sort back to the top of the list. ([#3461](https://github.com/boardsesh/boardsesh/pull/3461))
- Adding a climb to a playlist works again — press and hold a climb to add or remove it from your playlists right there, no disappearing sheet. ([#3452](https://github.com/boardsesh/boardsesh/pull/3452))
  Spin up a brand-new playlist in the same spot without it vanishing mid-name.

## 2026-07-04

### App update

A new version shipped to the App Store and Play Store.

### New

- Mount an iPad on the wall and the On the Wall tab now shows what's lit, big and readable from across the gym ([#3457](https://github.com/boardsesh/boardsesh/pull/3457))
  Step back and forward through the wall's history and tap Light this climb to put an accidental change right
- See what's lit on the wall from your iPad — a new On the Wall tab with the current climb, who's crushing it, the session's hardest send, and recent history, in portrait or landscape ([#3453](https://github.com/boardsesh/boardsesh/pull/3453))
  Smaller iPads now open the board history as a sheet, so the browse list keeps the full screen
- MoonBoard search now hides climbs set on holds you don't have — deselect the wooden holds (or any set) you don't own and those climbs drop out of your results. ([#3320](https://github.com/boardsesh/boardsesh/pull/3320))

### Fixed

- Turn off your MoonBoard's lights from the app — the Clear Lights button now works on MoonBoard walls. ([#3455](https://github.com/boardsesh/boardsesh/pull/3455))
- Queued climbs from a different board no longer flash your wall dark — Boardsesh skips them, tells you, and lights the next climb that fits your setup ([#3454](https://github.com/boardsesh/boardsesh/pull/3454))
  In a party session, a mate on a different wall can no longer knock your whole crew's queue off the current climb
- Original (first-generation) MoonBoard LED boxes are easier to find in the board picker ([#3450](https://github.com/boardsesh/boardsesh/pull/3450))
- Gyms with a single board now say "1 board", not "1 boards" — fixed in English, Spanish, and French ([#3449](https://github.com/boardsesh/boardsesh/pull/3449))
- The About, Acknowledgements, Licenses, and gym-edit screens no longer flash a black background when opened from the side menu in light mode ([#3426](https://github.com/boardsesh/boardsesh/pull/3426))
- On iPad, the sidebar highlight no longer flickers off when you move the pointer away from a tab you're navigating with the keyboard. ([#3446](https://github.com/boardsesh/boardsesh/pull/3446))
- French UI now calls your board « la board » everywhere — no more « panneau » or « planche » ([#3440](https://github.com/boardsesh/boardsesh/pull/3440))
- The board picker no longer flashes "Don't see your board?" tips while it's still scanning — they wait until the scan comes up empty. ([#3444](https://github.com/boardsesh/boardsesh/pull/3444))

## 2026-07-03

### New

- Dev/tester OTA-tooling screens; RN → native rendering with no behaviour change. ([#3321](https://github.com/boardsesh/boardsesh/pull/3321))
- Working a climb all session no longer floods your logbook — burns and the send collapse into one row with the day's total tries. Tap-and-hold or swipe still reaches every individual entry. ([#3384](https://github.com/boardsesh/boardsesh/pull/3384))
  Your projects now show alongside your sends by default. Flip back to sends-only anytime with the Show filter — your choice sticks.
  Open any climb you've worked and see your history per angle: total tries, sessions, and sends at 40° vs 45°.
- Outdated board and gym listings can now be fixed by the community — the setups you browse stay accurate as walls get reconfigured. ([#3313](https://github.com/boardsesh/boardsesh/pull/3313))
- Log a climb on a date other than today — backdate a send you forgot to tick, right from the log sheet. ([#3389](https://github.com/boardsesh/boardsesh/pull/3389))
- Requesting your MoonBoard data now sends a formal GDPR request that spells out exactly what Moon owes you — including what happened to any logbook that went missing. The letter lands on your clipboard so it pastes cleanly into your email. ([#3378](https://github.com/boardsesh/boardsesh/pull/3378))
- Your logbook now reads like a climbing diary — day headers with your send count and hardest send of the day, plus which board you were on. ([#3350](https://github.com/boardsesh/boardsesh/pull/3350))
  Rows lead with how it went: flash, send, or project, with your tries, your stars, and your grade next to the community's call.
  Spot beta at a glance — a violet camera marks every climb you have a video for, and a pencil marks your written notes.
  Swipe a logbook entry right to edit, left to delete (with a confirmation).

### Improved

- Leaving a session from the queue bar now just takes you out of the crew's session — it keeps going for everyone else. It only wraps up the whole session (with the recap) when you're the last one on the wall. ([#3375](https://github.com/boardsesh/boardsesh/pull/3375))
- Party mode: picking a climb from your logbook or a playlist while away from the board view now updates the shared queue instantly — no more waiting on the round trip. ([#3372](https://github.com/boardsesh/boardsesh/pull/3372))
- The hold, area, and setter filter pickers get proper navigation headers with a back button. ([#3371](https://github.com/boardsesh/boardsesh/pull/3371))
  Pasting a beta-video link no longer hides the text field behind the keyboard.
  The invite sheet opens at its intended height on Android.

### Fixed

- The "Show climbs" button in the filter now stays put on smaller iPhones — no more scrolling into a button you can't reach. ([#3433](https://github.com/boardsesh/boardsesh/pull/3433))
  Connecting a board? If yours isn't in the list, the picker now tells you why (asleep, connected to another phone, or too far) and flags when the boards nearby are a different type than the one you've got selected.
- French version now speaks climber French: log an « Enchaîné », count your « croix » — no more « envoyer » a climb ([#3438](https://github.com/boardsesh/boardsesh/pull/3438))
- On iPhone, opening one sheet right after another no longer stalls — the second one comes up as soon as the first finishes sliding away, instead of waiting out a fixed half-second. ([#3425](https://github.com/boardsesh/boardsesh/pull/3425))
- Mini MoonBoard now lights the right holds when you drive the wall from the lock screen or Dynamic Island ([#3413](https://github.com/boardsesh/boardsesh/pull/3413))
- Fixed climbs not lighting up on Kilter and Tension boards for iPhones on iOS 26.5 — no more blank board mid-session or connect–disconnect churn while your partner queues the next problem. ([#3365](https://github.com/boardsesh/boardsesh/pull/3365))
  Sending climbs over Bluetooth is faster: LED data now rides bigger Bluetooth packets when your phone and board support them.
- Lock-screen and Dynamic Island controls are more reliable: the session card no longer freezes on the wrong climb after quick navigation, dies after a hiccup starting up, or flips to "Session ended" minutes after you use it ([#3419](https://github.com/boardsesh/boardsesh/pull/3419))
- Party sessions stay in sync on the lock screen: reconnecting after a dead spot no longer freezes the Live Activity, and a crew mate shuffling the queue no longer flips it to the wrong climb ([#3414](https://github.com/boardsesh/boardsesh/pull/3414))
- What's New now only shows real update notes. Robot commit signatures and stray code links can't sneak into the feed anymore. ([#3424](https://github.com/boardsesh/boardsesh/pull/3424))
  The What's New screen also gets its proper background back, so the "you're on this build" chip is readable again instead of gray-on-black.
- The benchmark badge on a grouped ascents header now matches its climbs — a consensus benchmark no longer shows up on the rows but goes missing on the header. ([#3411](https://github.com/boardsesh/boardsesh/pull/3411))
- Star ratings from imported Kilter and Tension logbooks now show what you actually rated them — a climb you called a 3-star classic is 5 stars again, not "mediocre". ([#3397](https://github.com/boardsesh/boardsesh/pull/3397))
- See exactly who's in your session — the crew count no longer balloons with phantom climbers after a shaky connection, so a solo send stops reading as a party. ([#3338](https://github.com/boardsesh/boardsesh/pull/3338))

## 2026-07-02

### New

- Party queues on your phone stay in step with the crew even on flaky gym wifi — dropped or out-of-order updates get caught and quietly resynced instead of drifting silently. ([#3353](https://github.com/boardsesh/boardsesh/pull/3353))
- Scroll back through everything that's been up on the wall — board history no longer stops at the last 50 climbs ([#3354](https://github.com/boardsesh/boardsesh/pull/3354))

### Improved

- Sending a climb to the wall is snappier, and an accidental double-send no longer shows up twice in board history ([#3344](https://github.com/boardsesh/boardsesh/pull/3344))

### Fixed

- Filters work again: the Apply button no longer disappears after using the hold, area, or setter pickers, so your selections stick. ([#3352](https://github.com/boardsesh/boardsesh/pull/3352))
- Your session's queue is now visible only to people who've actually joined — invite links still show who's climbing before you join. ([#3341](https://github.com/boardsesh/boardsesh/pull/3341))
- The shared queue catches up reliably after a dropped connection, even when someone in the party is running a variable-speed playback. ([#3340](https://github.com/boardsesh/boardsesh/pull/3340))
- Board history keeps itself in sync — the wall feed catches up automatically after connection blips and when you come back to the app ([#3343](https://github.com/boardsesh/boardsesh/pull/3343))
  Smoother board history: no more full-list redraws when you reopen the app

## 2026-07-01

### New

- Your logbook now opens to your sends. Bring attempts back from the filters whenever you want. Old bookmarked logbook links open to sends by default too; flip attempts back on if you want both. ([#3334](https://github.com/boardsesh/boardsesh/pull/3334))

## 2026-06-30

### New

- MoonBoard climbers can now request their data and kick off getting it into Boardsesh ([#3333](https://github.com/boardsesh/boardsesh/pull/3333))
- Crash reports now know which preview channel you're running, so beta bugs get sorted out faster. ([#3327](https://github.com/boardsesh/boardsesh/pull/3327))
- Switch between app versions yourself: open **What's New → Try a preview** to jump onto any preview build — or tap **Production** to get back to the stable app. No tester access needed. ([#3324](https://github.com/boardsesh/boardsesh/pull/3324))

### Fixed

- Kilter logbook sync is more reliable — your Kilter sends and attempts keep importing even when a climb was logged more than once. ([#3329](https://github.com/boardsesh/boardsesh/pull/3329))
- Lock the Tall or Wide filter from its chip menu so it sticks when you clear other filters. ([#3322](https://github.com/boardsesh/boardsesh/pull/3322))
- The Tall and Wide filter chips now work — tap to filter to your homewall's shape, long-press to lock it on. ([#3319](https://github.com/boardsesh/boardsesh/pull/3319))
  Tap the Grade chip again (or swipe the grade picker away) to close it.

## 2026-06-29

### App update

A new version shipped to the App Store and Play Store.

### New

- On Android, the tag showing whose climb is on the wall is now a clean "On the wall" status band that fits the app instead of an iOS-style pill. ([#3293](https://github.com/boardsesh/boardsesh/pull/3293))
- Filter the gym map by how many boards a gym has, the board, the layout, and the exact size ([#3317](https://github.com/boardsesh/boardsesh/pull/3317))
  Hunt down a specific wall — like a 16x10 Kilter — instead of scrolling every gym nearby
- Cleaner single-choice filters in the climb-filter sheet — the status and accuracy pickers now use the native iOS/Android selection controls. ([#3280](https://github.com/boardsesh/boardsesh/pull/3280))
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
