# Changelog

User-facing changes to Boardsesh, newest first. Auto-generated from the "Release
Notes" section of merged pull requests — do not edit by hand (a CI check rejects
manual changes). See docs/mobile-ota-updates.md.

## 2026-06-20

### New

- Drive your board from the Android session notification ([#3073](https://github.com/boardsesh/boardsesh/pull/3073))
  The session notification now shows your current climb with its grade, angle, and your spot in the queue, and draws the board art right on your phone. Previous and Next move the board through your queue without opening the app, and the lightbulb shows when you're connected. When a crewmate takes the board, the card steps back to show what's on the wall.
- The lock-screen Live Activity got a cleaner look and now knows who's on the board. ([#3077](https://github.com/boardsesh/boardsesh/pull/3077))
  When you're connected, the bulb glows and Prev/Next move the wall through your
  queue; when a crewmate takes over, it shows what they're climbing instead. The
  grade shows in its real grade colour up in the corner, and the board thumbnail is
  easier to read at a glance.

## 2026-06-19

### New

- See what's new right in the app — a What's New page now lives under Settings, with a "New" dot when there's an update you haven't read yet. ([#3066](https://github.com/boardsesh/boardsesh/pull/3066))

### Fixed

- The board view now renders natively on the newest Android phones that use 16 KB memory pages (Android 15 and later, 64-bit devices). ([#3069](https://github.com/boardsesh/boardsesh/pull/3069))
