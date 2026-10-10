import Foundation
import Observation
import simd
import UIKit

/// One journey, as the globe draws it (#166). The same shape for your own journey
/// and for one you follow: the caller turns a trip (or `followed_trip_summary`) into
/// this, with each stop's kind already decided against today.
struct GlobeJourney: Equatable, Sendable {
    enum Kind: Sendable { case home, past, now, next }
    /// What the follower projection says (migration 45): the four the app has an icon
    /// for, and everything else.
    enum Mode: String, Sendable { case flight, train, bus, ferry, other }

    struct Stop: Equatable, Sendable {
        let name: String
        let lon: Double
        let lat: Double
        let kind: Kind
        /// The trip's segment, for your own journey: a tap on the stop finds its card.
        var id: String? = nil
        var at: SIMD3<Float> { GlobeData.unit(lon: lon, lat: lat) }
    }

    struct Leg: Equatable, Sendable {
        let from: Int
        let to: Int
        let mode: Mode
        /// Not travelled yet: drawn a little lighter, a flight dashed.
        let upcoming: Bool
    }

    var stops: [Stop]
    var legs: [Leg]
    /// Natural Earth names in capitals ("VIETNAM"): filled darker, their names first.
    var countries: Set<String>
    /// Your home country: its name goes first too, its land stays plain.
    var homeCountry: String?
}

/// The globe's state: where it looks, and what is moving. The drawing is a pure
/// function of `frame(at:)`, so the canvases can redraw at any moment without
/// changing state while SwiftUI is drawing.
@MainActor
@Observable
final class GlobeModel {
    var journey: GlobeJourney
    var camera: GlobeCamera
    /// Night shading on (the Sun chip).
    var sunOn = true
    var hungarian: Bool
    var reduceMotion = false

    private(set) var animation: Animation?
    var isAnimating: Bool { animation != nil }

    /// The zoom a replay holds at each city.
    nonisolated static let cityK = 2.7

    init(journey: GlobeJourney, hungarian: Bool = false) {
        self.journey = journey
        self.hungarian = hungarian
        camera = Self.journeyCamera(journey)
    }

    // MARK: - Views

    /// The whole journey, home left out, centred and as close as it fits.
    static func journeyCamera(_ j: GlobeJourney, cy: Double = 0.42) -> GlobeCamera {
        let pts = j.stops.filter { $0.kind != .home }.map(\.at)
        guard !pts.isEmpty else { return worldCamera(j, cy: cy) }
        let c = simd_normalize(pts.reduce(SIMD3<Float>(repeating: 0), +))
        let spread = pts.map { Globe.angle($0, c) }.max() ?? 0
        let k = min(2.2, max(0.8, 0.30 / sin(max(0.02, min(1.4, spread)))))
        return GlobeCamera(looking: c, k: k, cy: cy)
    }

    /// Far out, with home in the picture.
    static func worldCamera(_ j: GlobeJourney, cy: Double = 0.42) -> GlobeCamera {
        let pts = j.stops.map(\.at)
        guard !pts.isEmpty else { return GlobeCamera(lon: 62, lat: 26, k: 0.9, cy: cy) }
        var c = pts.reduce(SIMD3<Float>(repeating: 0), +)
        if simd_length(c) < 1e-3 { c = pts[0] }
        var cam = GlobeCamera(looking: c, k: 0.9, cy: cy)
        cam.lat = max(-30, min(35, cam.lat))
        return cam
    }

    /// The journey, with the globe's centre at `cy` (or where it is now).
    func goJourney(cy: Double? = nil, duration: TimeInterval = 0.9) {
        fly(to: Self.journeyCamera(journey, cy: cy ?? frame(at: .now).camera.cy), duration: duration)
    }

    func goWorld() { fly(to: Self.worldCamera(journey, cy: frame(at: .now).camera.cy)) }

    /// A new journey (the trip changed): the camera stays where it is unless asked.
    func update(_ j: GlobeJourney, reframe: Bool = false) {
        guard j != journey else { return }
        journey = j
        if reframe, animation == nil { camera = Self.journeyCamera(j, cy: camera.cy) }
    }

    func fly(to target: GlobeCamera, duration: TimeInterval = 0.9) {
        let from = frame(at: .now).camera
        guard !reduceMotion else { stop(); camera = target; return }
        start(Animation(kind: .fly(from: from, to: target), start: .now, duration: duration, end: target))
    }

    /// A finger on the globe ends whatever was moving, where it is.
    func interrupt() {
        guard animation != nil else { return }
        camera = frame(at: .now).camera
        stop()
    }

    /// Ends a replay at once, where it would have ended (the screen went away).
    func finish() {
        guard let a = animation else { return }
        camera = a.end
        stop()
    }

    // MARK: - Replays

    /// When a replay ends, and when its last move (back to the whole journey) begins:
    /// Trip's timeline rises during that move.
    struct Playback {
        var duration: TimeInterval = 0
        var settleStart: TimeInterval = 0
    }

    /// The whole journey, leg by leg (after onboarding, and on Replay). It flies at the
    /// globe's centre now, and settles with it at `settleCy` (Trip's header), if given.
    @discardableResult
    func replayJourney(settleCy: Double? = nil) -> Playback {
        let cy = frame(at: .now).camera.cy
        let settle = Self.journeyCamera(journey, cy: settleCy ?? cy)
        guard !journey.legs.isEmpty else { fly(to: settle); return Playback(duration: 0.9, settleStart: 0) }
        guard !reduceMotion else { stop(); camera = settle; return Playback() }
        let script = Script(journey: journey, legs: Array(journey.legs.indices), settleTo: settle, cy: cy)
        start(Animation(kind: .replay(script), start: .now, duration: script.duration, end: settle), haptics: script.landings)
        return Playback(duration: script.duration, settleStart: script.settleStart)
    }

    /// One leg, the one just arrived by (the Arrived tap, then each follower once).
    /// With Reduce Motion, only the stamp on the stop.
    @discardableResult
    func replayArrival(leg i: Int, settleCy: Double? = nil) -> Playback {
        guard journey.legs.indices.contains(i) else { return Playback() }
        let cy = frame(at: .now).camera.cy
        let settle = Self.journeyCamera(journey, cy: settleCy ?? cy)
        let script = Script(journey: journey, legs: [i], settleTo: settle, stampOnly: reduceMotion, cy: cy)
        let end = reduceMotion ? camera : settle
        start(Animation(kind: .replay(script), start: .now, duration: script.duration, end: end), haptics: script.landings)
        return Playback(duration: script.duration, settleStart: script.settleStart)
    }

    // MARK: - Frames

    /// Everything the canvases need for the moment `t`.
    func frame(at t: Date) -> Frame {
        guard let a = animation else { return Frame(camera: camera) }
        let e = t.timeIntervalSince(a.start)
        switch a.kind {
        case let .fly(from, to):
            let p = Ease.cubicInOut(min(1, max(0, e / a.duration)))
            return Frame(camera: GlobeCamera.mix(from, to, p))
        case let .replay(script):
            return script.frame(at: e, journey: journey, fallback: camera)
        }
    }

    struct Frame {
        var camera: GlobeCamera
        /// Per leg, how much is drawn (0…1). Nil: every leg in full.
        var legProgress: [Double]?
        /// Stops not stamped yet are hidden. Nil: every stop shows.
        var hiddenStops: Set<Int> = []
        /// Seconds since each stop was stamped, while its pop and ring still play.
        var stampAge: [Int: Double] = [:]
        var vehicle: (leg: Int, at: SIMD3<Float>, next: SIMD3<Float>)?
        var replaying: Bool { legProgress != nil || !stampAge.isEmpty }
    }

    // MARK: - Machinery

    struct Animation {
        enum Kind { case fly(from: GlobeCamera, to: GlobeCamera), replay(Script) }
        let kind: Kind
        let start: Date
        let duration: TimeInterval
        let end: GlobeCamera
    }

    private var endTask: Task<Void, Never>?
    private var hapticTask: Task<Void, Never>?

    private func start(_ a: Animation, haptics: [Script.Landing] = []) {
        animation = a
        endTask?.cancel()
        hapticTask?.cancel()
        endTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(a.duration))
            guard !Task.isCancelled, let self else { return }
            self.camera = a.end
            self.animation = nil
        }
        guard !haptics.isEmpty else { return }
        hapticTask = Task {
            // A light tap as each stop is stamped, firmer on the last; a soft one on a stop
            // not reached yet (the replay also flies the plan ahead). iOS skips them when
            // the phone's System Haptics are off.
            let light = UIImpactFeedbackGenerator(style: .light)
            let soft = UIImpactFeedbackGenerator(style: .soft)
            let medium = UIImpactFeedbackGenerator(style: .medium)
            light.prepare()
            var t: TimeInterval = 0
            for (n, l) in haptics.enumerated() {
                try? await Task.sleep(for: .seconds(max(0, l.at - t)))
                guard !Task.isCancelled else { return }
                t = l.at
                if l.ahead { soft.impactOccurred(intensity: 0.6) }
                else if n == haptics.count - 1 { medium.impactOccurred() }
                else { light.impactOccurred() }
            }
        }
    }

    private func stop() {
        endTask?.cancel()
        hapticTask?.cancel()
        animation = nil
    }
}

/// The mock's flight script: hold on a city, fly the leg with the camera following
/// (pulling back on long legs), stamp the stop, next leg, then settle on the journey.
struct Script {
    enum Segment {
        case hold(stop: Int, duration: Double)
        case leg(Int, theta: Double, duration: Double)
        case settle(duration: Double)
    }

    /// A stop being stamped: seconds into the replay, and whether it is still ahead.
    struct Landing { let at: TimeInterval; let ahead: Bool }

    let segments: [Segment]
    let legs: [Int]
    let settleTo: GlobeCamera
    let stampOnly: Bool
    /// The globe's centre on screen while flying.
    let cy: Double
    let duration: TimeInterval
    let settleStart: TimeInterval
    let landings: [Landing]
    /// Stops the replay reveals (hidden until stamped).
    let revealed: Set<Int>
    let firstStop: Int

    init(journey j: GlobeJourney, legs: [Int], settleTo: GlobeCamera, stampOnly: Bool = false, cy: Double = 0.42) {
        self.legs = legs
        self.settleTo = settleTo
        self.stampOnly = stampOnly
        self.cy = cy
        var segs: [Segment] = []
        if stampOnly {
            segs = [.settle(duration: 0.9)]
            firstStop = legs.first.map { j.legs[$0].to } ?? 0
            revealed = []
        } else {
            let first = legs.first.map { j.legs[$0].from } ?? 0
            firstStop = first
            segs.append(.hold(stop: first, duration: legs.count > 1 ? 0.9 : 0.6))
            for i in legs {
                let leg = j.legs[i]
                let th = Globe.angle(j.stops[leg.from].at, j.stops[leg.to].at)
                segs.append(.leg(i, theta: th, duration: 1.1 + 2.6 * sqrt(th / .pi)))
                segs.append(.hold(stop: leg.to, duration: 0.65))
            }
            // a little longer when it also carries the globe back up into Trip's header
            segs.append(.settle(duration: abs(settleTo.cy - cy) > 0.01 ? 1.4 : 1.2))
            // the whole journey reveals every stop after the first; one arrival only its stop
            revealed = Set(legs.map { j.legs[$0].to }).subtracting([first])
        }
        segments = segs
        var t: TimeInterval = 0, settleAt: TimeInterval = 0
        var lands: [Landing] = stampOnly ? legs.prefix(1).map { Landing(at: 0, ahead: j.legs[$0].upcoming) } : []
        for s in segs {
            switch s {
            case let .hold(_, d): t += d
            case let .leg(i, _, d): t += d; lands.append(Landing(at: t, ahead: j.legs[i].upcoming))
            case let .settle(d): settleAt = t; t += d
            }
        }
        duration = t
        settleStart = settleAt
        landings = lands
    }

    func frame(at e: Double, journey j: GlobeJourney, fallback: GlobeCamera) -> GlobeModel.Frame {
        var f = GlobeModel.Frame(camera: fallback)
        var progress = j.legs.indices.map { legs.contains($0) ? 0.0 : 1.0 }
        var hidden = revealed
        var ages: [Int: Double] = [:]
        if stampOnly, let i = legs.first {
            ages[j.legs[i].to] = e
            f.stampAge = ages
            return f
        }
        var t = e
        var cam = GlobeCamera(looking: j.stops[firstStop].at, k: GlobeModel.cityK, cy: cy)
        for s in segments {
            switch s {
            case let .hold(stop, d):
                cam = GlobeCamera(looking: j.stops[stop].at, k: GlobeModel.cityK, cy: cy)
                if t <= d { f.camera = cam; break }
                t -= d
                continue
            case let .leg(i, th, d):
                let leg = j.legs[i]
                if t > d {
                    progress[i] = 1
                    hidden.remove(leg.to)
                    ages[leg.to] = t - d
                    t -= d
                    cam = GlobeCamera(looking: j.stops[leg.to].at, k: GlobeModel.cityK, cy: cy)
                    continue
                }
                let u = t / d, pe = Ease.cubicInOut(u)
                let a = j.stops[leg.from].at, b = j.stops[leg.to].at
                let pos = Globe.slerp(a, b, pe)
                let kMid = min(GlobeModel.cityK, 0.36 / sin(max(0.01, th / 2)))
                let k = u < 0.35 ? GlobeModel.cityK + (kMid - GlobeModel.cityK) * Ease.cubicInOut(u / 0.35)
                    : u > 0.65 ? kMid + (GlobeModel.cityK - kMid) * Ease.cubicInOut((u - 0.65) / 0.35) : kMid
                progress[i] = pe
                f.camera = GlobeCamera(looking: pos, k: k, cy: cy)
                f.vehicle = (i, pos, Globe.slerp(a, b, min(1, pe + 0.004)))
                break
            case let .settle(d):
                if t <= d { f.camera = GlobeCamera.mix(cam, settleTo, Ease.cubicInOut(t / d)); break }
                f.camera = settleTo
                t -= d
                continue
            }
            break
        }
        f.legProgress = progress
        f.hiddenStops = hidden
        f.stampAge = ages.filter { $0.value < 0.9 }
        return f
    }
}

enum Ease {
    static func cubicInOut(_ t: Double) -> Double {
        t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
    }

    static func backOut(_ t: Double) -> Double {
        let c1 = 1.70158, c3 = c1 + 1
        return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)
    }
}
