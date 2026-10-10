import Foundation
import CoreGraphics
import simd

/// Light from the real sun on the globe (#166), the mock's `sunLight`: the night side
/// darkens, the face toward the sun gets a soft highlight, and the limb a little shade
/// so the globe reads as round. A small image (at most 300 px across) stretched over
/// the disc, made on the CPU only when the globe moves, so the app needs no Metal
/// toolchain to build.
enum GlobeLight {
    /// `sun` is the direction to the sun in view space (x right, y up, z toward you).
    static func image(size n: Int, sun: SIMD3<Float>, ink: (Float, Float, Float),
                      night: Float, highlight: Float, limb: Float) -> CGImage? {
        var px = [UInt8](repeating: 0, count: n * n * 4)
        let fn = Float(n)
        for j in 0..<n {
            let y = 1 - (2 * Float(j) + 1) / fn
            for i in 0..<n {
                let x = (2 * Float(i) + 1) / fn - 1
                let rr = x * x + y * y
                if rr > 1 { continue }
                let z = (1 - rr).squareRoot()
                let dot = x * sun.x + y * sun.y + z * sun.z
                let tw = min(1, max(0, (0.1 - dot) / 0.28))
                let ia = max(night * tw * tw * (3 - 2 * tw), limb * pow(1 - z, 3))
                let wa = dot > 0 ? highlight * pow(dot, 6) : 0
                let a = ia + wa * (1 - ia)
                if a <= 0 { continue }
                // premultiplied: the colour is ink under the shade plus white in the highlight
                let k = (j * n + i) * 4
                px[k] = UInt8(min(255, ink.0 * ia + 255 * wa * (1 - ia)))
                px[k + 1] = UInt8(min(255, ink.1 * ia + 255 * wa * (1 - ia)))
                px[k + 2] = UInt8(min(255, ink.2 * ia + 255 * wa * (1 - ia)))
                px[k + 3] = UInt8(min(255, a * 255))
            }
        }
        guard let provider = CGDataProvider(data: Data(px) as CFData) else { return nil }
        return CGImage(width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: n * 4,
                       space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
