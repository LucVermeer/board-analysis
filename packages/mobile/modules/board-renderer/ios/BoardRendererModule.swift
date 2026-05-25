import ExpoModulesCore
import UIKit

public class BoardRendererModule: Module {
  private lazy var cacheDir: URL = {
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("board-thumbnails", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    } catch {
      NSLog("[BoardRenderer] Failed to create cache dir at \(dir.path): \(error)")
    }
    return dir
  }()

  public func definition() -> ModuleDefinition {
    Name("BoardRenderer")

    AsyncFunction("renderComposite") {
      (configJson: String, backgroundPaths: [String], cacheKey: String) -> String in
      let outputUrl = self.cacheDir.appendingPathComponent("\(cacheKey).png")

      if FileManager.default.fileExists(atPath: outputUrl.path) {
        return outputUrl.absoluteString
      }

      let jsonData = Array(configJson.utf8)
      var outData: UnsafeMutablePointer<UInt8>? = nil
      var outLen: UInt32 = 0
      var outWidth: UInt32 = 0
      var outHeight: UInt32 = 0

      let result = jsonData.withUnsafeBufferPointer { buffer in
        guard let baseAddress = buffer.baseAddress else { return Int32(-1) }
        return board_renderer_render(
          baseAddress,
          UInt32(buffer.count),
          &outData,
          &outLen,
          &outWidth,
          &outHeight
        )
      }

      guard result == 0, let pixelData = outData else {
        throw NSError(
          domain: "BoardRenderer", code: Int(result),
          userInfo: [
            NSLocalizedDescriptionKey: "Rust render failed with code \(result)"
          ])
      }

      defer { board_renderer_free(pixelData, outLen) }

      let width = Int(outWidth)
      let height = Int(outHeight)

      // Create composited image using UIGraphicsImageRenderer for
      // automatic memory management and correct color space handling
      let renderer = UIGraphicsImageRenderer(
        size: CGSize(width: width, height: height),
        format: {
          let format = UIGraphicsImageRendererFormat()
          format.scale = 1.0
          format.opaque = false
          return format
        }()
      )

      let pngData = renderer.pngData { rendererContext in
        let context = rendererContext.cgContext

        // CGContext uses bottom-left origin; flip to top-left for UIKit consistency
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)

        // Draw background images in order
        for bgPath in backgroundPaths {
          if let bgImage = UIImage(contentsOfFile: bgPath)?.cgImage {
            context.draw(bgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
          }
        }

        // Create CGImage from the RGBA overlay pixel data returned by Rust
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        if let overlayContext = CGContext(
          data: UnsafeMutableRawPointer(pixelData),
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: width * 4,
          space: colorSpace,
          bitmapInfo: bitmapInfo.rawValue
        ), let overlayImage = overlayContext.makeImage() {
          context.draw(overlayImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
      }

      try pngData.write(to: outputUrl)
      return outputUrl.absoluteString
    }
  }
}
