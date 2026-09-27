import SwiftUI

/// The signed-in app: four tabs, each with its own navigation stack, and Check in
/// as a sheet over whichever tab you're on.
///
/// The bar is our own glass bar (Components/GlassTabBar.swift), chosen by Patrik on
/// 2026-09-27 over the web's solid bar and iOS's system bar after trying all three
/// on TestFlight: iOS's Liquid Glass, the web's layout, a raised pin in the middle.
struct AppShell: View {
    @State private var router = TabRouter()
    @Namespace private var checkInZoom

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
        .safeAreaInset(edge: .bottom, spacing: 0) {
            GlassTabBar(selection: router.selectionBinding) { router.checkInOpen = true }
        }
        .environment(router)
        .environment(\.checkInZoom, checkInZoom)
        .sheet(isPresented: $router.checkInOpen) {
            CheckInSheet()
                .modifier(ZoomDestination(id: "checkin", namespace: checkInZoom))
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
                .navigationDestination(for: Route.self, destination: destination)
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
        case .stop(let name):
            StopScreen(name: name)
                .modifier(ZoomDestination(id: route, namespace: zoom))
        case .tripSettings: TripSettingsScreen()
        }
    }
}
