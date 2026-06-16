import Foundation
import UIKit

// MARK: - ThumbnailFetcher

/// Fetches climb hold-overlay thumbnails from the server and caches them in
/// the App Group shared container so Live Activities can display them. The
/// request intentionally omits `include_background=1`; bundled board photos
/// must not be fetched over the network from native widget code. Instead the
/// holds overlay is composited on top of the bundled board-background webp(s)
/// staged by `LiveActivityModule.startSession` (the no-network-board-art rule),
/// so the cached thumbnail the widget renders carries the full board photo.
actor ThumbnailFetcher {

    // MARK: - Configuration

    /// Maximum number of cached thumbnails before eviction kicks in.
    static let maxCachedThumbnails = 10

    /// Subdirectory inside the shared container where thumbnails are stored.
    static let thumbnailsDirectory = "thumbnails"

    // MARK: - Dependencies

    private let urlSession: URLSession
    private let fileManager: FileManager
    private let sharedDefaults: UserDefaults?
    private let sharedContainerUrl: URL?

    // MARK: - In-flight deduplication

    /// Prevents duplicate fetches for the same climb UUID.
    private var inFlightTasks: [String: Task<URL?, Never>] = [:]

    // MARK: - Init

    init(
        urlSession: URLSession = .shared,
        fileManager: FileManager = .default,
        sharedDefaults: UserDefaults? = SharedConstants.sharedDefaults,
        sharedContainerUrl: URL? = SharedConstants.sharedContainerUrl
    ) {
        self.urlSession = urlSession
        self.fileManager = fileManager
        self.sharedDefaults = sharedDefaults
        self.sharedContainerUrl = sharedContainerUrl
    }

    // MARK: - Public API

    /// Builds the thumbnail URL for a given queue item using board details
    /// stored in shared UserDefaults.
    func buildThumbnailURL(for item: SharedQueueItem) -> URL? {
        guard let defaults = sharedDefaults else { return nil }
        return SharedQueueState.boardRenderUrl(for: item, from: defaults)
    }

    /// Fetches a thumbnail for the given queue item and returns a file URL
    /// pointing to the cached image in the shared container.
    ///
    /// Returns `nil` if any step fails (network error, missing config, etc.).
    func fetchThumbnail(for item: SharedQueueItem) async -> URL? {
        // Return cached file if it already exists.
        if let cached = cachedFileURL(for: item.climbUuid), fileManager.fileExists(atPath: cached.path) {
            // Touch the file so eviction treats it as recently used.
            try? fileManager.setAttributes(
                [.modificationDate: Date()],
                ofItemAtPath: cached.path
            )
            return cached
        }

        // Deduplicate in-flight requests for the same climb.
        if let existing = inFlightTasks[item.climbUuid] {
            return await existing.value
        }

        let task = Task<URL?, Never> { [weak self] in
            guard let self else { return nil }
            return await self._fetchAndSave(item: item)
        }

        inFlightTasks[item.climbUuid] = task
        defer { inFlightTasks.removeValue(forKey: item.climbUuid) }
        return await task.value
    }

    /// Pre-fetches thumbnails for the current item and its immediate
    /// neighbors in the queue (indices currentIndex-1, currentIndex,
    /// currentIndex+1).
    func preFetchAdjacentThumbnails(
        queue: [SharedQueueItem],
        currentIndex: Int
    ) async {
        let indices = [currentIndex - 1, currentIndex, currentIndex + 1]
            .filter { $0 >= 0 && $0 < queue.count }

        await withTaskGroup(of: Void.self) { group in
            for index in indices {
                let item = queue[index]
                group.addTask { [weak self] in
                    _ = await self?.fetchThumbnail(for: item)
                }
            }
        }
    }

    /// Removes the oldest thumbnails when the cache exceeds `maxCachedThumbnails`.
    func evictOldThumbnails() {
        guard let directory = thumbnailsDirectoryURL() else { return }

        guard let files = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: .skipsHiddenFiles
        ) else { return }

        guard files.count > Self.maxCachedThumbnails else { return }

        // Sort oldest first by modification date.
        let sorted = files.sorted { lhs, rhs in
            let lhsDate = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            let rhsDate = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            return lhsDate < rhsDate
        }

        let countToRemove = sorted.count - Self.maxCachedThumbnails
        for file in sorted.prefix(countToRemove) {
            try? fileManager.removeItem(at: file)
        }
    }

    // MARK: - Internal Helpers

    /// Returns the file URL where a thumbnail for the given climb UUID
    /// would be stored, or `nil` if the shared container is unavailable.
    func cachedFileURL(for climbUuid: String) -> URL? {
        guard let directory = thumbnailsDirectoryURL() else { return nil }
        return directory.appendingPathComponent("\(climbUuid).webp")
    }

    /// Returns the thumbnails directory URL inside the shared container,
    /// creating the directory if it does not exist.
    func thumbnailsDirectoryURL() -> URL? {
        guard let container = sharedContainerUrl else { return nil }
        let directory = container.appendingPathComponent(Self.thumbnailsDirectory)

        if !fileManager.fileExists(atPath: directory.path) {
            try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        }

        return directory
    }

    // MARK: - Private

    private func _fetchAndSave(item: SharedQueueItem) async -> URL? {
        guard let remoteURL = buildThumbnailURL(for: item) else { return nil }
        guard let fileURL = cachedFileURL(for: item.climbUuid) else { return nil }

        do {
            let (data, response) = try await urlSession.data(from: remoteURL)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode)
            else {
                return nil
            }

            // Composite the holds overlay over the bundled board background(s)
            // when they're staged; otherwise persist the raw overlay (the
            // graceful holds-only fallback for an unbundled board).
            let imageData = compositeWithBoardBackground(overlayData: data) ?? data
            try imageData.write(to: fileURL, options: .atomic)

            // Evict after writing so we stay within the cache limit.
            // Note: called within the actor, so file I/O runs on the actor's
            // serial executor. The cache is small (maxCachedThumbnails=10),
            // keeping this synchronous to avoid unnecessary suspension points.
            evictOldThumbnails()

            return fileURL
        } catch {
            // Network or I/O error -- return nil gracefully.
            return nil
        }
    }

    // MARK: - Background Compositing

    /// Bundled board-background webp file paths staged by `startSession`
    /// (`SharedConstants.boardBackgroundPathsKey`). Empty when no bundled
    /// background resolved for the active board.
    private func stagedBackgroundPaths() -> [String] {
        sharedDefaults?.stringArray(forKey: SharedConstants.boardBackgroundPathsKey) ?? []
    }

    /// Draws the holds overlay on top of the staged board-background layer(s),
    /// returning encoded PNG data. Returns `nil` when there's no usable
    /// background (so the caller keeps the raw overlay) — never throws.
    ///
    /// Both background and overlay fill the same frame at the overlay's pixel
    /// size: the server renders the overlay in the board's coordinate space and
    /// each bundled background is that same board image, so an identical fill
    /// rect keeps the climb circles aligned over the holds. `scale = 1` keeps
    /// the canvas at the overlay's native pixel size (no 2x/3x upscaling); a
    /// non-opaque context preserves transparency for boards whose layers don't
    /// fully cover the frame.
    private func compositeWithBoardBackground(overlayData: Data) -> Data? {
        let paths = stagedBackgroundPaths()
        guard !paths.isEmpty, let overlay = UIImage(data: overlayData) else { return nil }

        let backgroundLayers = paths.compactMap { UIImage(contentsOfFile: $0) }
        guard !backgroundLayers.isEmpty else { return nil }

        let size = overlay.size
        guard size.width > 0, size.height > 0 else { return nil }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let composed = renderer.image { _ in
            let rect = CGRect(origin: .zero, size: size)
            for layer in backgroundLayers {
                layer.draw(in: rect)
            }
            overlay.draw(in: rect)
        }
        return composed.pngData()
    }
}
