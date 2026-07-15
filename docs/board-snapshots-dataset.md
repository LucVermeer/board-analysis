# Board snapshots as a downloadable dataset

Boardsesh publishes nightly SQLite snapshots of the climb catalogs it syncs. They exist to give
the mobile app a fast first download (see `board-snapshots.md` for that pipeline), but they are
plain, publicly fetchable SQLite files — anyone who wants a local copy of the climb data for
analysis, backup, or tooling can use them directly.

## Getting the data

The one stable URL is the manifest:

```
https://boardsesh-board-snapshots.t3.tigrisfiles.io/board-snapshots/v1/manifest.json
```

Everything else is discovered from it. **Never hardcode artifact URLs** — every nightly run mints
new timestamped artifacts, and superseded ones are pruned after a 14-day grace window. A cron job
that stores an artifact URL will 404 within two weeks; a job that reads the manifest first will
keep working.

```sh
# List what's available
curl -s https://boardsesh-board-snapshots.t3.tigrisfiles.io/board-snapshots/v1/manifest.json |
  jq -r '.entries[] | "\(.boardType):\(.layoutId)\t\(.bytes / 1e6 | floor)MB\t\(.tables.board_climbs.rowCount) climbs"'

# Download one board's catalog (e.g. Tension board 2)
url=$(curl -s https://boardsesh-board-snapshots.t3.tigrisfiles.io/board-snapshots/v1/manifest.json |
  jq -r '.entries[] | select(.boardType == "tension" and .layoutId == 9) | .url')
curl -o tension-9.db "$url"

# Query it
sqlite3 tension-9.db "SELECT name, setter_username FROM board_climbs LIMIT 5"
```

One artifact per **(board type, layout)** pair. A layout's artifact contains the full catalog for
that layout across all wall sizes — filter with `compatible_size_ids` (a JSON array column) if you
only care about one size.

## Manifest format

`formatVersion: 1`. Each entry:

| Field                                                   | Meaning                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `boardType`, `layoutId`                                 | Which catalog this artifact holds                                             |
| `url`                                                   | Public download URL (valid until pruned — always re-resolve via the manifest) |
| `key`                                                   | Object key under `board-snapshots/v1/`                                        |
| `bytes`                                                 | Stored size                                                                   |
| `contentEncoding`                                       | `identity` (a plain SQLite file) or `gzip` (gunzip before opening)            |
| `builtAt`                                               | When the export built this artifact                                           |
| `schemaVersion`                                         | SQLite schema revision of the tables inside                                   |
| `tables.<name>.rowCount`                                | Row counts, for sanity-checking a download                                    |
| `tables.<name>.watermarkUpdatedAt` / `watermarkSyncSeq` | Sync cursors (app-internal; irrelevant for dataset use)                       |

Artifacts are currently all `identity`-encoded. Treat `schemaVersion` as informational: columns may
be added over time (additive), and a breaking layout change would ship under a new
`board-snapshots/v2/` prefix rather than mutating `v1`.

## What's inside

Each artifact is a standard SQLite database with three tables. The authoritative DDL lives in
`packages/shared/offline-sync/src/db/schema.ts`.

**`board_climbs`** — one row per climb: `uuid` (primary key), `board_type`, `layout_id`, `name`,
`description`, `setter_username`, `angle` (the setter's intended angle, where the board type has
one), `frames` (the hold sequence as the board's native frame string), `edge_left/right/bottom/top`
(placement bounding box), `is_listed`/`is_draft` flags, `created_at`, `compatible_size_ids` /
`required_set_ids` (JSON arrays), and sync bookkeeping (`updated_at`, `sync_seq`).

**`board_climb_stats`** — community stats per `(climb, angle)`: `ascensionist_count`,
`difficulty_average` and `display_difficulty` (in the board's native difficulty scale),
`benchmark_difficulty` where the community designates benchmarks, `quality_average` (0–3 star
scale), and first-ascent attribution (`fa_username`, `fa_at`).

**`snapshot_meta`** — export bookkeeping (row counts, watermarks, schema/format versions). Useful
for verifying integrity: `row_count` should match `SELECT COUNT(*)` on each table.

Not included: Boardsesh-computed universal grades (`board_climb_grades` — see
`boardsesh-grade.md`), user accounts, ticks/logbooks, or any personal data beyond the public
setter username and first-ascent username attached to climbs and ascents by the climbers who
published them.

## Freshness and cadence

- Exports run nightly at **07:15 UTC** (plus occasional manual runs). `generatedAt` in the
  manifest tells you what you have.
- The manifest is served with `Cache-Control: max-age=300` — allow five minutes of staleness.
- Snapshots are point-in-time copies of Boardsesh's synced catalog; climbs published on a board
  minutes ago may not appear until the next nightly run.

## Being a good consumer

- Re-resolve through the manifest; download an artifact at most once per day (they only change
  nightly). The full set is ~600 MB, dominated by one 270 MB artifact — please don't re-fetch it
  hourly.
- Verify downloads: check `bytes` against what you received and run `PRAGMA quick_check` before
  trusting a file.

## Data provenance

The climbs, grades, and ascent statistics in these snapshots are user-generated content created by
climbers in each board's community. Boardsesh aggregates this catalog data to interoperate with
standing-hold training boards from multiple manufacturers. Kilter, Tension, MoonBoard, and other
board names are trademarks of their respective owners; Boardsesh is not affiliated with or endorsed
by any of them (see `/legal` on the website and `LEGAL.md`). If you redistribute or build on this
data, you are responsible for how you use it — attribute setters where you surface individual
climbs, and don't present the dataset as officially sourced from any board manufacturer.
