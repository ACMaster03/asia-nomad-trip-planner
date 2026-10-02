import Foundation
import Network
import Observation

/// Is there a network path at all? Travellers lose signal on buses and in the
/// mountains, so anything that must reach the server asks this first and, when
/// offline, waits for the connection instead of failing (Patrik, 2026-09-27:
/// "prepare for bad internet even if it shows 0.001% of the time").
@MainActor
@Observable
final class Connectivity {
    static let shared = Connectivity()

    private(set) var isOnline = true
    private let monitor = NWPathMonitor()

    private init() {
        monitor.pathUpdateHandler = { path in
            let online = path.status == .satisfied
            Task { @MainActor in Connectivity.shared.isOnline = online }
        }
        monitor.start(queue: DispatchQueue(label: "livhold.connectivity"))
    }

    /// Returns as soon as a path is available; throws if the waiting task is cancelled.
    /// In Debug builds, launching with `-slowNetwork 8` adds 8 s here, to see the
    /// waiting screens without finding a bad connection.
    func waitUntilOnline() async throws {
        while !isOnline {
            try await Task.sleep(for: .milliseconds(400))
        }
        #if DEBUG
        let delay = UserDefaults.standard.double(forKey: "slowNetwork")
        if delay > 0 { try await Task.sleep(for: .seconds(delay)) }
        #endif
    }
}
