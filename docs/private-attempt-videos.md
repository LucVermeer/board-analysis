# Private Attempt Videos

MoonBoard 2024 attempt videos are private, owner-scoped recordings stored on
the backend's local filesystem. They are not community beta and never enter
`board_beta_links`, public feeds, social activity, or analysis exports.

## Configuration

| Variable                      | Default                                           | Purpose                                           |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `BOARDSESH_ATTEMPT_VIDEO_DIR` | `<backend cwd>/.boardsesh/private-attempt-videos` | Persistent local recording directory              |
| `BOARDSESH_ANALYSIS_URL`      | unset                                             | Base URL of the local provenance/analysis service |

The recording directory is created with mode `0700`; assets and temporary
parts use mode `0600`. Production deployments must mount this directory on a
persistent volume shared with the backend instance that serves the files.
Opaque asset keys are never returned by GraphQL or HTTP APIs.

## Tablet Access And HTTPS

The tablet must be able to reach the web and backend services on the local
network. Bind the development or production server to a LAN-reachable address,
allow the selected ports through the host firewall, and open the web app using
the host's LAN DNS name or IP address. Keep the backend URL configured to a
host that the tablet can also reach; `localhost` on the tablet refers to the
tablet itself.

Android Chrome exposes `getUserMedia` only in a secure context. A plain
`http://<LAN-IP>` page cannot request the camera. Use HTTPS with a certificate
trusted by the tablet (for example, a local reverse proxy and locally trusted
CA), then grant camera permission to that site. `http://localhost` is a browser
exception useful on the server machine, not on a separate tablet. Audio is
disabled for these recordings.

## Lifecycle

1. The authenticated client initializes an upload with a unique
   `clientRecordingId` and a MoonBoard 2024 climb snapshot.
2. Browser `MediaRecorder` chunks and native Android file slices are appended
   sequentially with `Upload-Offset`.
   Offset mismatches and status reads use the authoritative temporary-file
   offset so a partially received request can resume without duplicating data.
   Cancelling an active take stops capture, deletes the unfinished upload, and
   never creates a tick.
3. Finalization fsyncs the temporary file, atomically renames it, then creates
   one native `attempt` tick and marks the video ready in a locked transaction.
   Repeating finalization returns the same video and tick.
4. Owner-checked playback supports `GET`, `HEAD`, and single byte ranges. The
   web app uses a same-origin authenticated proxy; the Android app supplies its
   bearer credential as a protected Expo Video request header. Neither client
   exposes a bearer token in the URL.
5. Deletion first enters a retryable `deleting` state, removes the media, and
   deletes the video row. The linked attempt tick is retained.

Uploads are capped at 1 GiB and one hour. Uploading, finalizing, failed, or
deleting rows older than 24 hours are removed by startup and six-hour cleanup;
unreferenced files receive a one-hour grace period before deletion.

The recording directory is the only copy of each private video. Include it and
the BoardSesh database in the same backup schedule; restoring only one side can
leave missing assets or orphaned files. Automatic cleanup is not a retention
policy for ready recordings, so disk usage should be monitored separately.
Moving or deleting the directory outside BoardSesh makes existing recordings
unplayable but does not remove their attempt ticks.

MediaRecorder support remains browser-dependent. The client probes VP9 WebM,
VP8 WebM, generic WebM, and MP4 in that order and rejects recording when none
is available. Chunks are uploaded while recording; acknowledged chunks are
released from browser memory, while only the unacknowledged tail is retained
for retry. Camera permission, codec support, orientation changes, background
interruption, and long-recording behavior still require a final smoke test on
the target Android Chrome/tablet combination.

The native Android app records a silent 720p MP4 into Expo Camera's private
cache. It initializes the owner-scoped upload before capture, then sends bounded
4 MiB file slices after the camera closes. Retry reads the server's authoritative
offset and resumes from the retained cache file. Save and cancel both delete the
temporary local file; cancel also deletes the unfinished backend upload and
never creates a tick. Camera permission is declared without microphone access.

## Analysis Adapter

When `BOARDSESH_ANALYSIS_URL` is set, MoonBoard 2024 climb details query the
provider namespace `boardsesh_public_graphql_search_climbs`. Definitive and
unresolved candidates remain distinct. Move controls render only when the
analysis service explicitly reports `has_move_analysis=true`; private attempt
players expose ordinary video controls and 0.25x, 0.5x, and 1x speed only.
