import SwiftUI

/// Which bottom bar the app draws. All three are on trial so Patrik and Petra can
/// choose by feel on their phones; the ones not chosen go afterwards.
enum TabBarStyle: String, CaseIterable, Identifiable {
    /// The web's bar, drawn natively: solid, with the raised Check in circle.
    case livhold
    /// iOS's own bar (Liquid Glass on 26+) with a slim "Check in" strip above it.
    /// Raw value kept from build 2, where it was the only iOS option.
    case system
    /// iOS's own bar with Check in as a separate round glass ＋ beside the tabs.
    case systemButton

    var id: Self { self }
    var title: String {
        switch self {
        case .livhold: "Livhold"
        case .system: "iOS · strip"
        case .systemButton: "iOS · ＋"
        }
    }
}

/// The signed-in app: four tabs, each with its own navigation stack, and Check in
/// as a sheet over whichever tab you're on.
struct AppShell: View {
    @AppStorage("tabBarStyle") private var style: TabBarStyle = .livhold
    @State private var router = TabRouter()
    @Namespace private var checkInZoom

    var body: some View {
        Group {
            switch style {
            case .livhold: LivholdTabs()
            case .system: SystemTabs(checkIn: .strip)
            case .systemButton: SystemTabs(checkIn: .button)
            }
        }
        .environment(router)
        .environment(\.checkInZoom, checkInZoom)
        .sheet(isPresented: $router.checkInOpen) {
            CheckInSheet()
                // The ＋ lives in the system bar, which can't be a zoom source.
                .modifier(ZoomDestination(id: "checkin", namespace: style == .systemButton ? nil : checkInZoom))
        }
        // A firm tap as Check in opens (the Livhold bar's circle makes its own).
        .sensoryFeedback(.impact(weight: .medium), trigger: router.checkInOpen) { _, open in
            open && style != .livhold
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

private enum CheckInPlacement { case strip, button }

/// A tab or the Check in slot beside them — the ＋ variant puts Check in inside
/// the system bar, where selecting it must open the sheet rather than a tab.
private enum Slot: Hashable {
    case tab(AppTab)
    case checkIn
}

private struct SystemTabs: View {
    let checkIn: CheckInPlacement
    @Environment(TabRouter.self) private var router

    var body: some View {
        Group {
            if #available(iOS 26, *) {
                modern
            } else {
                legacy
            }
        }
        .sensoryFeedback(.selection, trigger: router.selection)
    }

    /// iOS 26+: the Liquid Glass bar. All four tabs stay visible while scrolling
    /// (Patrik, 2026-09-27: hiding them is not worth it).
    @available(iOS 26, *)
    @ViewBuilder private var modern: some View {
        switch checkIn {
        case .strip:
            TabView(selection: slotBinding) {
                ForEach(AppTab.allCases) { tab in
                    Tab(tab.title, systemImage: tab.symbol, value: Slot.tab(tab)) { TabStack(tab: tab) }
                }
            }
            .tabViewBottomAccessory {
                CheckInStrip { router.checkInOpen = true }
            }
        case .button:
            TabView(selection: slotBinding) {
                ForEach(AppTab.allCases) { tab in
                    Tab(tab.title, systemImage: tab.symbol, value: Slot.tab(tab)) { TabStack(tab: tab) }
                }
                // The separate round slot at the bar's end. iOS reserves it for
                // search; Map's search can move into its own screen if this wins.
                Tab("Check in", systemImage: "plus", value: Slot.checkIn, role: .search) {
                    Color.clear
                }
            }
        }
    }

    /// iOS 17–25: the plain system bar, Check in as a fifth tab.
    private var legacy: some View {
        TabView(selection: slotBinding) {
            ForEach(AppTab.allCases) { tab in
                TabStack(tab: tab)
                    .tabItem { Label(tab.title, systemImage: tab.symbol) }
                    .tag(Slot.tab(tab))
            }
            Color.clear
                .tabItem { Label("Check in", systemImage: "plus.circle") }
                .tag(Slot.checkIn)
        }
    }

    private var slotBinding: Binding<Slot> {
        Binding { .tab(router.selection) } set: { slot in
            switch slot {
            case .tab(let tab): router.select(tab)
            case .checkIn: router.checkInOpen = true
            }
        }
    }
}

/// The slim glass strip above the iOS bar: just the action, nothing else.
private struct CheckInStrip: View {
    let open: () -> Void
    @Environment(\.checkInZoom) private var zoom

    var body: some View {
        Button(action: open) {
            Label("Check in", systemImage: "plus")
                .font(.sans(16, weight: .semibold))
                .foregroundStyle(Palette.ac)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .modifier(ZoomSource(id: "checkin", namespace: zoom))
    }
}

// MARK: - one tab

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
