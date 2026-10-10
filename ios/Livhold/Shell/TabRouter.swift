import Observation
import SwiftUI

/// Where you are in the app, per tab. Each tab keeps its own stack of pushed
/// screens, so leaving Trip on Da Lat and coming back finds Da Lat again
/// (spine mock C, 2026-09-27).
@MainActor
@Observable
final class TabRouter {
    var selection: AppTab = .home
    var paths: [AppTab: [Route]] = [:]
    /// Bumped when the tab you're on is tapped again at its root; the screen
    /// scrolls to its top when it changes.
    private(set) var scrollToTop: [AppTab: Int] = [:]
    var checkInOpen = false
    /// Something Trip's globe should play as soon as Trip shows (#166): the leg into
    /// a stop just arrived in, from Home's Arrived button.
    var globeRequest: GlobeRequest?

    /// Arrived on Home: Trip comes forward at its start, and its globe plays the leg.
    func playArrival(city: String) {
        globeRequest = .arrival(city: city)
        paths[.trip] = []
        select(.trip)
    }

    /// Every tap on a tab lands here, including a tap on the tab you're already on:
    /// the first re-tap goes back to the tab's start, the next one scrolls to the top.
    ///
    /// Leaving a tab closes the pages opened on it (Patrik, 2 Oct): Reminders,
    /// Account, settings, Subscriptions and All entries are visits, and coming back
    /// to them later was a surprise. A stop on Trip stays, so you can check Money
    /// while planning Da Lat and come back to Da Lat (spine mock C, 27 Sep).
    func select(_ tab: AppTab) {
        guard tab == selection else {
            paths[selection] = Array(paths[selection, default: []].prefix { route in
                if case .stop = route { true } else { false }
            })
            selection = tab
            return
        }
        if paths[tab, default: []].isEmpty {
            scrollToTop[tab, default: 0] += 1
        } else {
            paths[tab] = []
        }
    }

    func path(_ tab: AppTab) -> Binding<[Route]> {
        Binding { self.paths[tab, default: []] } set: { self.paths[tab] = $0 }
    }

    /// The binding a tab bar writes to. Its setter fires on every tap, even one on
    /// the selected tab, which is how a re-tap is noticed at all.
    var selectionBinding: Binding<AppTab> {
        Binding { self.selection } set: { self.select($0) }
    }
}

/// The four tabs, as on the web's `AppNav`. Check in is not a tab: it is an action
/// in the middle of the bar that opens a sheet.
///
/// Icons are SF Symbols stand-ins for the web's Lucide set (House, Route, Wallet,
/// Map) until the Lucide-vs-SF-Symbols decision is made.
enum AppTab: String, CaseIterable, Identifiable {
    case home, trip, money, map
    var id: Self { self }

    var title: String {
        switch self {
        case .home: String(localized: "Home")
        case .trip: String(localized: "Trip")
        case .money: String(localized: "Money")
        case .map: String(localized: "Map")
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .trip: "point.topleft.down.to.point.bottomright.curvepath"
        case .money: "wallet.bifold"
        case .map: "map"
        }
    }
}

enum GlobeRequest: Equatable {
    case arrival(city: String)
}

/// Every screen a tab can push. Pushing by value keeps each tab's stack a plain list.
enum Route: Hashable {
    case account
    case signInMethods
    case gallery
    case stop(String)
    case tripSettings
    /// All entries, optionally opened on a filter ("beyond") or a day ("2026-09-20").
    case moneyEntries(String?)
    case moneySettings
    /// Every subscription, from Money's card.
    case moneySubscriptions
    /// Every reminder, from Home.
    case reminders
}
