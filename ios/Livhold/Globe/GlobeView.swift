import SwiftUI
import simd

/// The globe for one journey (#166): A+ from the mock rounds. Land in Livhold's sage,
/// light from the real sun, names that follow the zoom, the route in red, and the
/// replay. Drag turns it, pinch zooms.
///
/// It sleeps when nothing moves: the map layers redraw only while the camera changes,
/// and only the route layer keeps a slow clock for the pulse on today's stop.
struct GlobeView: View {
    @Bindable var model: GlobeModel
    /// Where the centre of the globe sits, as a share of the height.
    var centerY: CGFloat = 0.42

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dragFrom: GlobeCamera?
    @State private var pinchFrom: Double?

    var body: some View {
        GeometryReader { geo in
            ZStack {
                TimelineView(.animation(paused: !model.isAnimating)) { tl in
                    GlobeMapLayers(model: model, frame: model.frame(at: tl.date), centerY: centerY)
                }
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion && !model.isAnimating)) { tl in
                    GlobeRouteLayer(model: model, frame: model.frame(at: tl.date), centerY: centerY,
                                    now: tl.date, reduceMotion: reduceMotion)
                }
            }
            .contentShape(Rectangle())
            .gesture(drag(width: geo.size.width).simultaneously(with: pinch))
        }
        .onAppear { model.reduceMotion = reduceMotion }
        .onChange(of: reduceMotion) { _, v in model.reduceMotion = v }
        .accessibilityElement()
        .accessibilityLabel(Text(accessibilitySummary))
    }

    private var accessibilitySummary: String {
        let names = model.journey.stops.filter { $0.kind != .home }.map(\.name)
        return String(localized: "Globe with the route: \(names.joined(separator: ", "))")
    }

    private func drag(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { v in
                if dragFrom == nil { model.interrupt(); dragFrom = model.camera }
                guard let from = dragFrom else { return }
                let r = width / 2 * model.camera.k
                var c = model.camera
                c.lon = from.lon - Double(v.translation.width / r) * 180 / .pi
                c.lat = max(-80, min(80, from.lat + Double(v.translation.height / r) * 180 / .pi))
                model.camera = c
            }
            .onEnded { _ in dragFrom = nil }
    }

    private var pinch: some Gesture {
        MagnifyGesture()
            .onChanged { v in
                if pinchFrom == nil { model.interrupt(); pinchFrom = model.camera.k }
                guard let k0 = pinchFrom else { return }
                model.camera.k = max(GlobeCamera.minK, min(GlobeCamera.maxK, k0 * v.magnification))
            }
            .onEnded { _ in pinchFrom = nil }
    }
}

// MARK: - The map: sea, land, light, names

private struct GlobeMapLayers: View {
    let model: GlobeModel
    let frame: GlobeModel.Frame
    let centerY: CGFloat
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { geo in
            let P = GlobeProjector(camera: frame.camera, size: geo.size, centerY: centerY)
            let sun = P.view(sunPoint)
            ZStack {
                Canvas { ctx, _ in drawMap(ctx, P, sun: sun) }
                Canvas { ctx, _ in drawNames(ctx, P) }
            }
        }
    }

    private var sunPoint: SIMD3<Float> {
        var date = Date.now
        #if DEBUG
        // `-globeUTCHour 14`: the light as at that hour today, to check the night side.
        if let h = UserDefaults.standard.object(forKey: "globeUTCHour") as? String, let hour = Int(h) {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone(identifier: "UTC")!
            date = cal.date(bySettingHour: hour, minute: 0, second: 0, of: date) ?? date
        }
        #endif
        let s = Globe.subsolar(date)
        return GlobeData.unit(lon: s.lon, lat: s.lat)
    }

    private func light(_ P: GlobeProjector, sun: SIMD3<Float>) -> CGImage? {
        let dark = scheme == .dark
        return GlobeLight.image(size: Int(max(32, min(300, (P.r * 0.8).rounded()))), sun: sun,
                                ink: dark ? (0, 0, 0) : (31, 42, 36),
                                night: model.sunOn ? (dark ? 0.5 : 0.34) : 0, highlight: dark ? 0.1 : 0.42, limb: dark ? 0.3 : 0.16)
    }

    private func drawMap(_ ctx: GraphicsContext, _ P: GlobeProjector, sun: SIMD3<Float>) {
        let R = P.r
        // the warm rim, nudged toward the sun
        let g = CGPoint(x: P.cx + CGFloat(sun.x) * R * 0.07, y: P.cy - CGFloat(sun.y) * R * 0.07)
        ctx.fill(Path(ellipseIn: CGRect(x: g.x - R * 1.14, y: g.y - R * 1.14, width: R * 2.28, height: R * 2.28)),
                 with: .radialGradient(Gradient(colors: [Palette.globeGlow, Palette.globeGlow.opacity(0)]),
                                       center: g, startRadius: R * 0.96, endRadius: R * 1.14))
        let disc = Path(ellipseIn: CGRect(x: P.cx - R, y: P.cy - R, width: 2 * R, height: 2 * R))
        ctx.fill(disc, with: .color(Palette.globeOcean))
        guard let data = GlobeData.shared else { return }

        var c = ctx
        c.clip(to: disc)
        let step: CGFloat = 0.7
        c.stroke(P.stroke(data.coast, minStep: step), with: .color(Palette.globeShore),
                 style: StrokeStyle(lineWidth: max(2.5, R / 70), lineCap: .round, lineJoin: .round))
        var land = Path(), mine = Path()
        for country in data.countries {
            let isMine = model.journey.countries.contains(country.name)
            for ring in country.rings where P.mightShow(ring) {
                P.addRing(ring.points, to: &land, minStep: step)
                if isMine { P.addRing(ring.points, to: &mine, minStep: step) }
            }
        }
        c.fill(land, with: .color(Palette.globeLand))
        c.fill(mine, with: .color(Palette.globeMine))
        c.stroke(P.stroke(data.borders, minStep: step), with: .color(Palette.globeBorder), lineWidth: 0.7)
        if let img = light(P, sun: sun) {
            c.draw(Image(decorative: img, scale: 1), in: CGRect(x: P.cx - R, y: P.cy - R, width: 2 * R, height: 2 * R))
        }
    }

    // Names that follow the zoom (mock round 5): continents lead far out, countries take
    // over closer in, seas and regions each from their own zoom. A name shows once its
    // place is big enough on screen; bigger places win overlaps.
    private func drawNames(_ ctx: GraphicsContext, _ P: GlobeProjector) {
        guard let data = GlobeData.shared else { return }
        let R = P.r, k = frame.camera.k, hu = model.hungarian
        var boxes: [CGRect] = []
        func hit(_ b: CGRect) -> Bool { boxes.contains { $0.intersects(b) } }

        var c = ctx
        c.clip(to: Path(ellipseIn: CGRect(x: P.cx - R, y: P.cy - R, width: 2 * R, height: 2 * R)))

        // oceans, along their parallel; they claim their space
        for o in data.oceans {
            let text = hu ? o.hu : o.en, span = o.span ?? 20
            let n = text.count
            let fs = min(15, R * CGFloat(span * .pi / 180) * cos(o.lat * .pi / 180) / CGFloat(n) * 1.1)
            guard fs >= 8 else { continue }
            let font = GlobeFonts.serifItalic(fs)
            let step = span / Double(max(1, n - 1))
            var box = CGRect.null
            for (i, ch) in text.enumerated() where ch != " " {
                let lon = o.lng - span / 2 + Double(i) * step
                if let b = drawLetter(c, String(ch), font: font, italic: true, color: Palette.globeNameSea,
                                      lon: lon, lat: o.lat, P: P, alpha: 1) { box = box.union(b) }
            }
            if !box.isNull { boxes.append(box) }
        }

        // continents: a size tied to the globe, fading out as you come closer
        let ca = max(0, min(1, (2.0 - k) / 0.55))
        if ca > 0 {
            let fs = max(10, min(22, R * 0.064)), pitch = fs * 1.3
            let font = GlobeFonts.sans(fs)
            for cont in data.continents {
                let text = hu ? cont.hu : cont.en, n = text.count
                let latR = cont.lat * .pi / 180
                let step = min(150 / Double(max(1, n - 1)), Double(pitch / (R * CGFloat(cos(latR)))) * 180 / .pi)
                for (i, ch) in text.enumerated() where ch != " " {
                    let lon = cont.lng + (Double(i) - Double(n - 1) / 2) * step
                    _ = drawLetter(c, String(ch), font: font, italic: false, color: Palette.globeNameContinent,
                                   lon: lon, lat: cont.lat, P: P, alpha: ca)
                }
            }
        }

        // countries: your journey's and your home's first, then the biggest
        let cf = max(0, min(1, (k - 1.15) / 0.35))
        if cf > 0 {
            let ordered = data.countries.indices.sorted { a, b in
                let ma = isMine(data.countries[a]), mb = isMine(data.countries[b])
                if ma != mb { return ma }
                return data.countries[a].size > data.countries[b].size
            }
            for i in ordered {
                let country = data.countries[i]
                guard let at = country.anchor else { continue }
                let f = P.facing(at)
                guard f >= 0.12 else { continue }
                let px = R * CGFloat(country.size)
                let fs = max(8.5, min(13, px * 0.085))
                guard px >= fs * 3, let p = P.project(at) else { continue }
                let mine = isMine(country)
                let text = Text(hu ? country.nameHu : country.name)
                    .font(GlobeFonts.sans(fs)).tracking(fs * 0.09)
                    .foregroundStyle(mine ? Palette.globeNameMine : Palette.globeNameCountry)
                let resolved = c.resolve(text)
                let sz = resolved.measure(in: CGSize(width: 1000, height: 100))
                let b = CGRect(x: p.x - sz.width / 2 - 3, y: p.y - fs / 2 - 2, width: sz.width + 6, height: fs + 4)
                guard b.maxX > -20, b.minX < P.cx * 2 + 20, !hit(b) else { continue }
                boxes.append(b)
                var t = c
                t.opacity = Double(cf) * min(1, Double(px - fs * 3) / 10) * min(1, Double(f) / 0.3)
                t.draw(resolved, at: p, anchor: .center)
            }
        }

        // seas, regions and islands
        for pl in data.places {
            guard let kmin = pl.kmin, k >= kmin else { continue }
            let at = GlobeData.unit(lon: pl.lng, lat: pl.lat)
            let f = P.facing(at)
            guard f >= 0.15, let p = P.project(at) else { continue }
            let sea = pl.kind == "sea"
            let fs: CGFloat = sea ? 11.5 : 11
            let resolved = c.resolve(Text(hu ? pl.hu : pl.en).font(GlobeFonts.serifItalic(fs))
                .foregroundStyle(sea ? Palette.globeNameSea : Palette.globeNameLand))
            let sz = resolved.measure(in: CGSize(width: 1000, height: 100))
            let b = CGRect(x: p.x - sz.width / 2 - 2, y: p.y - fs / 2 - 2, width: sz.width + 4, height: fs + 4)
            guard !hit(b) else { continue }
            boxes.append(b)
            var t = c
            t.opacity = min(1, (k - kmin) / (kmin * 0.2) + 0.15) * min(1, Double(f) / 0.3)
            t.translateBy(x: p.x, y: p.y)
            t.concatenate(GlobeFonts.oblique)
            t.draw(resolved, at: .zero, anchor: .center)
        }

        ctx.stroke(Path(ellipseIn: CGRect(x: P.cx - R, y: P.cy - R, width: 2 * R, height: 2 * R)),
                   with: .color(Palette.ln2), lineWidth: 1)
    }

    private func isMine(_ c: GlobeData.Country) -> Bool {
        model.journey.countries.contains(c.name) || model.journey.homeCountry == c.name
    }

    /// One letter of a curved name, turned to follow its parallel. Returns its box.
    private func drawLetter(_ ctx: GraphicsContext, _ ch: String, font: Font, italic: Bool, color: Color,
                            lon: Double, lat: Double, P: GlobeProjector, alpha: Double) -> CGRect? {
        let g = GlobeData.unit(lon: lon, lat: lat)
        let f = P.facing(g)
        guard f >= 0.05, let p = P.project(g), let q = P.project(GlobeData.unit(lon: lon + 0.4, lat: lat)) else { return nil }
        var t = ctx
        t.opacity = alpha * min(1, Double(f) / 0.35)
        t.translateBy(x: p.x, y: p.y)
        t.rotate(by: .radians(atan2(q.y - p.y, q.x - p.x)))
        if italic { t.concatenate(GlobeFonts.oblique) }
        t.draw(Text(ch).font(font).foregroundStyle(color), at: .zero, anchor: .center)
        return CGRect(x: p.x - 6, y: p.y - 6, width: 12, height: 12)
    }
}

// MARK: - The route, the stops, the vehicle, the compass

private struct GlobeRouteLayer: View {
    let model: GlobeModel
    let frame: GlobeModel.Frame
    let centerY: CGFloat
    let now: Date
    let reduceMotion: Bool

    var body: some View {
        Canvas { ctx, size in
            let P = GlobeProjector(camera: frame.camera, size: size, centerY: centerY)
            drawLegs(ctx, P)
            drawStops(ctx, P, width: size.width)
            drawVehicle(ctx, P)
            drawCompass(ctx, at: CGPoint(x: size.width - 30, y: 30), r: 15)
        }
        .allowsHitTesting(false)
    }

    private var j: GlobeJourney { model.journey }
    private var replaying: Bool { frame.legProgress != nil }

    private func drawLegs(_ ctx: GraphicsContext, _ P: GlobeProjector) {
        for (i, leg) in j.legs.enumerated() {
            let pr = frame.legProgress?[i] ?? 1
            guard pr > 0, j.stops.indices.contains(leg.from), j.stops.indices.contains(leg.to) else { continue }
            let path = P.arc(from: j.stops[leg.from].at, to: j.stops[leg.to].at, upTo: pr)
            ctx.stroke(path, with: .color(Palette.globeHalo), style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
            let ground = leg.mode != .flight
            let dash: [CGFloat] = ground ? [1, 6] : leg.upcoming ? [7, 6] : []
            var c = ctx
            c.opacity = leg.upcoming && !replaying ? 0.85 : 1
            c.stroke(path, with: .color(Palette.ac2Deep),
                     style: StrokeStyle(lineWidth: ground ? 3.2 : 2.6, lineCap: .round, lineJoin: .round, dash: dash))
        }
    }

    private func drawStops(_ ctx: GraphicsContext, _ P: GlobeProjector, width: CGFloat) {
        let route = Palette.ac2Deep
        var labels: [CGRect] = []
        let marks = j.stops.indices.compactMap { i in P.project(j.stops[i].at).map { CGRect(x: $0.x - 7, y: $0.y - 7, width: 14, height: 14) } }
        for (i, s) in j.stops.enumerated() {
            guard !frame.hiddenStops.contains(i), P.facing(s.at) >= 0.02, let p = P.project(s.at) else { continue }
            let age = frame.stampAge[i]
            let pop: CGFloat = reduceMotion ? 1 : age.map { $0 < 0.42 ? CGFloat(Ease.backOut($0 / 0.42)) : 1 } ?? 1
            if let age, age < 0.9, !reduceMotion {
                let ph = CGFloat(age / 0.9), rr = 6 + ph * 26
                var c = ctx
                c.opacity = 0.6 * (1 - ph)
                c.stroke(Path(ellipseIn: CGRect(x: p.x - rr, y: p.y - rr, width: 2 * rr, height: 2 * rr)), with: .color(route), lineWidth: 2)
            }
            if s.kind == .now && !replaying && !reduceMotion {
                let ph = CGFloat(now.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.2) / 2.2), rr = 7 + ph * 16
                var c = ctx
                c.opacity = 0.5 * (1 - ph)
                c.stroke(Path(ellipseIn: CGRect(x: p.x - rr, y: p.y - rr, width: 2 * rr, height: 2 * rr)), with: .color(route), lineWidth: 2)
            }
            let r = (s.kind == .now ? 6.5 : 4.5) * pop
            let dot = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
            switch s.kind {
            case .home:
                ctx.fill(Path(CGRect(x: p.x - 4 * pop, y: p.y - 4 * pop, width: 8 * pop, height: 8 * pop)), with: .color(Palette.tx2))
            case .next:
                ctx.fill(dot, with: .color(Palette.sf))
                ctx.stroke(dot, with: .color(route), lineWidth: 2)
            case .past:
                ctx.fill(dot, with: .color(route))
            case .now:
                ctx.fill(dot, with: .color(route))
                ctx.stroke(dot, with: .color(Palette.sf), lineWidth: 2.5)
            }

            // far out, only home and today keep their names, so close stops do not overlap
            if !replaying && frame.camera.k < 1.3 && (s.kind == .past || s.kind == .next) { continue }
            let name = s.kind == .home ? s.name + (model.hungarian ? " · otthon" : " · home") : s.name
            let fs: CGFloat = s.kind == .now ? 14 : 12.5
            let font = GlobeFonts.serifItalic(fs, weight: .medium)
            let ink = ctx.resolve(Text(name).font(font).foregroundStyle(s.kind == .now ? Palette.tx : Palette.tx2))
            let halo = ctx.resolve(Text(name).font(font).foregroundStyle(Palette.globeHalo))
            let sz = ink.measure(in: CGSize(width: 1000, height: 100))
            // right of the mark; left, below or above when another name or mark is there
            let tries = [CGPoint(x: p.x + 11, y: p.y - sz.height / 2), CGPoint(x: p.x - 11 - sz.width, y: p.y - sz.height / 2),
                         CGPoint(x: p.x - sz.width / 2, y: p.y + 8), CGPoint(x: p.x - sz.width / 2, y: p.y - 8 - sz.height)]
            let own = CGRect(x: p.x - 7, y: p.y - 7, width: 14, height: 14)
            let origin = tries.first { o in
                let b = CGRect(origin: o, size: sz)
                return !labels.contains { $0.intersects(b) } && !marks.contains { $0 != own && $0.intersects(b) }
            } ?? tries[0]
            labels.append(CGRect(origin: origin, size: sz))
            var c = ctx
            c.opacity = min(1, Double(pop) * 1.2)
            let center = CGPoint(x: origin.x + sz.width / 2, y: origin.y + sz.height / 2)
            c.translateBy(x: center.x, y: center.y)
            c.scaleBy(x: 1 + (1 - pop) * 0.8, y: 1 + (1 - pop) * 0.8)
            c.concatenate(GlobeFonts.oblique)
            for (dx, dy) in [(-1.5, 0), (1.5, 0), (0, -1.5), (0, 1.5), (-1.1, -1.1), (1.1, 1.1), (-1.1, 1.1), (1.1, -1.1)] as [(CGFloat, CGFloat)] {
                c.draw(halo, at: CGPoint(x: dx, y: dy), anchor: .center)
            }
            c.draw(ink, at: .zero, anchor: .center)
        }
    }

    private func drawVehicle(_ ctx: GraphicsContext, _ P: GlobeProjector) {
        guard let v = frame.vehicle, let p = P.project(v.at), let q = P.project(v.next) else { return }
        let mode = j.legs[v.leg].mode
        let angle = atan2(q.y - p.y, q.x - p.x)
        let size: CGFloat = mode == .flight ? 13 : 8
        let shape = GlobeVehicles.path(mode)
        if mode == .flight { // a shadow on the ground below the plane
            var s = ctx
            s.translateBy(x: p.x + size * 0.35, y: p.y + size * 0.55)
            s.rotate(by: .radians(angle))
            s.scaleBy(x: size, y: size)
            s.fill(shape, with: .color(.black.opacity(0.18)))
        }
        var c = ctx
        c.translateBy(x: p.x, y: p.y)
        c.rotate(by: .radians(angle))
        c.scaleBy(x: size, y: size)
        c.stroke(shape, with: .color(Palette.globeHalo), style: StrokeStyle(lineWidth: 3 / size, lineJoin: .round))
        c.fill(shape, with: .color(Palette.tx))
    }

    /// North is always up (the camera never rolls), so the compass only says so.
    private func drawCompass(_ ctx: GraphicsContext, at o: CGPoint, r: CGFloat) {
        var c = ctx
        c.translateBy(x: o.x, y: o.y)
        c.opacity = 0.8
        let ink = Palette.tx2
        c.stroke(Path(ellipseIn: CGRect(x: -r * 0.78, y: -r * 0.78, width: r * 1.56, height: r * 1.56)), with: .color(ink), lineWidth: 0.8)
        for (off, len) in [(45.0, 0.55), (0.0, 1.0)] {
            for q in 0..<4 {
                let a = (off + Double(q) * 90) * .pi / 180 - .pi / 2
                let w = len == 1 ? 0.13 : 0.1
                let tip = CGPoint(x: cos(a) * r * len, y: sin(a) * r * len)
                let l = CGPoint(x: cos(a - .pi / 2) * r * w, y: sin(a - .pi / 2) * r * w)
                var dark = Path(); dark.move(to: .zero); dark.addLine(to: tip); dark.addLine(to: l); dark.closeSubpath()
                var light = Path(); light.move(to: .zero); light.addLine(to: tip); light.addLine(to: CGPoint(x: -l.x, y: -l.y)); light.closeSubpath()
                c.fill(dark, with: .color(ink))
                c.fill(light, with: .color(Palette.sf))
                c.stroke(light, with: .color(ink), lineWidth: 0.6)
            }
        }
        c.draw(Text("N").font(GlobeFonts.sans(r * 0.5)).foregroundStyle(ink), at: CGPoint(x: 0, y: -r * 1.2), anchor: .center)
    }
}

// MARK: - Type and shapes

enum GlobeFonts {
    /// Work Sans 600 at a fixed size: map names do not grow with Dynamic Type.
    static func sans(_ size: CGFloat) -> Font {
        Typography.isAvailable(FontFamily.sans)
            ? .custom(FontFamily.sans, fixedSize: size).weight(.semibold)
            : .system(size: size, weight: .semibold)
    }

    /// Lora for sea, region and stop names. The app bundles Lora upright only, so the
    /// slant comes from `oblique` until the italic file is added.
    static func serifItalic(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        Typography.isAvailable(FontFamily.serif)
            ? .custom(FontFamily.serif, fixedSize: size).weight(weight)
            : .system(size: size, weight: weight, design: .serif)
    }

    static let oblique = CGAffineTransform(a: 1, b: 0, c: -0.2, d: 1, tx: 0, ty: 0)
}

/// The vehicle that flies a leg, drawn in a unit box pointing along +x (the mock's).
enum GlobeVehicles {
    static func path(_ mode: GlobeJourney.Mode) -> Path {
        switch mode {
        case .flight: plane
        case .train: train
        case .bus: bus
        case .ferry: ferry
        case .other: bus
        }
    }

    static let plane: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 1, y: 0))
        p.addQuadCurve(to: CGPoint(x: 0.7, y: -0.12), control: CGPoint(x: 0.95, y: -0.12))
        for (x, y) in [(0.15, -0.12), (-0.25, -0.95), (-0.42, -0.95), (-0.2, -0.12), (-0.75, -0.1), (-0.95, -0.4), (-1.07, -0.4),
                       (-0.98, -0.05), (-0.98, 0.05), (-1.07, 0.4), (-0.95, 0.4), (-0.75, 0.1), (-0.2, 0.12), (-0.42, 0.95),
                       (-0.25, 0.95), (0.15, 0.12), (0.7, 0.12)] {
            p.addLine(to: CGPoint(x: x, y: y))
        }
        p.addQuadCurve(to: CGPoint(x: 1, y: 0), control: CGPoint(x: 0.95, y: 0.12))
        p.closeSubpath()
        return p
    }()

    static let train: Path = {
        var p = Path()
        p.move(to: CGPoint(x: -1, y: -0.3))
        p.addLine(to: CGPoint(x: 0.65, y: -0.3))
        p.addQuadCurve(to: CGPoint(x: 1.05, y: 0), control: CGPoint(x: 1.05, y: -0.3))
        p.addQuadCurve(to: CGPoint(x: 0.65, y: 0.3), control: CGPoint(x: 1.05, y: 0.3))
        p.addLine(to: CGPoint(x: -1, y: 0.3))
        p.closeSubpath()
        p.addRect(CGRect(x: -2.2, y: -0.3, width: 1.05, height: 0.6))
        return p
    }()

    static let bus: Path = Path(roundedRect: CGRect(x: -1.1, y: -0.38, width: 2.2, height: 0.76), cornerRadius: 0.22)

    static let ferry: Path = {
        var p = Path()
        p.move(to: CGPoint(x: -1.1, y: -0.35))
        p.addLine(to: CGPoint(x: 0.7, y: -0.35))
        p.addQuadCurve(to: CGPoint(x: 1.2, y: 0), control: CGPoint(x: 1.15, y: -0.35))
        p.addQuadCurve(to: CGPoint(x: 0.7, y: 0.35), control: CGPoint(x: 1.15, y: 0.35))
        p.addLine(to: CGPoint(x: -1.1, y: 0.35))
        p.closeSubpath()
        return p
    }()
}
