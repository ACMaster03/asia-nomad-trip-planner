import SwiftUI

/// The signed-in app: four tabs, each with its own navigation stack, and Check in
/// as a sheet over whichever tab you're on.
///
/// The bar is our own glass bar (Components/GlassTabBar.swift), chosen by Patrik on
/// 2026-09-27 over the web's solid bar and iOS's system bar after trying all three
/// on TestFlight: iOS's Liquid Glass, the web's layout, a raised pin in the middle.
struct AppShell: View {
    @State private var router = TabRouter()
    @State private var trips = TripStore()
    @State private var editor = TripEditor()
    @Namespace private var checkInZoom
    @Environment(AuthStore.self) private var auth
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        // All four stacks stay alive underneath; only the selected one is shown. That
        // is what keeps each tab's place and scroll position, and makes switching instant.
        ZStack {
            ForEach(AppTab.allCases) { tab in
                let on = router.selection == tab
                TabStack(tab: tab)
                    .opacity(on ? 1 : 0)
                    .allowsHitTesting(on)
                    .accessibilityHidden(!on)
            }
        }
        // The bar floats over the stacks. An inset set out here doesn't reach the
        // scroll views inside the navigation stacks (the last card ended under the
        // bar), so each screen keeps the room itself: see `reservesTabBar()`.
        .overlay(alignment: .bottom) {
            GlassTabBar(selection: router.selectionBinding) { router.checkInOpen = true }
        }
        .environment(router)
        .environment(trips)
        .environment(editor)
        .environment(\.checkInZoom, checkInZoom)
        // The saved journey shows at once; the server's copy follows, and again
        // every time the app comes back to the front (the web refetches on focus).
        .task(id: auth.userId) {
            if let id = auth.userId { await trips.start(userId: id) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await trips.refresh() } }
        }
        .sheet(isPresented: $router.checkInOpen) {
            CheckInSheet()
                .modifier(ZoomDestination(id: "checkin", namespace: checkInZoom))
        }
        // Trip's edit forms (Trip/TripEditing.swift), opened from any Trip screen.
        .sheet(item: $editor.target) { target in
            EditSheet(target: target)
                .environment(trips)
                .environment(editor)
        }
    }
}

private extension View {
    /// Keeps the floating tab bar's height free at the bottom of a screen, so the
    /// last thing on it can scroll clear of the bar.
    func reservesTabBar() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: GlassTabBar.reservedHeight)
        }
    }
}

/// A tab's navigation stack and its first screen. Pushed screens are resolved here,
/// so every tab can open any route (Account from Home, a stop from Trip, …).
private struct TabStack: View {
    let tab: AppTab
    @Environment(TabRouter.self) private var router
    @AppStorage("appearance") private var appearance: Appearance = .system
    @Namespace private var zoom

    var body: some View {
        NavigationStack(path: router.path(tab)) {
            root
                .reservesTabBar()
                .navigationDestination(for: Route.self) { route in
                    destination(route).reservesTabBar()
                }
        }
        .environment(\.tabZoom, zoom)
    }

    @ViewBuilder private var root: some View {
        switch tab {
        case .home: HomeScreen()
        case .trip: TripScreen()
        case .money: MoneyScreen()
        case .map: MapScreen()
        }
    }

    @ViewBuilder private func destination(_ route: Route) -> some View {
        switch route {
        case .account: AccountView()
        case .signInMethods: SignInMethodsView()
        case .gallery:
            GalleryView(appearance: $appearance)
                .navigationTitle("Design gallery")
                .navigationBarTitleDisplayMode(.inline)
        case .stop(let segmentId):
            StopScreen(segmentId: segmentId)
                .modifier(ZoomDestination(id: route, namespace: zoom))
        case .tripSettings: TripSettingsScreen()
        }
    }
}
