import SwiftUI

/// The journey's own settings, all editable on the phone (Patrik, 29 Sep: nobody
/// should need the website). Reached from Trip's gear, Money's gear and Account.
/// Each field saves when it's left, through the same `write_state` as the timeline.
struct TripSettingsScreen: View {
    @Environment(TripStore.self) private var store
    @State private var name = ""
    @State private var home = ""
    @State private var start = ""
    @State private var end = ""
    @State private var capText = ""
    @State private var loaded = false
    @State private var error: String?
    @State private var saved = false
    @FocusState private var focus: Field?

    private enum Field { case name, home, cap }

    var body: some View {
        List {
            if let trip = store.trip {
                let meta = trip.state.meta
                Section {
                    LabeledContent("Name") {
                        TextField("Name", text: $name)
                            .multilineTextAlignment(.trailing)
                            .focused($focus, equals: .name)
                            .disabled(!store.canEdit)
                            .submitLabel(.done)
                            .onSubmit(saveName)
                    }
                    if store.canEdit {
                        // Always set: a journey needs a start (newTrip.ts), so no clear button.
                        DatePicker("Starts", selection: Binding(get: { Days.date(start) ?? .now }, set: { start = Days.iso($0) }),
                                   displayedComponents: .date)
                            .environment(\.timeZone, Days.utc)
                        OptionalDateRow(label: "Ends", iso: $end, suggested: start.isEmpty ? "" : Days.add(start, 30))
                    } else {
                        LabeledContent("Starts", value: Days.short(meta.startDate))
                        LabeledContent("Ends", value: meta.endDate.map { Days.short($0) } ?? String(localized: "open-ended"))
                    }
                    LabeledContent(String(localized: "timeline.home", defaultValue: "Home")) {
                        TextField("City, country", text: $home)
                            .multilineTextAlignment(.trailing)
                            .focused($focus, equals: .home)
                            .disabled(!store.canEdit)
                            .submitLabel(.done)
                            .onSubmit(saveHome)
                    }
                } header: {
                    Text("This journey")
                } footer: {
                    if let problem = dateProblem {
                        Text(problem).foregroundStyle(Palette.warn)
                    } else if !store.canEdit {
                        Text("Only the journey’s editors can change these.")
                    }
                }

                Section {
                    HStack {
                        Text("Budget")
                        Spacer()
                        TextField("None", text: $capText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .focused($focus, equals: .cap)
                            .disabled(!store.canEdit)
                        Text(MoneyText.symbol(meta.baseCurrency)).foregroundStyle(Palette.tx3)
                    }
                    // Locked until each expense keeps its own day's rate (#129):
                    // changing it today would reprice the past at today's rate.
                    LabeledContent("Currency", value: meta.baseCurrency)
                        .opacity(0.45)
                        .accessibilityHint(Text("Can’t be changed yet"))
                    NavigationLink {
                        RatesScreen()
                    } label: {
                        LabeledContent("Exchange rates") {
                            Text(Self.refreshed(store.fx?.lastSuccessAt))
                                .foregroundStyle(Self.isStale(store.fx?.lastSuccessAt) ? Palette.warn : Palette.tx3)
                        }
                    }
                } header: {
                    Text("Money")
                } footer: {
                    Text("Rates refresh every morning. The currency can change once each expense keeps the rate of its own day.")
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(Palette.warn) }
            }
        }
        .font(.sans(16))
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Trip settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus = nil }.fontWeight(.semibold)
            }
        }
        .onAppear(perform: load)
        // A newer copy arrived (a save, a conflict's reload, another device): show it,
        // except in the field being typed in.
        .onChange(of: store.trip?.stateRev) { _, _ in fill() }
        .onChange(of: focus) { old, _ in
            switch old {
            case .name: saveName()
            case .home: saveHome()
            case .cap: saveCap()
            case nil: break
            }
        }
        .onChange(of: start) { _, _ in if loaded { saveDates() } }
        .onChange(of: end) { _, _ in if loaded { saveDates() } }
        .sensoryFeedback(.success, trigger: saved)
        .task { await store.refreshFx() }
    }

    private var meta: TripMeta? { store.trip?.state.meta }

    private func load() {
        guard !loaded else { return }
        fill()
        // Set after the pickers took their first values, so opening doesn't save.
        DispatchQueue.main.async { loaded = true }
    }

    private func fill() {
        guard let trip = store.trip else { return }
        let meta = trip.state.meta
        if focus != .name { name = meta.tripName ?? trip.name ?? "" }
        if focus != .home { home = meta.homeBase ?? "" }
        if focus != .cap { capText = Self.capString(meta.budgetCap) }
        start = meta.startDate ?? ""
        end = meta.endDate ?? ""
    }

    private var dateProblem: String? {
        if !end.isEmpty, end < start { return String(localized: "The end is before the start.") }
        return nil
    }

    // MARK: Saves

    private func saveName() {
        let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { name = meta?.tripName ?? store.trip?.name ?? ""; return }
        guard value != meta?.tripName else { return }
        write { $0["tripName"] = .string(value) }
    }

    private func saveHome() {
        let value = home.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value != (meta?.homeBase ?? "") else { return }
        write { $0["homeBase"] = value.isEmpty ? nil : .string(value) }
    }

    private func saveDates() {
        guard dateProblem == nil, !start.isEmpty, start != (meta?.startDate ?? "") || end != (meta?.endDate ?? "") else { return }
        let (s, e) = (start, end)
        write {
            $0["startDate"] = s.isEmpty ? nil : .string(s)
            $0["endDate"] = e.isEmpty ? nil : .string(e)
        }
    }

    private func saveCap() {
        let value = Double(capText.filter(\.isNumber)) ?? 0
        let current = meta?.budgetCap ?? 0
        guard value != current else { capText = Self.capString(current); return }
        write { $0["budgetCap"] = .number(value) } onFail: { capText = Self.capString(current) }
        capText = Self.capString(value)
    }

    /// One change to `state.meta`; everything else in the document is kept.
    private func write(_ change: @escaping (inout JSONValue) -> Void, onFail: @escaping () -> Void = {}) {
        Task {
            do {
                try await store.save { doc in
                    var meta = doc["meta"] ?? .object([:])
                    change(&meta)
                    doc["meta"] = meta
                }
                saved.toggle()
                error = nil
            } catch {
                self.error = error.localizedDescription
                onFail()
            }
        }
    }

    private static func capString(_ v: Double?) -> String {
        guard let v, v > 0 else { return "" }
        return v.formatted(.number.precision(.fractionLength(0)).grouping(.automatic).locale(Locale(identifier: "hu_HU")))
    }

    // MARK: Rates

    /// "Refreshed today, 04:00", in the phone's time zone.
    static func refreshed(_ d: Date?) -> String {
        guard let d else { return String(localized: "Saved with the journey") }
        let time = d.formatted(date: .omitted, time: .shortened)
        if Calendar.current.isDateInToday(d) { return String(localized: "Refreshed today, \(time)") }
        if Calendar.current.isDateInYesterday(d) { return String(localized: "Refreshed yesterday, \(time)") }
        return String(localized: "Refreshed \(d.formatted(.dateTime.month(.abbreviated).day()))")
    }

    /// The cron runs daily, so two days means two misses (fx.ts FX_STALE_MS).
    static func isStale(_ d: Date?) -> Bool {
        guard let d else { return false }
        return Date.now.timeIntervalSince(d) > 48 * 3600
    }
}

/// The journey's currencies at the morning's rates. A currency is added here
/// (or by an entry typed in it on the web); the base one can't be removed.
struct RatesScreen: View {
    @Environment(TripStore.self) private var store
    @State private var adding = false
    @State private var error: String?

    var body: some View {
        let base = store.trip?.state.meta.baseCurrency ?? "HUF"
        let rates = (store.trip?.state.rates ?? [:]).filter { $0.key != base }.sorted { $0.key < $1.key }
        List {
            Section {
                ForEach(rates, id: \.key) { code, rate in
                    LabeledContent("1 \(code)", value: Self.rateText(rate, base))
                        .deleteDisabled(!store.canEdit)
                }
                .onDelete { idx in remove(idx.map { rates[$0].key }) }
                if store.canEdit {
                    Button { adding = true } label: {
                        Label("Add a currency", systemImage: "plus").foregroundStyle(Palette.ac)
                    }
                }
            } footer: {
                Text("\(TripSettingsScreen.refreshed(store.fx?.lastSuccessAt)). Rates refresh every morning from the day’s market rates.")
            }
            if let error {
                Section { Text(error).foregroundStyle(Palette.warn) }
            }
        }
        .font(.sans(16))
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Exchange rates")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $adding) {
            CurrencyPicker(exclude: Set(rates.map(\.key) + [base]), codes: Array((store.fx?.perUsd ?? [:]).keys)) { add($0) }
        }
        .task { await store.refreshFx() }
    }

    static func rateText(_ rate: Double, _ base: String) -> String {
        MoneyText.full(rate, base) == MoneyText.full(0, base) && rate > 0
            ? "\(rate.formatted(.number.precision(.significantDigits(3)))) \(MoneyText.symbol(base))"
            : MoneyText.full(rate, base)
    }

    private func add(_ code: String) {
        guard let trip = store.trip else { return }
        let base = trip.state.meta.baseCurrency
        let per = store.fx?.perUsd ?? [:]
        guard let a = per[base], let b = per[code], a > 0, b > 0 else { return }
        save { rates in rates[code] = .number(a / b) }
    }

    private func remove(_ codes: [String]) {
        save { rates in for c in codes { rates[c] = nil } }
    }

    private func save(_ change: @escaping (inout JSONValue) -> Void) {
        Task {
            do {
                try await store.save { doc in
                    var rates = doc["rates"] ?? .object([:])
                    change(&rates)
                    doc["rates"] = rates
                }
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Every currency the rates feed knows, searchable by code or name.
private struct CurrencyPicker: View {
    let exclude: Set<String>
    let codes: [String]
    let pick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        NavigationStack {
            List(filtered, id: \.self) { code in
                Button {
                    pick(code)
                    dismiss()
                } label: {
                    HStack {
                        Text(verbatim: code).font(.sans(16, weight: .semibold)).foregroundStyle(Palette.tx)
                        Text(verbatim: Self.name(code)).foregroundStyle(Palette.tx2)
                    }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
            .navigationTitle("Add a currency")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var filtered: [String] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return codes.filter { !exclude.contains($0) }
            .filter { q.isEmpty || $0.lowercased().contains(q) || Self.name($0).lowercased().contains(q) }
            .sorted()
    }

    static func name(_ code: String) -> String { Locale.current.localizedString(forCurrencyCode: code) ?? "" }
}
