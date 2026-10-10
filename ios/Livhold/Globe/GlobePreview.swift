import SwiftUI

/// The globe on its own, with the mock's journey (Budapest → Bangkok → Hanoi → Da Nang),
/// for checking it before it goes behind Trip. Account → Design gallery → Globe, or
/// launch a debug build with `-globePreview YES`.
struct GlobePreviewScreen: View {
    @State private var model = GlobeModel(journey: .preview)
    @Environment(\.dismiss) private var dismiss
    var canClose = true

    var body: some View {
        ZStack(alignment: .top) {
            Palette.canvas.ignoresSafeArea()
            GlobeView(model: model)
                .ignoresSafeArea(edges: .bottom)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(model.hungarian ? "Földgömb" : "Globe").font(.serif(26))
                    Spacer()
                    if canClose {
                        Button { dismiss() } label: { Image(systemName: "xmark").font(.sans(15, weight: .semibold)) }
                            .buttonStyle(.plain).foregroundStyle(Palette.tx2)
                            .accessibilityLabel("Close")
                    }
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        chip(model.hungarian ? "Utazás" : "Journey") { model.goJourney() }
                        chip(model.hungarian ? "Világ" : "World") { model.goWorld() }
                        chip(model.hungarian ? "Napfény" : "Sun", on: model.sunOn) { model.sunOn.toggle() }
                        chip(model.hungarian ? "Újra" : "Replay") { model.replayJourney() }
                        chip(model.hungarian ? "Megérkeztünk" : "Arrived") { model.replayArrival(leg: 1) }
                        chip(model.hungarian ? "English" : "Magyar") { model.hungarian.toggle() }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .foregroundStyle(Palette.tx)
        #if DEBUG
        // `-globeView world|journey`, `-globeHU YES`, `-globeReplay whole|arrival`: for screenshots.
        .task {
            let d = UserDefaults.standard
            if d.bool(forKey: "globeHU") { model.hungarian = true }
            if d.string(forKey: "globeView") == "world" { model.camera = GlobeModel.worldCamera(model.journey) }
            if let k = d.string(forKey: "globeK").flatMap(Double.init) { model.camera.k = k }
            try? await Task.sleep(for: .seconds(1))
            switch d.string(forKey: "globeReplay") {
            case "whole": model.replayJourney()
            case "arrival": model.replayArrival(leg: 1)
            default: break
            }
        }
        #endif
    }

    private func chip(_ title: String, on: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.sans(13, weight: .medium))
                .padding(.horizontal, 11).padding(.vertical, 6)
                .foregroundStyle(on ? Palette.on : Palette.tx2)
                .background(on ? Palette.tx : Palette.sf, in: .capsule)
                .overlay(Capsule().stroke(Palette.ln2, lineWidth: on ? 0 : 1))
        }
        .buttonStyle(.plain)
    }
}

extension GlobeJourney {
    /// The mock's journey, as on 3 Oct 2026: today in Hanoi, Da Nang next by train.
    static let preview = GlobeJourney(
        stops: [
            Stop(name: "Budapest", lon: 19.04, lat: 47.50, kind: .home),
            Stop(name: "Bangkok", lon: 100.50, lat: 13.76, kind: .past),
            Stop(name: "Hanoi", lon: 105.85, lat: 21.03, kind: .now),
            Stop(name: "Da Nang", lon: 108.20, lat: 16.05, kind: .next),
        ],
        legs: [
            Leg(from: 0, to: 1, mode: .flight, upcoming: false),
            Leg(from: 1, to: 2, mode: .flight, upcoming: false),
            Leg(from: 2, to: 3, mode: .train, upcoming: true),
        ],
        countries: ["THAILAND", "VIETNAM"],
        homeCountry: "HUNGARY"
    )
}
