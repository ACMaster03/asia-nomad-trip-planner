import AppKit
import CoreGraphics

// Composes the 1024 iOS app icons from the brand mark, ring spanning 74% of the width
// (the web's maskable icon uses 61% because Android crops it; iOS does not).
// Run for each variant, from the repo root:
//   swift tools/ios-app-icon.swift product/public/brand/livhold-mark.png \
//     ios/Livhold/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png light
//   icon.swift <mark.png> <out.png> light   → paper background
//   icon.swift <mark.png> <out.png> dark    → transparent background (iOS draws the dark backdrop)
//   icon.swift <mark.png> <out.png> tinted  → greyscale on transparent (iOS applies the tint)
let args = CommandLine.arguments
let mode = args[3]
let src = NSImage(contentsOfFile: args[1])!
var rect = CGRect(origin: .zero, size: src.size)
let cg = src.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
let w = cg.width, h = cg.height

let ctx0 = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                     space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx0.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
let px = ctx0.data!.bindMemory(to: UInt8.self, capacity: w * h * 4)
var minX = w, minY = h, maxX = 0, maxY = 0
for y in 0..<h { for x in 0..<w where px[(y * w + x) * 4 + 3] > 16 {
    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
} }
let bw = CGFloat(maxX - minX + 1), bh = CGFloat(maxY - minY + 1)

let S = 1024
let gray = mode == "tinted"
let space = gray ? CGColorSpaceCreateDeviceGray() : CGColorSpaceCreateDeviceRGB()
let info = mode == "light" ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
let out = CGContext(data: nil, width: S, height: S, bitsPerComponent: 8, bytesPerRow: gray ? S * 2 : S * 4,
                    space: space, bitmapInfo: gray ? CGImageAlphaInfo.premultipliedLast.rawValue : info)!
if mode == "light" {
    out.setFillColor(CGColor(red: 0xf5 / 255, green: 0xf2 / 255, blue: 0xea / 255, alpha: 1))
    out.fill(CGRect(x: 0, y: 0, width: S, height: S))
}
let scale = CGFloat(S) * 0.74 / max(bw, bh)
let dw = CGFloat(w) * scale, dh = CGFloat(h) * scale
let cx = (CGFloat(minX) + bw / 2) * scale, cy = (CGFloat(h - 1 - maxY) + bh / 2) * scale
out.interpolationQuality = .high
out.draw(cg, in: CGRect(x: CGFloat(S) / 2 - cx, y: CGFloat(S) / 2 - cy, width: dw, height: dh))
let rep = NSBitmapImageRep(cgImage: out.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("ok \(mode)")
