import SwiftUI

// Starting a journey on the phone (Patrik, 29 Sep: everything is doable in the
// app, nobody is sent to the website), and the two Trip states that point
// towards one: the journey has ended (F) and the journey has no stops (G),
// from mocks-29sep §3. The seed is the web's, field for field.

// MARK: - the seed

/// product/src/lib/trips/newTrip.ts makeNewTripState. Change it there, change it here.
enum NewTripSeed {
    /// STARTER_RATES: public reference rates, Ft per 1 unit, editable later.
    static let starterRates: [(code: String, rate: Double)] = [
        ("HUF", 1), ("USD", 311), ("EUR", 354), ("GBP", 415), ("THB", 9.4), ("VND", 0.0122), ("IDR", 0.0191),
        ("MYR", 70.7), ("SGD", 230), ("KHR", 0.078), ("JPY", 1.94), ("KRW", 0.207), ("TWD", 9.76),
        ("HKD", 39.9), ("CNY", 45.81), ("INR", 3.75), ("NPR", 2.27), ("LKR", 1.03),
    ]

    /// The currencies a journey can be kept in: only those with a starter rate,
    /// as any other would start at 1 Ft per unit. The usual four first.
    static let currencies: [String] = {
        let first = ["HUF", "EUR", "USD", "GBP"]
        return first + starterRates.map(\.code).filter { !first.contains($0) }.sorted()
    }()

    /// The phone's own currency when a journey can be kept in it, else EUR.
    static var defaultCurrency: String {
        let local = Locale.current.currency?.identifier ?? ""
        return currencies.contains(local) ? local : "EUR"
    }

    static func state(name: String, startDate: String, endDate: String?, homeBase: String?,
                      baseCurrency: String, travelers: Int) -> JSONValue {
        var meta: [String: JSONValue] = [
            "version": .number(1),
            "tripName": .string(name.trimmed),
            "travelers": .number(Double(max(1, travelers))),
            "baseCurrency": .string(baseCurrency),
            "budgetCap": .number(0),
            "startDate": .string(startDate),
        ]
        if let endDate, !endDate.isEmpty { meta["endDate"] = .string(endDate) }
        if let home = homeBase?.trimmed, !home.isEmpty { meta["homeBase"] = .string(home) }
        var rates: [String: JSONValue] = [:]
        for r in starterRates { rates[r.code] = .number(r.rate) }
        let own = baseCurrency == "HUF" ? 1 : (starterRates.first { $0.code == baseCurrency }?.rate ?? 1)
        rates[baseCurrency] = .number(own)
        return .object([
            "meta": .object(meta),
            "rates": .object(rates),
            "segments": .array([]),
            "stays": .array([]),
            "transport": .array([]),
            "notes": .object([:]),
        ])
    }
}

// MARK: - the form

/// Name, dates, home and currency; Create makes the journey and shows it.
struct NewJourneySheet: View {
    @Environment(TripStore.self) private var store

    /// One id per form: a double tap or a retry after a lost answer lands on the
    /// same row instead of making a second journey (the web's newTripId).
    @State private var id = UUID().uuidString.lowercased()
    @State private var name = ""
    @State private var start = Days.today()
    @State private var end = ""
    @State private var home = ""
    @State private var currency = NewTripSeed.defaultCurrency
    @State private var travelers = 2

    @State private var prefilled = false

    private var dirty: Bool { !name.trimmed.isEmpty || !end.isEmpty }
    private var valid: Bool { !name.trimmed.isEmpty && !start.isEmpty && (end.isEmpty || end >= start) }

    var body: some View {
        EditForm(title: "New journey", canSave: valid, dirty: dirty, saveLabel: "Create", save: save) {
            Section("Name") {
                TextField("e.g. Autumn in Japan", text: $name)
                    .textInputAutocapitalization(.words)
                    .onAppear {
                        // Most journeys set off from the same place as the last one.
                        guard !prefilled else { return }
                        prefilled = true
                        home = store.trip?.state.meta.homeBase ?? ""
                    }
            }
            .listRowBackground(Palette.sf)
            Section {
                DatePicker("Starts", selection: startDate, displayedComponents: .date)
                    .environment(\.timeZone, Days.utc)
                EndDateRow(iso: $end, suggested: Days.add(start, 14))
            } header: {
                Text("Dates")
            } footer: {
                hint
            }
            .listRowBackground(Palette.sf)
            Section {
                TextField("City, country", text: $home)
                    .textContentType(.addressCityAndState)
            } header: {
                Text("Where you set off from")
            } footer: {
                Text("Optional. The timeline starts and ends here.")
            }
            .listRowBackground(Palette.sf)
            Section {
                Picker("Currency", selection: $currency) {
                    ForEach(NewTripSeed.currencies, id: \.self) { code in
                        Text(verbatim: label(code)).tag(code)
                    }
                }
                .pickerStyle(.menu)
                Stepper(value: $travelers, in: 1...12) {
                    HStack {
                        Text("Travellers")
                        Spacer()
                        Text(verbatim: "\(travelers)").monospacedDigit().foregroundStyle(Palette.tx2)
                    }
                }
            } footer: {
                Text("Money adds everything up in this currency.")
            }
            .listRowBackground(Palette.sf)
        }
    }

    private var hint: Text {
        if end.isEmpty { return Text("No end date: an open-ended journey.") }
        if end < start { return Text("The end can’t be before the start.") }
        return Text("\(Days.between(start, end)) nights.")
    }

    private var startDate: Binding<Date> {
        Binding(get: { Days.date(start) ?? .now }, set: {
            start = Days.iso($0)
            if !end.isEmpty, end < start { end = "" }
        })
    }

    private func label(_ code: String) -> String {
        guard let name = L10n.locale.localizedString(forCurrencyCode: code) else { return code }
        return "\(code) · \(name)"
    }

    private func save() async throws {
        try await store.createTrip(id: id, name: name, startDate: start, endDate: end.isEmpty ? nil : end,
                                   homeBase: home, baseCurrency: currency, travelers: travelers)
    }
}

/// The end date: "Add" until chosen, then the compact picker and a clear button.
private struct EndDateRow: View {
    @Binding var iso: String
    let suggested: String

    var body: some View {
        if iso.isEmpty {
            Button { iso = suggested } label: {
                HStack {
                    Text("Ends").foregroundStyle(Palette.tx)
                    Spacer()
                    Text("Add").foregroundStyle(Palette.ac)
                }
            }
        } else {
            HStack(spacing: 8) {
                DatePicker("Ends", selection: date, displayedComponents: .date)
                    .environment(\.timeZone, Days.utc)
                Button { iso = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.tx3)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Text("Clear end date"))
            }
        }
    }

    private var date: Binding<Date> {
        Binding(get: { Days.date(iso) ?? .now }, set: { iso = Days.iso($0) })
    }
}

// MARK: - pieces the Trip states share

/// The mock's pill: accent, full round, sized to its words.
struct TripPillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sans(15, weight: .semibold))
            .foregroundStyle(Palette.on)
            .padding(.horizontal, 18)
            .frame(minHeight: 44)
            .background(Palette.ac, in: .capsule)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// The soft green-and-rose wash behind a card that points forward.
struct JourneyWash: View {
    var body: some View {
        ZStack {
            Palette.sf
            RadialGradient(colors: [Palette.ac.opacity(0.22), .clear], center: UnitPoint(x: 0.2, y: 0),
                           startRadius: 0, endRadius: 280)
            RadialGradient(colors: [Palette.ac2.opacity(0.16), .clear], center: .bottomTrailing,
                           startRadius: 0, endRadius: 240)
        }
        .clipShape(.rect(cornerRadius: Radius.r))
    }
}

extension Journey {
    /// The day after the end date (recap.ts tripPhase 'post'). A journey without
    /// an end date never ends here: guessing one from the last stop would call it
    /// over while its owner is still on the road.
    static func isFinished(_ state: TripState, today: String) -> Bool {
        guard let end = state.meta.endDate, !end.isEmpty else { return false }
        return today > end
    }

    struct Recap { let nights: Int; let stops: Int; let countries: Int }

    /// Nights away (start to end), in-plan stops and their countries (recap.ts).
    static func recap(_ state: TripState) -> Recap {
        let inPlan = state.segments.filter(\.inPlan)
        let span = Days.between(state.meta.startDate, state.meta.endDate)
        let total = span > 0 ? span : inPlan.reduce(0) { $0 + nights($1) }
        let countries = Set(inPlan.map { $0.country.trimmed.lowercased() }.filter { !$0.isEmpty })
        return Recap(nights: total, stops: inPlan.count, countries: countries.count)
    }
}

// MARK: - no journey yet

struct NoJourneyCard: View {
    let plan: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Where to?").font(.serif(26)).foregroundStyle(Palette.tx).padding(.bottom, 6)
            Text("Plan your first journey: the stops, the stays and what it all costs, in one place.")
                .font(.sans(15)).foregroundStyle(Palette.tx2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 16)
            Button(action: plan) { Label("Plan a journey", systemImage: "plus") }
                .buttonStyle(TripPillButtonStyle())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.vertical, 22)
        .background(JourneyWash())
    }
}

// MARK: - F: the journey has ended

struct FinishedJourneyCard: View {
    let name: String
    let state: TripState
    let canEdit: Bool
    let planNext: () -> Void
    let lookBack: () -> Void

    var body: some View {
        let recap = Journey.recap(state)
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: dates)
                    .font(.sans(12, weight: .semibold))
                    .textCase(.uppercase)
                    .tracking(1.2)
                    .foregroundStyle(Palette.tx2)
                    .padding(.bottom, 6)
                Text("Where next?").font(.serif(26)).foregroundStyle(Palette.tx).padding(.bottom, 6)
                (canEdit ? Text("\(name) is behind you. Start planning the next one.") : Text("\(name) is behind you."))
                    .font(.sans(15)).foregroundStyle(Palette.tx2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 12)
                HStack(spacing: 8) {
                    box(recap.nights, String(localized: "recap.nights", defaultValue: "nights"))
                    box(recap.stops, String(localized: "recap.stops", defaultValue: "stops"))
                    box(recap.countries, String(localized: "recap.countries", defaultValue: "countries"))
                }
                if canEdit {
                    Button(action: planNext) { Label("Plan the next journey", systemImage: "plus") }
                        .buttonStyle(TripPillButtonStyle())
                        .padding(.top, 16)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 22)
            .background(JourneyWash())

            Button(action: lookBack) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(verbatim: name)
                            .font(.sans(12, weight: .semibold))
                            .textCase(.uppercase)
                            .tracking(1.2)
                            .foregroundStyle(Palette.tx2)
                        Spacer()
                        Text("Look back ›").font(.sans(15, weight: .semibold)).foregroundStyle(Palette.ac)
                    }
                    Text("The timeline and its stays, kept as they were.")
                        .font(.sans(14)).foregroundStyle(Palette.tx2)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 24)
    }

    private var dates: String {
        "\(name) · \(Days.short(state.meta.startDate)) – \(Days.short(state.meta.endDate))"
    }

    private func box(_ n: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(verbatim: "\(n)").font(.sans(17, weight: .semibold)).monospacedDigit().foregroundStyle(Palette.tx)
            Text(verbatim: label).font(.sans(12)).foregroundStyle(Palette.tx2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Palette.fill, in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - G: a journey with no stops

struct NoStopsCard: View {
    let state: TripState
    let home: String
    @Environment(TripStore.self) private var store
    @Environment(TripEditor.self) private var editor
    @State private var flightThere = false
    /// Where the flight there goes, once asked: its stop form opens when the flight is saved.
    @State private var flightTo: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            (store.canEdit ? Text("No stops yet. Add the first place you’re going.") : Text("No stops yet."))
                .font(.sans(16)).foregroundStyle(Palette.tx2)
                .fixedSize(horizontal: false, vertical: true)
            if store.canEdit {
                Button {
                    // A flight there is already saved (the stop form was closed): its place, filled in.
                    if let leg = landed {
                        editor.open(.firstStop(city: leg.to, arrive: String((leg.date ?? "").prefix(10))))
                    } else {
                        editor.open(.addStop)
                    }
                } label: { Label("Add the first stop", systemImage: "plus") }
                    .buttonStyle(TripPillButtonStyle())
                    .padding(.top, 14)
                if landed == nil {
                Button { flightThere = true } label: {
                    Label("Or start with the flight there", systemImage: "plus")
                        .font(.sans(15, weight: .semibold))
                        .foregroundStyle(Palette.ac)
                        .frame(minHeight: 44)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
        .padding(.top, 8)
        .sheet(isPresented: $flightThere, onDismiss: addLandingStop) {
            FlightThereSheet(state: state, home: home, chosen: $flightTo)
                .environment(store)
                .environment(editor)
        }
    }

    /// A leg already going somewhere from home: the flight there, saved before its stop.
    private var landed: TransportLeg? {
        state.transport.first { !$0.to.trimmed.isEmpty && !Journey.sameCity($0.to, home) }
    }

    /// The flight is saved (a leg to that place exists): open its stop, filled in.
    private func addLandingStop() {
        guard let city = flightTo else { return }
        flightTo = nil
        guard let leg = store.trip?.state.transport.first(where: { Journey.sameCity($0.to, city) }) else { return }
        let day = String((leg.date ?? state.meta.startDate ?? "").prefix(10))
        editor.open(.firstStop(city: city, arrive: day))
    }
}

/// The transport form needs both ends of the leg, and with no stops there is no
/// leg yet: ask where it goes first, then show the usual transport form. Once
/// it's saved, the stop form opens for that place (`addLandingStop`), so the
/// flight joins the home → first stop leg straight away.
private struct FlightThereSheet: View {
    let state: TripState
    @State private var from: String
    @State private var to = ""
    @Binding var chosen: String?
    @Environment(\.dismiss) private var dismiss

    init(state: TripState, home: String, chosen: Binding<String?>) {
        self.state = state
        _from = State(initialValue: home)
        _chosen = chosen
    }

    var body: some View {
        if let chosen {
            EditSheet(target: .transport(nil, from: from.trimmed, to: chosen, date: state.meta.startDate ?? ""))
        } else {
            NavigationStack {
                Form {
                    Section {
                        LabeledContent("From") {
                            TextField("City", text: $from).textContentType(.addressCity).multilineTextAlignment(.trailing)
                        }
                        LabeledContent("To") {
                            TextField("City", text: $to).textContentType(.addressCity).multilineTextAlignment(.trailing)
                        }
                    } footer: {
                        Text("Where the journey starts, and the first place you’re going. After the flight, you add that place as your first stop.")
                    }
                    .listRowBackground(Palette.sf)
                }
                .font(.sans(16))
                .tint(Palette.ac)
                .scrollContentBackground(.hidden)
                .background(Palette.canvas.ignoresSafeArea())
                .navigationTitle("The flight there")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Next") { chosen = to.trimmed }
                            .fontWeight(.semibold)
                            .disabled(from.trimmed.isEmpty || to.trimmed.isEmpty)
                    }
                }
            }
            .presentationBackground(Palette.canvas)
            .presentationCornerRadius(Radius.r)
        }
    }
}
