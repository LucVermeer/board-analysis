import Foundation
import XCTest

/// Verifies `BoardRendererErrorClassification` — the gate for #4107's bounded
/// whole-pipeline re-render — against what Foundation *actually* throws, not
/// just hand-built errors. The headline test performs the real failing
/// operation the production path hits: `Data.write(to:options:.atomic)` into a
/// directory that existed and was then deleted, exactly how iOS reclaiming
/// `Library/Caches` mid-session surfaces in `BoardRendererModule`.
@available(iOS 17.0, *)
final class BoardRendererErrorClassificationTests: XCTestCase {
  /// Creates a real scratch directory under the test runner's temp dir and
  /// registers its cleanup. Each test gets a unique path so parallel or
  /// re-run executions can't collide.
  private func makeScratchDirectory() throws -> URL {
    let scratchDir = FileManager.default.temporaryDirectory
      .appendingPathComponent("board-renderer-classification-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: scratchDir, withIntermediateDirectories: true)
    addTeardownBlock {
      try? FileManager.default.removeItem(at: scratchDir)
    }
    return scratchDir
  }

  /// Nests `error` under `layers` unrelated Cocoa wrappers via
  /// `NSUnderlyingErrorKey`, mimicking how Foundation chains causes.
  private func wrapped(_ error: NSError, inLayers layers: Int) -> NSError {
    var current = error
    for _ in 0..<layers {
      current = NSError(
        domain: NSCocoaErrorDomain,
        code: NSFileWriteUnknownError,
        userInfo: [NSUnderlyingErrorKey: current]
      )
    }
    return current
  }

  // MARK: - Functional: the real production failure shape

  func testAtomicWriteIntoDeletedDirectoryClassifiesAsVanished() throws {
    let scratchDir = try makeScratchDirectory()
    let doomedDir = scratchDir.appendingPathComponent("board-thumbnails", isDirectory: true)
    try FileManager.default.createDirectory(at: doomedDir, withIntermediateDirectories: true)
    // The reclaim: the directory existed when the "render" started and is gone
    // by the time the write lands — the exact #4107 sequence.
    try FileManager.default.removeItem(at: doomedDir)

    let outputUrl = doomedDir.appendingPathComponent("climb.png")
    do {
      try Data([0x01]).write(to: outputUrl, options: .atomic)
      XCTFail("Writing into a deleted directory should throw")
    } catch {
      XCTAssertTrue(
        BoardRendererErrorClassification.isFileVanishedError(error),
        "A real atomic write into a vanished directory must classify as retryable, got: \(error)"
      )
    }
  }

  func testAtomicWriteThroughRegularFileClassifiesAsNotVanished() throws {
    // A genuinely different real failure: the parent path exists but is a
    // regular file, not a directory (POSIX ENOTDIR, not ENOENT). Nothing
    // vanished, so a re-render can't fix it and it must not retry.
    let scratchDir = try makeScratchDirectory()
    let blockingFile = scratchDir.appendingPathComponent("blocker")
    try Data([0x02]).write(to: blockingFile)

    let outputUrl = blockingFile.appendingPathComponent("climb.png")
    do {
      try Data([0x01]).write(to: outputUrl, options: .atomic)
      XCTFail("Writing through a regular file should throw")
    } catch {
      XCTAssertFalse(
        BoardRendererErrorClassification.isFileVanishedError(error),
        "A not-a-directory failure is not a vanished cache entry, got: \(error)"
      )
    }
  }

  // MARK: - Classification table

  func testTopLevelNoSuchFileShapesClassifyTrue() {
    let cocoaNoSuchFile = NSError(domain: NSCocoaErrorDomain, code: NSFileNoSuchFileError)
    let cocoaReadNoSuchFile = NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError)
    let posixNoSuchFile = NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT))

    XCTAssertTrue(BoardRendererErrorClassification.isFileVanishedError(cocoaNoSuchFile))
    XCTAssertTrue(BoardRendererErrorClassification.isFileVanishedError(cocoaReadNoSuchFile))
    XCTAssertTrue(BoardRendererErrorClassification.isFileVanishedError(posixNoSuchFile))
  }

  func testUnwrapsPosixEnoentBuriedUnderCocoaWrappers() {
    // Foundation write failures can surface as a Cocoa-domain wrapper (e.g.
    // NSFileWriteUnknownError) carrying the real POSIX ENOENT in
    // userInfo[NSUnderlyingErrorKey]; the classifier must find it there.
    let buriedEnoent = wrapped(
      NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT)), inLayers: 2
    )
    XCTAssertTrue(BoardRendererErrorClassification.isFileVanishedError(buriedEnoent))
  }

  func testUnderlyingUnwrapIsBounded() {
    // ENOENT nested deeper than the classifier's unwrap bound stays
    // unclassified — the bound guarantees termination on pathological chains.
    let tooDeepEnoent = wrapped(
      NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT)), inLayers: 4
    )
    XCTAssertFalse(BoardRendererErrorClassification.isFileVanishedError(tooDeepEnoent))
  }

  func testUnrelatedErrorsClassifyFalse() {
    // The module's own render/encode failures (Rust render, CGImage wrap, PNG
    // encoding) share the "BoardRenderer" domain; retrying those would waste
    // a full render on a deterministic bug.
    let renderFailure = NSError(
      domain: "BoardRenderer", code: -3,
      userInfo: [NSLocalizedDescriptionKey: "Failed to wrap RGBA buffer as CGImage"]
    )
    let outOfSpace = NSError(domain: NSCocoaErrorDomain, code: NSFileWriteOutOfSpaceError)
    let permissionDenied = NSError(domain: NSPOSIXErrorDomain, code: Int(EACCES))
    let wrappedOutOfSpace = wrapped(
      NSError(domain: NSPOSIXErrorDomain, code: Int(ENOSPC)), inLayers: 1
    )

    XCTAssertFalse(BoardRendererErrorClassification.isFileVanishedError(renderFailure))
    XCTAssertFalse(BoardRendererErrorClassification.isFileVanishedError(outOfSpace))
    XCTAssertFalse(BoardRendererErrorClassification.isFileVanishedError(permissionDenied))
    XCTAssertFalse(BoardRendererErrorClassification.isFileVanishedError(wrappedOutOfSpace))
  }
}
