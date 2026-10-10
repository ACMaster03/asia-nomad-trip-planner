import CoreGraphics
import SwiftUI
import simd

/// Where the globe looks: the point at its centre and how close. `k` = 1 fits the
/// globe to the width of the view; the mock's Journey view is about 2.2, a city 2.7.
/// `cy` is where the globe's centre sits on screen, as a share of the height: it is
/// part of the camera so the globe can glide between Trip's header and full screen.
struct GlobeCamera: Equatable, Sendable {
    var lon: Double
    var lat: Double
    var k: Double
    var cy: Double = 0.42

    static let minK = 0.7
    static let maxK = 9.0

    var center: SIMD3<Float> { GlobeData.unit(lon: lon, lat: lat) }

    /// A camera looking straight at `v`.
    init(looking v: SIMD3<Float>, k: Double, cy: Double = 0.42) {
        let n = simd_normalize(v)
        lon = Double(atan2(n.y, n.x)) * 180 / .pi
        lat = Double(asin(max(-1, min(1, n.z)))) * 180 / .pi
        self.k = k
        self.cy = cy
    }

    init(lon: Double, lat: Double, k: Double, cy: Double = 0.42) {
        self.lon = lon
        self.lat = lat
        self.k = k
        self.cy = cy
    }

    /// Part of the way from `a` to `b`, along the shorter way round.
    static func mix(_ a: GlobeCamera, _ b: GlobeCamera, _ t: Double) -> GlobeCamera {
        var dl = b.lon - a.lon
        while dl > 180 { dl -= 360 }
        while dl < -180 { dl += 360 }
        return GlobeCamera(lon: a.lon + dl * t, lat: a.lat + (b.lat - a.lat) * t, k: a.k + (b.k - a.k) * t, cy: a.cy + (b.cy - a.cy) * t)
    }
}

/// The orthographic projection for one frame. North is always up: the camera never
/// rolls, so the meridian through the centre is vertical, as in the mock (d3's
/// `rotate([λ, φ, 0])`).
struct GlobeProjector {
    let e: SIMD3<Float>, n: SIMD3<Float>, f: SIMD3<Float>
    let cx: CGFloat, cy: CGFloat, r: CGFloat
    /// How far from the centre of view (in radians) anything can still be on screen.
    let reach: Float

    /// The globe's centre sits at `camera.cy` of the height: above the middle, for the
    /// card over the bottom of the screen, or high up in Trip's header.
    init(camera: GlobeCamera, size: CGSize) {
        let l = camera.lon * .pi / 180, p = camera.lat * .pi / 180
        f = SIMD3(Float(cos(p) * cos(l)), Float(cos(p) * sin(l)), Float(sin(p)))
        e = SIMD3(Float(-sin(l)), Float(cos(l)), 0)
        n = SIMD3(Float(-sin(p) * cos(l)), Float(-sin(p) * sin(l)), Float(cos(p)))
        r = size.width / 2 * camera.k
        let x0 = size.width / 2, y0 = size.height * CGFloat(camera.cy)
        cx = x0
        cy = y0
        let far = [CGPoint(x: 0, y: 0), CGPoint(x: size.width, y: 0), CGPoint(x: 0, y: size.height), CGPoint(x: size.width, y: size.height)]
            .map { hypot($0.x - x0, $0.y - y0) }.max() ?? 0
        reach = far >= r ? .pi / 2 : asin(Float(far / r))
    }

    /// x right, y up, z toward the viewer (> 0 is the near side).
    @inline(__always) func view(_ v: SIMD3<Float>) -> SIMD3<Float> {
        SIMD3(simd_dot(v, e), simd_dot(v, n), simd_dot(v, f))
    }

    @inline(__always) func screen(_ q: SIMD3<Float>) -> CGPoint {
        CGPoint(x: cx + r * CGFloat(q.x), y: cy - r * CGFloat(q.y))
    }

    /// The screen point of `v`, or nil on the far side.
    func project(_ v: SIMD3<Float>) -> CGPoint? {
        let q = view(v)
        return q.z > 0 ? screen(q) : nil
    }

    /// How far `v` is in front of the horizon, in radians (the mock's `facing`).
    func facing(_ v: SIMD3<Float>) -> Float { asin(max(-1, min(1, simd_dot(v, f)))) }

    /// The point on the rim at angle `a` (radians, counter-clockwise from east).
    @inline(__always) func rim(_ a: CGFloat) -> CGPoint {
        CGPoint(x: cx + r * cos(a), y: cy - r * sin(a))
    }

    func mightShow(_ s: GlobeData.Shape) -> Bool {
        acos(max(-1, min(1, simd_dot(s.center, f)))) - s.radius < reach
    }

    // MARK: - Paths

    /// Filled shapes (countries). The part of a ring on the far side is laid along the
    /// rim, so what shows is exactly the near side of the shape, cut at the horizon.
    /// `minStep` drops points closer than that to the last one: a country seen from
    /// far away needs a few dozen points, not thousands.
    func fill(_ shapes: [GlobeData.Shape], minStep: CGFloat = 0.6) -> Path {
        var path = Path()
        for s in shapes where mightShow(s) { addRing(s.points, to: &path, minStep: minStep) }
        return path
    }

    /// Lines (coast, borders, a route): only the parts on the near side.
    func stroke(_ shapes: [GlobeData.Shape], minStep: CGFloat = 0.6) -> Path {
        var path = Path()
        for s in shapes where mightShow(s) { addLine(s.points, to: &path, minStep: minStep) }
        return path
    }

    func addRing(_ pts: [SIMD3<Float>], to path: inout Path, minStep: CGFloat) {
        guard pts.count > 2 else { return }
        var sub = Path()
        var started = false, anyVisible = false
        var last = CGPoint.zero
        var lastRim: CGFloat?

        func emit(_ p: CGPoint, force: Bool) {
            if !started {
                sub.move(to: p); started = true; last = p
            } else if force || abs(p.x - last.x) + abs(p.y - last.y) >= minStep {
                sub.addLine(to: p); last = p
            }
        }
        // Along the rim, in short steps, so a long stretch on the far side becomes an
        // arc and never a chord across the face of the globe.
        func emitRim(_ a: CGFloat, force: Bool) {
            if let la = lastRim {
                var d = a - la
                while d > .pi { d -= 2 * .pi }
                while d < -.pi { d += 2 * .pi }
                let steps = Int(abs(d) / 0.08)
                if steps > 1 {
                    for s in 1..<steps { emit(rim(la + d * CGFloat(s) / CGFloat(steps)), force: true) }
                }
            }
            emit(rim(a), force: force)
            lastRim = a
        }

        var prev = view(pts[0])
        var prevVisible = prev.z > 0
        for i in 0..<pts.count {
            let q = i == 0 ? prev : view(pts[i])
            let visible = q.z > 0
            if i > 0 && visible != prevVisible {
                let t = prev.z / (prev.z - q.z)
                let c = prev + (q - prev) * t
                emitRim(CGFloat(atan2(c.y, c.x)), force: true)
                if visible { lastRim = nil }
            }
            if visible {
                emit(screen(q), force: false)
                anyVisible = true
            } else {
                emitRim(CGFloat(atan2(q.y, q.x)), force: false)
            }
            prev = q
            prevVisible = visible
        }
        if anyVisible {
            sub.closeSubpath()
            path.addPath(sub)
        }
    }

    func addLine(_ pts: [SIMD3<Float>], to path: inout Path, minStep: CGFloat) {
        guard pts.count > 1 else { return }
        var drawing = false
        var last = CGPoint.zero
        var prev = view(pts[0])
        for i in 0..<pts.count {
            let q = i == 0 ? prev : view(pts[i])
            let visible = q.z > 0
            if i > 0 && visible != (prev.z > 0) {
                let t = prev.z / (prev.z - q.z)
                let c = prev + (q - prev) * t
                let edge = rim(CGFloat(atan2(c.y, c.x)))
                if visible { path.move(to: edge); drawing = true; last = edge } else if drawing { path.addLine(to: edge); drawing = false }
            }
            if visible {
                let p = screen(q)
                if !drawing {
                    path.move(to: p); drawing = true; last = p
                } else if abs(p.x - last.x) + abs(p.y - last.y) >= minStep || i == pts.count - 1 {
                    path.addLine(to: p); last = p
                }
            }
            prev = q
        }
    }

    /// The great circle from `a` to `b`, the first `upTo` of it (0…1), near side only.
    func arc(from a: SIMD3<Float>, to b: SIMD3<Float>, upTo: Double = 1, steps: Int = 64) -> Path {
        var path = Path()
        addLine(Globe.arcPoints(a, b, upTo: upTo, steps: steps), to: &path, minStep: 0)
        return path
    }
}

/// Small spherical helpers shared by the drawing and the replay.
enum Globe {
    /// Points along the great circle from `a` to `b`, for t in 0…upTo.
    static func arcPoints(_ a: SIMD3<Float>, _ b: SIMD3<Float>, upTo: Double = 1, steps: Int = 64) -> [SIMD3<Float>] {
        let n = max(1, Int(Double(steps) * max(0.05, upTo)))
        return (0...n).map { slerp(a, b, upTo * Double($0) / Double(n)) }
    }

    static func slerp(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ t: Double) -> SIMD3<Float> {
        let d = max(-1, min(1, simd_dot(a, b)))
        let th = acos(d)
        if th < 1e-5 { return a }
        let s = sin(th)
        let wa = sin((1 - Float(t)) * th) / s, wb = sin(Float(t) * th) / s
        return simd_normalize(a * wa + b * wb)
    }

    static func angle(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Double {
        Double(acos(max(-1, min(1, simd_dot(a, b)))))
    }

    /// Where the sun is overhead right now, in degrees (the mock's `subsolar`).
    static func subsolar(_ date: Date) -> (lon: Double, lat: Double) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let day = Double(cal.ordinality(of: .day, in: .year, for: date) ?? 1)
        let c = cal.dateComponents([.hour, .minute], from: date)
        let hours = Double(c.hour ?? 12) + Double(c.minute ?? 0) / 60
        let decl = -23.44 * cos(2 * .pi / 365 * (day + 10))
        return (-15 * (hours - 12), decl)
    }
}
