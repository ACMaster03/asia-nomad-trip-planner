import SwiftUI

/// Which bottom bar the app draws. Both are built so Patrik and Petra can choose by
/// feel on their phones (spine mock, question A/B); the loser goes once they answer.
enum TabBarStyle: String, CaseIterable, Identifiable {
    /// The web's bar, drawn natively: solid, with the raised Check in circle.
    case livhold
    /// iOS's own tab bar: Liquid Glass on iOS 26+, Check in as the bottom accessory.
    case system

    var id: Self { self }
    var title: String {
        switch self {
        case .livhold: "Livhold"
        case .system: "iOS"
        }
    }
}

/// The signed-in app: four tabs, each with its own navigation stack, and Check in
/// as a sheet over whichever tab you're on.
struct AppShell: View {
    @AppStorage("tabBarStyle") private var style: TabBarStyle = .livhold
    @State private var router = TabRouter()

    var body: some View {
        Group {
            switch style {
            case .livhold: LivholdTabs()
            case .system: SystemTabs()
            }
        }
        .environment(router)
        .sheet(isPresented: $router.checkInOpen) {
            CheckInSheet()
        }
    }
}

// MARK: - A · the Livhold bar

/// All four stacks stay alive underneath; only the selected one is shown. That is
/// what keeps each tab's place and scroll position, and makes switching instant.
private struct LivholdTabs: View {
    @Environment(TabRouter.self) private var router

    var body: some View {
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
            TabBar(selection: router.selectionBinding) { router.checkInOpen = true }
        }
    }
}

// MARK: - B · iOS's own bar

private struct SystemTabs: View {
    @Environment(TabRouter.self) private var router
    /// On iOS 17–25 there is no bottom accessory, so Check in is a fifth tab
    /// that opens the sheet instead of being selected.
    @State private var fallbackSelection: String = AppTab.home.rawValue

    var body: some View {
        if #available(iOS 26, *) {
            TabView(selection: router.selectionBinding) {
                ForEach(AppTab.allCases) { tab in
                    TabStack(tab: tab)
                        .tabItem { Label(tab.title, systemImage: tab.symbol) }
                        .tag(tab)
                }
            }
            .tabBarMinimizeBehavior(.onScrollDown)
            .tabViewBottomAccessory {
                CheckInAccessory { router.checkInOpen = true }
            }
        } else {
            TabView(selection: fallbackBinding) {
                ForEach(AppTab.allCases) { tab in
                    TabStack(tab: tab)
                        .tabItem { Label(tab.title, systemImage: tab.symbol) }
                        .tag(tab.rawValue)
                }
                Color.clear
                    .tabItem { Label("Check in", systemImage: "mappin.and.ellipse") }
                    .tag("checkin")
            }
        }
    }

    private var fallbackBinding: Binding<String> {
        Binding { router.selection.rawValue } set: { value in
            if let tab = AppTab(rawValue: value) {
                router.select(tab)
            } else {
                router.checkInOpen = true
            }
        }
    }
}

/// The glass strip above the iOS bar: where you are, one tap to check in again.
private struct CheckInAccessory: View {
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.on)
                    .frame(width: 28, height: 28)
                    .background(Palette.ac, in: .circle)
                (Text("Da Lat").fontWeight(.semibold) + Text(" · this morning"))
                    .font(.sans(14))
                    .foregroundStyle(Palette.tx)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("Check in")
                    .font(.sans(14, weight: .semibold))
                    .foregroundStyle(Palette.ac)
            }
            .padding(.horizontal, 12)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Check in. Last: Da Lat, this morning.")
    }
}

// MARK: - one tab

/// A tab's navigation stack and its first screen. Pushed screens are resolved here,
/// so every tab can open any route (Account from Home, a stop from Trip, …).
private struct TabStack: View {
    let tab: AppTab
    @Environment(TabRouter.self) private var router
    @AppStorage("appearance") private var appearance: Appearance = .system

    var body: some View {
        NavigationStack(path: router.path(tab)) {
            root
                .navigationDestination(for: Route.self, destination: destination)
        }
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
        case .stop(let name): StopScreen(name: name)
        case .tripSettings: TripSettingsScreen()
        }
    }
}
