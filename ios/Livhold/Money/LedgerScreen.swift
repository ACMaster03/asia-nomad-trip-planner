import SwiftUI

// All entries (the web's /money/entries, LedgerPage.tsx), as approved in Money
// mock round 1: search that pulls down, filters, Coming up folded at the top,
// days with their totals, colour tiles, and swipe actions: Log again on the
// left, Delete on the right. It reads the ledger kept on the phone, so it opens
// at once and works with no signal.

struct LedgerScreen: View {
    /// "beyond", a filter, or a day ("2026-09-20") to open on.
    let focus: String?

    enum Filter: String, CaseIterable, Identifiable {
        case all = "All", everyday = "Everyday", beyond = "Beyond the everyday", bookings = "Bookings",
             subscriptions = "Subscriptions", income = "Income"
        var id: Self { self }

        var title: String {
            switch self {
            case .all: String(localized: "All")
            case .everyday: String(localized: "Everyday")
            case .beyond: String(localized: "Beyond the everyday")
            case .bookings: String(localized: "Bookings")
            case .subscriptions: String(localized: "Subscriptions")
            case .income: String(localized: "Income")
            }
        }
    }

    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor
    @State private var filter: Filter = .all
    /// One category, on top of the filter (from Where it goes, or the Category chip).
    @State private var category: String?
    @State private var query = ""
    @State private var comingOpen = false
    @State private var didFocus = false

    var body: some View {
        Group {
            if let trip = store.trip {
                let model = MoneyModel(trip: trip, ledger: trip.ledger, cities: store.cityCosts, today: Days.today())
                list(model)
                    .navigationTitle(category.map(Categories.label) ?? String(localized: "All entries"))
            } else {
                Color.clear
            }
        }
        .background(Palette.canvas.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Name or category")
        .toolbar {
            if store.canEdit {
                ToolbarItem(placement: .primaryAction) {
                    Button { editor.target = .add(.expense) } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add expense")
                }
            }
        }
        .onAppear {
            guard !didFocus else { return }
            didFocus = true
            if focus == "beyond" { filter = .beyond }
            if let focus, focus.hasPrefix("cat:") { category = String(focus.dropFirst(4)) }
        }
    }

    // MARK: list

    private func list(_ model: MoneyModel) -> some View {
        let rows = matching(model)
        let past = rows.filter { $0.date <= model.today }
        let coming = rows.filter { $0.date > model.today }.sorted { $0.date < $1.date }
        let days = Dictionary(grouping: past, by: \.date)
        let dates = days.keys.sorted(by: >)
        // Within a day the stored order, newest first (ledgerView.ts).
        let order = Dictionary(uniqueKeysWithValues: model.ledger.enumerated().map { ($0.element.id, $0.offset) })

        return ScrollViewReader { proxy in
            List {
                Section {
                    if !query.trimmed.isEmpty || filter != .all || category != nil { summary(past, model) }
                    if !coming.isEmpty { comingUp(coming, model) }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowSeparator(.hidden)

                if rows.isEmpty {
                    Section {
                        (query.isEmpty ? Text("Nothing here yet.") : Text("No entries match “\(query)”."))
                            .font(.sans(15)).foregroundStyle(Palette.tx2)
                    }
                    .listRowBackground(Color.clear)
                }

                ForEach(dates, id: \.self) { date in
                    let entries = (days[date] ?? []).sorted { (order[$0.id] ?? 0) > (order[$1.id] ?? 0) }
                    Section {
                        ForEach(entries) { e in row(e, model) }
                    } header: {
                        dayHeader(date, entries, model)
                    }
                    .id(date)
                }
            }
            .listStyle(.insetGrouped)
            .listSectionSpacing(6)
            .scrollContentBackground(.hidden)
            .environment(\.defaultMinListRowHeight, 44)
            // The chips sit above the list, not in it: a Menu opens by shrinking its chip
            // and growing out of it, and inside a row the rows below drew over that.
            .safeAreaInset(edge: .top, spacing: 0) {
                filters(model)
                    .padding(.vertical, 6)
                    .background(Palette.canvas)
            }
            .onAppear {
                if let focus, focus.count == 10, focus.first?.isNumber == true {
                    DispatchQueue.main.async { proxy.scrollTo(focus, anchor: .top) }
                }
            }
        }
    }

    private func matching(_ model: MoneyModel) -> [LedgerEntry] {
        let words = Self.fold(query).split(separator: " ").map(String.init)
        return model.ledger.filter { e in
            if let category, e.category != category { return false }
            switch filter {
            case .all: break
            case .everyday: guard e.isExpense && isEverydayRow(e) else { return false }
            case .beyond: guard e.isExpense && !isEverydayRow(e) else { return false }
            case .bookings: guard e.isImported else { return false }
            case .subscriptions: guard e.category == "subscriptions" else { return false }
            case .income: guard e.type == .income else { return false }
            }
            guard !words.isEmpty else { return true }
            let hay = Self.fold("\(e.note) \(Categories.label(e.category))")
            return words.allSatisfy { hay.contains($0) }
        }
    }

    /// Accents off, lower case, đ → d (ledgerSearch.ts).
    static func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "en_US"))
            .replacingOccurrences(of: "đ", with: "d")
            .trimmingCharacters(in: .whitespaces)
    }

    // MARK: parts

    private func filters(_ model: MoneyModel) -> some View {
        // The categories this journey has used, most used first.
        var counts: [String: Int] = [:]
        for e in model.ledger { counts[e.category, default: 0] += 1 }
        let used = counts.sorted { $0.value > $1.value || ($0.value == $1.value && $0.key < $1.key) }.map(\.key)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Menu {
                    if category != nil {
                        Button("All categories", systemImage: "xmark") { withAnimation(Motion.quick) { category = nil } }
                    }
                    ForEach(used, id: \.self) { id in
                        Button {
                            withAnimation(Motion.quick) { category = id }
                        } label: {
                            Label("\(Categories.label(id)) · \(counts[id] ?? 0)", systemImage: Categories.symbol(id))
                        }
                    }
                } label: {
                    HStack(spacing: 5) {
                        if let category {
                            RoundedRectangle(cornerRadius: 3).fill(Categories.color(category)).frame(width: 9, height: 9)
                        }
                        Text(category.map(Categories.label) ?? String(localized: "Category"))
                        Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                    }
                    .font(.sans(13, weight: category != nil ? .semibold : .regular))
                    .foregroundStyle(category != nil ? Palette.ac : Palette.tx2)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(category != nil ? Palette.acSoft : Palette.fill, in: .capsule)
                    .overlay(Capsule().strokeBorder(category != nil ? Palette.acLine : .clear, lineWidth: 1))
                    .contentShape(.contextMenuPreview, Capsule())
                }
                .menuSettles(on: category)
                ForEach(Filter.allCases) { f in
                    let on = filter == f
                    Button { withAnimation(Motion.quick) { filter = f } } label: {
                        Text(f.title)
                            .font(.sans(13, weight: on ? .semibold : .regular))
                            .foregroundStyle(on ? Palette.ac : Palette.tx2)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(on ? Palette.acSoft : Palette.fill, in: .capsule)
                            .overlay(Capsule().strokeBorder(on ? Palette.acLine : .clear, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
        // The menu grows out of the chip; unclipped, it isn't cut to the row's height.
        .scrollClipDisabled()
        .sensoryFeedback(.selection, trigger: filter)
    }

    /// "12 entries · 48 200 Ft spent · 420 000 Ft received"
    private func summary(_ past: [LedgerEntry], _ model: MoneyModel) -> some View {
        let spent = past.filter(\.isExpense).reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, model.rates) }
        let got = past.filter { $0.type == .income }.reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, model.rates) }
        var parts = [String(localized: "\(past.count) entries"), String(localized: "\(MoneyText.full(spent, model.base)) spent")]
        if got > 0 { parts.append(String(localized: "\(MoneyText.full(got, model.base)) received")) }
        return Text(parts.joined(separator: " · "))
            .font(.sans(13)).foregroundStyle(Palette.tx2)
            .padding(.horizontal, 24)
    }

    private func comingUp(_ coming: [LedgerEntry], _ model: MoneyModel) -> some View {
        let total = coming.filter(\.isExpense).reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, model.rates) }
        return VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(Motion.settle) { comingOpen.toggle() } } label: {
                HStack {
                    Image(systemName: "calendar.badge.clock").foregroundStyle(Palette.tx2)
                    Text("Coming up · \(coming.count) payments").font(.sans(14))
                    Spacer()
                    Text(MoneyText.full(total, model.base)).font(.sans(14, weight: .medium))
                    Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                        .rotationEffect(.degrees(comingOpen ? 180 : 0))
                }
                .foregroundStyle(Palette.tx2)
                .padding(.vertical, 11)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            if comingOpen {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Dated after today, so not counted as spent yet.")
                        .font(.sans(12.5)).foregroundStyle(Palette.tx3)
                    ForEach(coming) { e in
                        Button { open(e) } label: {
                            HStack(spacing: 10) {
                                Text(Days.short(e.date)).font(.sans(12.5, weight: .medium)).foregroundStyle(Palette.tx3).frame(width: 46, alignment: .leading)
                                EntryRow(entry: e, model: model)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .expands()
            }
        }
        .padding(.horizontal, 14)
        .background(RoundedRectangle(cornerRadius: 16).strokeBorder(Palette.ln2, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
        .padding(.horizontal, 20)
    }

    private func dayHeader(_ date: String, _ entries: [LedgerEntry], _ model: MoneyModel) -> some View {
        let spent = entries.filter(\.isExpense).reduce(0) { $0 + Journey.toBase($1.amount, $1.currency, model.rates) }
        var title = MoneyText.weekday(date)
        if date == model.today { title = String(localized: "Today · \(title)") }
        else if date == Days.add(model.today, -1) { title = String(localized: "Yesterday · \(title)") }
        if date == model.tripStart { title = String(localized: "\(title) · day 1") }
        return HStack {
            Text(title)
            Spacer()
            if spent > 0 { Text(MoneyText.full(spent, model.base)) }
        }
        .font(.sans(11.5, weight: .semibold))
        .tracking(0.6)
        .foregroundStyle(Palette.tx3)
    }

    private func row(_ e: LedgerEntry, _ model: MoneyModel) -> some View {
        Button { open(e) } label: { EntryRow(entry: e, model: model) }
            .buttonStyle(.plain)
            .listRowBackground(Palette.sf)
            .listRowInsets(EdgeInsets(top: 0, leading: 14, bottom: 0, trailing: 14))
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                if store.canEdit {
                    Button(role: .destructive) { remove(e) } label: { Label("Delete", systemImage: "trash") }
                        .tint(Palette.ac2)
                }
            }
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                if store.canEdit, e.source == nil {
                    Button { logAgain(e, today: model.today, rates: model.rates, base: model.base) } label: {
                        Label("Log again", systemImage: "arrow.counterclockwise")
                    }
                    .tint(Palette.ac)
                }
            }
    }

    // MARK: actions

    private func open(_ e: LedgerEntry) {
        guard store.canEdit else { return }
        editor.target = .edit(e)
    }

    /// The same thing again, today: the second iced coffee of the week.
    private func logAgain(_ e: LedgerEntry, today: String, rates: [String: Double], base: String) {
        let copy = LedgerEntry(id: newId("le"), date: today, type: e.type, category: e.category, amount: e.amount,
                               currency: e.currency, note: e.note, everyday: e.everyday)
        Task {
            do {
                try await store.upsertEntry(copy)
                let shown = MoneyText.full(Journey.toBase(e.amount, e.currency, rates), base)
                let label = e.note.isEmpty ? Categories.label(e.category) : e.note
                editor.toast = String(localized: "Logged again · \(shown) · \(label)")
            } catch {
                editor.toast = error.localizedDescription
            }
        }
    }

    private func remove(_ e: LedgerEntry) {
        Task {
            do {
                try await store.deleteEntry(e)
                let label = e.note.isEmpty ? Categories.label(e.category) : e.note
                editor.toast = String(localized: "Deleted · \(label)")
            } catch {
                editor.toast = error.localizedDescription
            }
        }
    }
}

// MARK: - Settings → Money

/// Tracking and the budget cap, off the Money page (Patrik, 27 Sep): the switch
/// is dead weight on the page after the first visit.
struct MoneySettingsScreen: View {
    @Environment(TripStore.self) private var store
    @State private var capText = ""
    @State private var error: String?
    @State private var saved = false
    @FocusState private var capFocused: Bool

    var body: some View {
        let meta = store.trip?.state.meta
        let base = meta?.baseCurrency ?? "HUF"
        List {
            Section {
                Toggle("Track spending", isOn: Binding(
                    get: { store.tracking == .yes },
                    set: { on in Task { do { try await store.setTracking(on) } catch { self.error = error.localizedDescription } } }
                ))
                .tint(Palette.ac)
                .disabled(store.tracking == .unknown)
            } footer: {
                Text("Daily pace, where it goes and the projection. Bookings show either way.")
            }
            if let meta {
                Section {
                    HStack {
                        Text("Budget cap")
                        Spacer()
                        TextField("None", text: $capText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .focused($capFocused)
                            .disabled(!store.canEdit)
                            .onSubmit(saveCap)
                        Text(MoneyText.symbol(base)).foregroundStyle(Palette.tx3)
                    }
                    LabeledContent("Base currency", value: base)
                    NavigationLink {
                        RatesScreen()
                    } label: {
                        LabeledContent("Exchange rates", value: String(localized: "\(max(0, (store.trip?.state.rates.count ?? 1) - 1)) currencies"))
                    }
                } header: {
                    Text(meta.tripName ?? String(localized: "This journey"))
                } footer: {
                    store.canEdit ? Text("The cap is for this whole journey. Tapping the bar on Money opens this screen.") : Text("Only the journey’s editors can change the cap.")
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(Palette.warn) }
            }
        }
        .font(.sans(16))
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Money")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { capFocused = false; saveCap() }.fontWeight(.semibold)
            }
        }
        .onAppear { capText = Self.capString(meta?.budgetCap) }
        .onChange(of: capFocused) { _, f in if !f { saveCap() } }
        .sensoryFeedback(.success, trigger: saved)
        .task { await store.refreshTracking() }
    }

    private static func capString(_ v: Double?) -> String {
        guard let v, v > 0 else { return "" }
        return v.formatted(.number.precision(.fractionLength(0)).grouping(.automatic).locale(Locale(identifier: "hu_HU")))
    }

    private func saveCap() {
        let digits = capText.filter(\.isNumber)
        let value = Double(digits) ?? 0
        let current = store.trip?.state.meta.budgetCap ?? 0
        guard value != current else { capText = Self.capString(current); return }
        Task {
            do {
                try await store.save { doc in
                    var meta = doc["meta"] ?? .object([:])
                    meta["budgetCap"] = .number(value)
                    doc["meta"] = meta
                }
                capText = Self.capString(value)
                saved.toggle()
                error = nil
            } catch {
                self.error = error.localizedDescription
                capText = Self.capString(current)
            }
        }
    }
}

/// The trip's rates, read-only on the phone for now.
private struct RatesScreen: View {
    @Environment(TripStore.self) private var store

    var body: some View {
        let base = store.trip?.state.meta.baseCurrency ?? "HUF"
        let rates = (store.trip?.state.rates ?? [:]).filter { $0.key != base }.sorted { $0.key < $1.key }
        List {
            Section {
                ForEach(rates, id: \.key) { code, rate in
                    LabeledContent("1 \(code)", value: MoneyText.full(rate, base) == MoneyText.full(0, base) && rate > 0
                                   ? "\(rate.formatted(.number.precision(.significantDigits(3)))) \(MoneyText.symbol(base))"
                                   : MoneyText.full(rate, base))
                }
            } footer: {
                Text("Updated from the day’s rates each time the journey opens. Add or remove currencies on livhold.com.")
            }
        }
        .font(.sans(16))
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Exchange rates")
        .navigationBarTitleDisplayMode(.inline)
    }
}
