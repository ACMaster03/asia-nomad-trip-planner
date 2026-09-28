import SwiftUI

// Editing the journey, the iPhone way (Patrik, 27 Sep, from the mock): the stop
// page is where you look; Edit and every row open a form sheet with Cancel and
// Save. The fields and what a save writes follow the web's StopSheet, StaySheet
// and LegSheet (components/trips/) and Timeline.tsx saveStop/saveStay/saveLeg,
// so a journey edited on either reads the same on both.

// MARK: - what to edit

enum EditTarget: Identifiable {
    case stop(Segment)
    case addStop
    /// After "the flight there": the place it lands, filled in, from the flight's day.
    case firstStop(city: String, arrive: String)
    /// `range`: the nights to fill in when adding (an amber gap), else the stop's dates.
    case stay(Stay?, seg: Segment, range: Journey.NightRange?)
    /// From, to and the day come from the leg, as on the web.
    case transport(TransportLeg?, from: String, to: String, date: String)

    var id: String {
        switch self {
        case .stop(let s): "stop-\(s.id)"
        case .addStop: "add-stop"
        case .firstStop(let city, _): "first-stop-\(city)"
        case .stay(let st, let seg, let r): "stay-\(st?.id ?? "new")-\(seg.id)-\(r?.from ?? "")"
        case .transport(let t, let from, let to, _): "transport-\(t?.id ?? "new")-\(from)-\(to)"
        }
    }
}

/// Which sheet is open. Lives in the shell so any Trip screen can open one.
@MainActor
@Observable
final class TripEditor {
    var target: EditTarget?
    func open(_ target: EditTarget) { self.target = target }
}

struct EditSheet: View {
    let target: EditTarget
    @Environment(TripStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        if let state = store.trip?.state {
            switch target {
            case .stop(let seg): StopForm(seg: seg, state: state)
            case .addStop: StopForm(seg: nil, state: state)
            case .firstStop(let city, let arrive): StopForm(seg: nil, state: state, city: city, arrive: arrive)
            case .stay(let stay, let seg, let range): StayForm(stay: stay, seg: seg, range: range, state: state)
            case .transport(let entry, let from, let to, let date):
                TransportForm(entry: entry, from: from, to: to, legDate: date, state: state)
            }
        } else {
            // The journey went away under the sheet (signed out, or it was the
            // last one): an empty sheet would just sit there, so close it.
            Color.clear.onAppear { dismiss() }
        }
    }
}

/// A button that opens an editor when the trip can be edited, and plain content otherwise.
struct EditTap<Content: View>: View {
    let target: EditTarget
    @ViewBuilder var content: Content
    @Environment(TripEditor.self) private var editor
    @Environment(TripStore.self) private var store

    var body: some View {
        if store.canEdit {
            Button { editor.open(target) } label: { content.contentShape(.rect) }
                .buttonStyle(.plain)
        } else {
            content
        }
    }
}

// MARK: - the sheet around every form

/// The red button at the bottom of a form and the question it asks first.
struct EditDelete {
    let label: LocalizedStringKey
    let question: LocalizedStringKey
    var message: LocalizedStringKey?
    var confirm: LocalizedStringKey = "Delete"
    let action: () async throws -> Void
}

/// Cancel and Save in the bar, Save grey until there's something to save,
/// "Discard changes?" instead of losing an edit to a swipe, the travel loader
/// while it saves, and the reason in amber if it couldn't.
struct EditForm<Content: View>: View {
    let title: Text
    let canSave: Bool
    let dirty: Bool
    let saveLabel: LocalizedStringKey
    let save: () async throws -> Void
    let delete: EditDelete?
    let content: Content

    init(title: LocalizedStringKey, canSave: Bool, dirty: Bool, saveLabel: LocalizedStringKey = "Save",
         save: @escaping () async throws -> Void, delete: EditDelete? = nil, @ViewBuilder content: () -> Content) {
        self.init(text: Text(title), canSave: canSave, dirty: dirty, saveLabel: saveLabel, save: save, delete: delete, content: content)
    }

    /// A title from data (a city, "Hanoi → Hue"), shown as it is.
    init(verbatimTitle title: String, canSave: Bool, dirty: Bool, saveLabel: LocalizedStringKey = "Save",
         save: @escaping () async throws -> Void, delete: EditDelete? = nil, @ViewBuilder content: () -> Content) {
        self.init(text: Text(verbatim: title), canSave: canSave, dirty: dirty, saveLabel: saveLabel, save: save, delete: delete, content: content)
    }

    private init(text: Text, canSave: Bool, dirty: Bool, saveLabel: LocalizedStringKey,
                 save: @escaping () async throws -> Void, delete: EditDelete?, @ViewBuilder content: () -> Content) {
        self.title = text
        self.canSave = canSave
        self.dirty = dirty
        self.saveLabel = saveLabel
        self.save = save
        self.delete = delete
        self.content = content()
    }

    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDiscard = false
    @State private var confirmDelete = false
    @State private var work: Task<Void, Never>?
    @State private var done = 0

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section {
                        Text(error).font(.sans(15)).foregroundStyle(Palette.warn)
                    }
                    .listRowBackground(Palette.warnSoft)
                }
                content
                if let delete {
                    Section {
                        Button(delete.label, role: .destructive) { confirmDelete = true }
                            .frame(maxWidth: .infinity)
                            .disabled(busy)
                    }
                    .listRowBackground(Palette.sf)
                }
            }
            .font(.sans(16))
            .tint(Palette.ac)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(Palette.canvas.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if busy { work?.cancel(); busy = false }
                        else if dirty { confirmDiscard = true }
                        else { dismiss() }
                    }
                }
                // The number pad has no return key of its own.
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                    .fontWeight(.semibold)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        TravelLoader(width: 44)
                    } else {
                        Button(saveLabel) { run(save) }
                            .fontWeight(.semibold)
                            .disabled(!canSave)
                    }
                }
            }
            .confirmationDialog("Discard changes?", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
            .confirmationDialog(delete.map { Text($0.question) } ?? Text(verbatim: ""), isPresented: $confirmDelete, titleVisibility: .visible) {
                if let delete {
                    Button(delete.confirm, role: .destructive) { run(delete.action) }
                    Button("Cancel", role: .cancel) {}
                }
            } message: {
                if let message = delete?.message { Text(message) }
            }
        }
        .interactiveDismissDisabled(dirty || busy)
        .presentationBackground(Palette.canvas)
        .presentationCornerRadius(Radius.r)
        .sensoryFeedback(.success, trigger: done)
    }

    private func run(_ op: @escaping () async throws -> Void) {
        busy = true
        error = nil
        work = Task {
            do {
                try await op()
                done += 1
                dismiss()
            } catch is CancellationError {
                busy = false
            } catch {
                self.error = error.localizedDescription
                busy = false
            }
        }
    }
}

// MARK: - stop

private struct StopForm: View {
    let seg: Segment?
    let state: TripState
    @Environment(TripStore.self) private var store

    @State private var city: String
    @State private var country: String
    @State private var arrive: String
    @State private var depart: String
    @State private var tier: Int
    @State private var inPlan: Bool
    @State private var notes: String

    init(seg: Segment?, state: TripState, city: String = "", arrive: String = "") {
        self.seg = seg
        self.state = state
        let tl = Journey.timeline(state)
        _city = State(initialValue: seg?.city ?? city)
        _country = State(initialValue: seg?.country ?? "")
        _arrive = State(initialValue: seg?.arrive ?? (arrive.isEmpty ? (tl.stops.last?.depart ?? state.meta.startDate ?? "") : arrive))
        _depart = State(initialValue: seg?.depart ?? "")
        _tier = State(initialValue: Int(seg?.tier ?? 1))
        _inPlan = State(initialValue: seg?.inPlan ?? true)
        _notes = State(initialValue: seg?.notes ?? "")
    }

    private var nights: Int { Days.between(arrive, depart) }

    private var dirty: Bool {
        guard let seg else { return !city.trimmed.isEmpty || !depart.isEmpty }
        return arrive != seg.arrive || depart != seg.depart || tier != Int(seg.tier ?? 1)
            || inPlan != seg.inPlan || notes != (seg.notes ?? "")
    }

    private var valid: Bool {
        (seg != nil || !city.trimmed.isEmpty) && !arrive.isEmpty && !depart.isEmpty && depart >= arrive
    }

    /// The leg after this stop.
    private var nextLeg: Journey.Leg? {
        guard let seg else { return nil }
        return Journey.timeline(state).legs.first(where: { $0.from.seg?.id == seg.id })
    }

    var body: some View {
        EditForm(
            verbatimTitle: seg.map { $0.city.isEmpty ? String(localized: "Stop") : $0.city } ?? String(localized: "Add stop"),
            canSave: valid && dirty,
            dirty: dirty,
            saveLabel: seg == nil ? "Add" : "Save",
            save: save,
            delete: seg.map { seg in
                EditDelete(label: "Delete this stop",
                      question: seg.city.isEmpty ? "Delete this stop?" : "Delete \(seg.city)?",
                      message: "Its stays and transport stay on the trip; the legs on either side become one.",
                      action: { try await store.save { $0.remove("segments", id: seg.id) } })
            }
        ) {
            if seg == nil {
                Section {
                    TextField("City", text: $city).textContentType(.addressCity)
                    TextField("Country", text: $country).textContentType(.countryName)
                }
                .listRowBackground(Palette.sf)
            }
            Section {
                DateRangeRow(fromLabel: "Arrive", toLabel: "Leave", from: $arrive, to: $depart, startOpen: seg == nil)
            } footer: {
                Text(hint)
            }
            .listRowBackground(Palette.sf)
            Section("Comfort") {
                Picker("Comfort", selection: $tier) {
                    // The tiers have keys of their own: "Budget" alone is Money's spending
                    // cap ("Keret"), and "Comfort" is also this section's title.
                    Text(String(localized: "tier.budget", defaultValue: "Budget")).tag(0)
                    Text(String(localized: "tier.mid", defaultValue: "Mid")).tag(1)
                    Text(String(localized: "tier.comfort", defaultValue: "Comfort")).tag(2)
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
            }
            .listRowBackground(Palette.sf)
            Section {
                Toggle("In the plan", isOn: $inPlan)
            } footer: {
                inPlan ? Text("Its nights and costs count in the plan.") : Text("A maybe: shown faded on the timeline, with no legs of its own.")
            }
            .listRowBackground(Palette.sf)
            Section("Note") {
                TextField("Optional", text: $notes, axis: .vertical).lineLimit(1...6)
            }
            .listRowBackground(Palette.sf)
        }
    }

    private var hint: String {
        guard !arrive.isEmpty, !depart.isEmpty else { return depart.isEmpty ? String(localized: "Choose the day you leave.") : "" }
        guard depart >= arrive else { return String(localized: "Leave can’t be before arrive.") }
        var s = String(localized: "\(nights) nights.")
        if let seg, depart != seg.depart, let next = nextLeg {
            s += " " + (next.wayHome ? String(localized: "Moving Leave moves the home leg with it.")
                                     : String(localized: "Moving Leave moves the \(next.to.city) leg with it."))
        }
        return s
    }

    private func save() async throws {
        if let seg {
            var fields: [String: JSONValue?] = [
                "arrive": .string(arrive), "depart": .string(depart), "tier": .number(Double(tier)),
            ]
            if notes != (seg.notes ?? "") { fields["notes"] = .string(notes) }
            if inPlan != seg.inPlan { fields["include"] = .bool(inPlan) }
            let oldDepart = seg.depart, newDepart = depart, city = seg.city
            try await store.save { doc in
                doc.upsert("segments", id: seg.id, fields)
                // Moving Leave moves the leg after this stop with it (web shiftDepartures).
                if !oldDepart.isEmpty, oldDepart != newDepart {
                    doc.update("transport", where: {
                        Journey.sameCity($0["from"]?.stringValue, city) && ($0["date"]?.stringValue ?? "").prefix(10) == oldDepart
                    }) { $0["date"] = .string(newDepart) }
                }
            }
        } else {
            let fields: [String: JSONValue?] = [
                "city": .string(city.trimmed), "country": .string(country.trimmed), "tier": .number(Double(tier)),
                "arrive": .string(arrive), "depart": .string(depart), "notes": .string(notes),
                "include": .bool(inPlan), "color": .string(""),
            ]
            try await store.save { $0.upsert("segments", id: newId("sg"), fields) }
        }
    }
}

// MARK: - stay

private struct StayForm: View {
    let stay: Stay?
    let seg: Segment
    let state: TripState
    @Environment(TripStore.self) private var store

    private static let platforms = ["Booking.com", "Airbnb", "Other"]

    @State private var name: String
    @State private var platform: String
    @State private var platformOther: String
    @State private var checkIn: String
    @State private var checkOut: String
    @State private var amount: String
    @State private var cur: String
    @State private var booked: Bool
    @State private var count: Bool
    @State private var cancelUntil: String
    @State private var noFreeCancel: Bool
    @State private var chargeAtCheckIn: Bool
    @State private var chargeDate: String
    @State private var remind: Bool
    @State private var url: String
    @State private var notes: String
    private let initial: [String]
    /// A stay left unticked on the old Stays tab: it keeps not counting until told otherwise.
    private let legacyUncounted: Bool

    init(stay: Stay?, seg: Segment, range: Journey.NightRange?, state: TripState) {
        self.stay = stay
        self.seg = seg
        self.state = state
        let r = stay.flatMap { Journey.stayRange($0, seg) } ?? range
        let known = stay?.platform.map { Self.platforms.contains($0) && $0 != "Other" } ?? true
        let atCheckIn: Bool = stay?.chargeAtCheckIn == true
        var values: [String] = []
        values.append(stay?.name ?? "")
        values.append(stay == nil ? "Booking.com" : (known ? (stay?.platform ?? "Booking.com") : "Other"))
        values.append(known ? "" : (stay?.platform ?? ""))
        values.append(r?.from ?? seg.arrive)
        values.append(r?.to ?? seg.depart)
        values.append((stay?.ppn ?? 0) > 0 ? Price.text(stay?.ppn ?? 0) : "")
        values.append(stay?.cur ?? Price.defaultCurrency(state))
        values.append(stay != nil && Journey.isBooked(stay?.status) ? "1" : "")
        values.append(stay == nil || stay?.include == true ? "1" : "")
        values.append(stay?.cancelUntil ?? "")
        values.append(stay?.noFreeCancel == true ? "1" : "")
        values.append(atCheckIn ? "1" : "")
        values.append(atCheckIn ? "" : (stay?.chargeDate ?? ""))
        values.append(stay?.remind == false ? "" : "1")
        values.append(stay?.url ?? "")
        values.append(stay?.notes ?? "")
        initial = values
        legacyUncounted = stay != nil && stay?.include != true
        _name = State(initialValue: values[0])
        _platform = State(initialValue: values[1])
        _platformOther = State(initialValue: values[2])
        _checkIn = State(initialValue: values[3])
        _checkOut = State(initialValue: values[4])
        _amount = State(initialValue: values[5])
        _cur = State(initialValue: values[6])
        _booked = State(initialValue: values[7] == "1")
        _count = State(initialValue: values[8] == "1")
        _cancelUntil = State(initialValue: values[9])
        _noFreeCancel = State(initialValue: values[10] == "1")
        _chargeAtCheckIn = State(initialValue: values[11] == "1")
        _chargeDate = State(initialValue: values[12])
        _remind = State(initialValue: values[13] == "1")
        _url = State(initialValue: values[14])
        _notes = State(initialValue: values[15])
    }

    private var current: [String] {
        [name, platform, platformOther, checkIn, checkOut, amount, cur, booked ? "1" : "", count ? "1" : "",
         cancelUntil, noFreeCancel ? "1" : "", chargeAtCheckIn ? "1" : "", chargeDate, remind ? "1" : "", url, notes]
    }

    private var dirty: Bool { current != initial }
    private var nights: Int { Days.between(checkIn, checkOut) }
    private var valid: Bool { !name.trimmed.isEmpty && nights > 0 }
    private var remindRow: Bool { booked && !cancelUntil.isEmpty && !noFreeCancel }

    var body: some View {
        EditForm(
            title: stay == nil ? "Add stay" : "Edit stay",
            canSave: valid && dirty,
            dirty: dirty,
            saveLabel: stay == nil ? "Add" : "Save",
            save: save,
            delete: stay.map { stay in
                EditDelete(label: "Delete this stay", question: "Delete this stay?",
                      action: { try await store.save { $0.remove("stays", id: stay.id) } })
            }
        ) {
            Section {
                TextField("Where you sleep", text: $name)
                Picker("Platform", selection: $platform) {
                    ForEach(Self.platforms, id: \.self) { Text($0 == "Other" ? String(localized: "Other") : $0).tag($0) }
                }
                .pickerStyle(.menu)
                .menuSettles(on: platform)
                if platform == "Other" {
                    TextField("The hotel’s site, a friend, …", text: $platformOther)
                }
            } header: {
                Text(verbatim: "\(seg.city) · \(Days.short(checkIn)) – \(Days.short(checkOut))")
            }
            .listRowBackground(Palette.sf)

            Section {
                DateRangeRow(fromLabel: "Check-in", toLabel: "Check-out", from: $checkIn, to: $checkOut)
            } footer: {
                nights > 0 ? Text("\(nights) nights") : Text("Check-out has to be after check-in.")
            }
            .listRowBackground(Palette.sf)

            Section {
                PriceRow(label: "Per night", amount: $amount, cur: $cur, currencies: Price.currencies(state, cur))
            } footer: {
                let perNight = Journey.toBase(Price.value(amount), cur, state.rates)
                if perNight > 0 {
                    let base = state.meta.baseCurrency
                    Text("≈ \(Journey.money(perNight, base)) a night · ≈ \(Journey.money(perNight * Double(nights), base)) in total")
                }
            }
            .listRowBackground(Palette.sf)

            Section {
                Picker("State", selection: $booked) {
                    Text("Idea").tag(false)
                    Text("Booked").tag(true)
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                if legacyUncounted && !booked {
                    Toggle("Count this idea in the plan", isOn: $count)
                }
            }
            .listRowBackground(Palette.sf)

            if booked {
                Section {
                    if !noFreeCancel {
                        OptionalDateRow(label: "Free cancellation until", iso: $cancelUntil, suggested: Days.add(checkIn, -7))
                    }
                    Toggle("No free cancellation", isOn: $noFreeCancel)
                    Picker("Card charged", selection: $chargeAtCheckIn) {
                        Text("On a date").tag(false)
                        Text("At check-in").tag(true)
                    }
                    .pickerStyle(.menu)
                    .menuSettles(on: chargeAtCheckIn)
                    if !chargeAtCheckIn {
                        OptionalDateRow(label: "Charged on", iso: $chargeDate, suggested: Days.today())
                    }
                    if remindRow {
                        Toggle("Remind me before it’s non-refundable", isOn: $remind)
                    }
                } header: {
                    Text("Deadlines")
                } footer: {
                    if remindRow, remind {
                        Text("On Home from \(Days.short(Days.add(cancelUntil, -7))), and by email 7, 3 and 1 days before.")
                    }
                }
                .listRowBackground(Palette.sf)
            }

            Section {
                TextField("Booking / Airbnb link", text: $url)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Note", text: $notes, axis: .vertical).lineLimit(1...6)
            }
            .listRowBackground(Palette.sf)
        }
    }

    private func save() async throws {
        let include = booked ? true : (legacyUncounted ? count : true)
        let fields: [String: JSONValue?] = [
            "segId": .string(seg.id),
            "name": .string(name.trimmed),
            "platform": .string(platform == "Other" ? (platformOther.trimmed.isEmpty ? "Other" : platformOther.trimmed) : platform),
            "url": .string(url),
            "cur": .string(cur),
            "ppn": .number(Price.value(amount)),
            "nights": nil, // the dates carry the nights now
            "checkIn": .string(checkIn),
            "checkOut": .string(checkOut),
            "status": .string(booked ? "booked" : "idea"),
            "include": .bool(include),
            "cancelUntil": .string(noFreeCancel ? "" : cancelUntil),
            "noFreeCancel": .bool(noFreeCancel),
            "chargeDate": .string(chargeAtCheckIn ? checkIn : chargeDate),
            "chargeAtCheckIn": .bool(chargeAtCheckIn),
            "remind": .bool(remind),
            "notes": .string(notes),
        ]
        let id = stay?.id ?? newId("st")
        try await store.save { $0.upsert("stays", id: id, fields) }
    }
}

// MARK: - transport

private struct TransportForm: View {
    let entry: TransportLeg?
    let from: String
    let to: String
    let legDate: String
    let state: TripState
    @Environment(TripStore.self) private var store

    private static let types: [(name: String, symbol: String)] = [
        ("Flight", "airplane"), ("Train", "tram.fill"), ("Bus", "bus.fill"), ("Ferry", "ferry.fill"), ("Other", "ellipsis"),
    ]

    @State private var type: String
    @State private var otherType: String
    @State private var date: String
    @State private var time: String
    @State private var showVia: Bool
    @State private var via: String
    @State private var hours: String
    @State private var amount: String
    @State private var cur: String
    @State private var booked: Bool
    @State private var chargeDate: String
    @State private var url: String
    private let initial: [String]

    init(entry: TransportLeg?, from: String, to: String, legDate: String, state: TripState) {
        self.entry = entry
        self.from = from
        self.to = to
        self.legDate = legDate
        self.state = state
        let known = Self.types.first { $0.name.lowercased() == (entry?.type ?? "").lowercased() }?.name
        let typed: String = entry?.type ?? ""
        var values: [String] = []
        values.append(known ?? (typed.isEmpty ? "Flight" : "Other"))
        values.append(known == nil ? typed : "")
        values.append(entry?.date ?? legDate)
        values.append(entry?.time ?? "")
        values.append((entry?.via ?? "").isEmpty ? "" : "1")
        values.append(entry?.via ?? "")
        values.append(entry?.hours == nil ? "" : Price.text(entry?.hours ?? 0))
        values.append((entry?.price ?? 0) > 0 ? Price.text(entry?.price ?? 0) : "")
        values.append(entry?.cur ?? Price.defaultCurrency(state))
        values.append(entry != nil && Journey.isBooked(entry?.status) ? "1" : "")
        values.append(entry?.chargeDate ?? "")
        values.append(entry?.url ?? "")
        initial = values
        _type = State(initialValue: values[0])
        _otherType = State(initialValue: values[1])
        _date = State(initialValue: values[2])
        _time = State(initialValue: values[3])
        _showVia = State(initialValue: values[4] == "1")
        _via = State(initialValue: values[5])
        _hours = State(initialValue: values[6])
        _amount = State(initialValue: values[7])
        _cur = State(initialValue: values[8])
        _booked = State(initialValue: values[9] == "1")
        _chargeDate = State(initialValue: values[10])
        _url = State(initialValue: values[11])
    }

    private var current: [String] {
        [type, otherType, date, time, showVia ? "1" : "", via, hours, amount, cur, booked ? "1" : "", chargeDate, url]
    }

    private var dirty: Bool { current != initial || entry == nil }
    private var isFlight: Bool { type == "Flight" }

    var body: some View {
        EditForm(
            verbatimTitle: from + " → " + to,
            canSave: !from.isEmpty && !to.isEmpty && dirty,
            dirty: entry == nil ? current != initial : dirty,
            saveLabel: entry == nil ? "Add" : "Save",
            save: save,
            delete: entry.map { entry in
                EditDelete(label: "Remove transport", question: "Remove this transport?", confirm: "Remove",
                      action: { try await store.save { $0.remove("transport", id: entry.id) } })
            }
        ) {
            Section {
                HStack(spacing: 6) {
                    ForEach(Self.types, id: \.name) { t in
                        let on = type == t.name
                        Button { withAnimation(Motion.quick) { type = t.name } } label: {
                            VStack(spacing: 4) {
                                Image(systemName: t.symbol).font(.system(size: 17, weight: .semibold))
                                Text(TransportIcon.name(t.name)).font(.sans(12, weight: on ? .semibold : .medium))
                            }
                            .foregroundStyle(on ? Palette.ac2Deep : Palette.tx2)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(on ? Palette.ac2Soft : Palette.fill, in: .rect(cornerRadius: 12))
                            .overlay {
                                if on { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.ac2Line, lineWidth: 1.5) }
                            }
                        }
                        .buttonStyle(.borderless)
                        .sensoryFeedback(.selection, trigger: on) { _, now in now }
                    }
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 10, bottom: 10, trailing: 10))
                if type == "Other" {
                    TextField("Car, boat, …", text: $otherType)
                }
            } header: {
                if !legDate.isEmpty { Text("Leaves \(from) · \(Days.short(legDate))") }
            }
            .listRowBackground(Palette.sf)

            Section {
                OptionalDateRow(label: "Departs", iso: $date, suggested: legDate)
                OptionalTimeRow(label: "Time", hhmm: $time)
                if isFlight {
                    if showVia {
                        TextField("Via", text: $via)
                        HStack {
                            Text("Hours")
                            Spacer()
                            TextField("14.5", text: $hours)
                                .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: 110)
                        }
                    } else {
                        Button("Add a connection") { withAnimation(Motion.quick) { showVia = true } }
                    }
                }
            }
            .listRowBackground(Palette.sf)

            Section {
                PriceRow(label: "Price", amount: $amount, cur: $cur, currencies: Price.currencies(state, cur))
            } footer: {
                let base = Journey.toBase(Price.value(amount), cur, state.rates)
                base > 0 && cur != state.meta.baseCurrency
                    ? Text("For everyone · ≈ \(Journey.money(base, state.meta.baseCurrency))")
                    : Text("For everyone")
            }
            .listRowBackground(Palette.sf)

            Section {
                Picker("State", selection: $booked) {
                    Text("Idea").tag(false)
                    Text("Booked").tag(true)
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                if booked {
                    OptionalDateRow(label: "Card charged on", iso: $chargeDate, suggested: Days.today())
                }
            } footer: {
                booked ? Text("Blank means the travel date. Fares are usually paid at booking.") : Text("Booked adds the charge date and draws the leg solid.")
            }
            .listRowBackground(Palette.sf)

            Section {
                TextField("Booking link", text: $url)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            .listRowBackground(Palette.sf)
        }
    }

    private func save() async throws {
        let withVia = isFlight && showVia
        let fields: [String: JSONValue?] = [
            "type": .string(type == "Other" ? (otherType.trimmed.isEmpty ? "Other" : otherType.trimmed) : type),
            "from": .string(from),
            "to": .string(to),
            "date": .string(date),
            "time": .string(time),
            "via": .string(withVia ? via.trimmed : ""),
            "hours": withVia && !hours.trimmed.isEmpty ? .number(Price.value(hours)) : nil,
            "url": .string(url),
            "cur": .string(cur),
            "price": .number(Price.value(amount)),
            "status": .string(booked ? "booked" : "idea"),
            // An idea with a price forecasts it, booked is owed: every entry counts.
            "include": .bool(true),
            "chargeDate": .string(booked ? chargeDate : ""),
            "notes": .string(entry?.notes ?? ""),
        ]
        let id = entry?.id ?? newId("tr")
        try await store.save { $0.upsert("transport", id: id, fields) }
    }
}

// MARK: - fields

/// Amounts typed on a phone: "1 100", "1100,50" and "1100.5" all read.
enum Price {
    static func value(_ text: String) -> Double {
        Double(text.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00A0}", with: "")
            .replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    static func text(_ n: Double) -> String {
        n.rounded() == n ? String(Int(n)) : String(n)
    }

    /// The trip's currencies, the base first; USD is the default when the trip has it (sheetKit).
    static func currencies(_ state: TripState, _ current: String) -> [String] {
        var set = Set(state.rates.keys)
        set.insert(state.meta.baseCurrency)
        set.insert(current)
        return [state.meta.baseCurrency] + set.subtracting([state.meta.baseCurrency]).sorted()
    }

    static func defaultCurrency(_ state: TripState) -> String {
        state.rates["USD"] != nil ? "USD" : state.meta.baseCurrency
    }
}

struct PriceRow: View {
    let label: LocalizedStringKey
    @Binding var amount: String
    @Binding var cur: String
    let currencies: [String]

    var body: some View {
        HStack(spacing: 10) {
            Text(label)
            Spacer(minLength: 8)
            TextField("0", text: $amount)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .frame(maxWidth: 130)
            Picker(label, selection: $cur) {
                ForEach(currencies, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .fixedSize()
            .menuSettles(on: cur)
        }
    }
}

/// A date that may be blank: "Add" until chosen, then iOS's compact picker and a clear button.
struct OptionalDateRow: View {
    let label: LocalizedStringKey
    @Binding var iso: String
    var suggested: String = ""

    var body: some View {
        if iso.isEmpty {
            Button {
                iso = suggested.isEmpty ? Days.today() : suggested
            } label: {
                HStack {
                    Text(label).foregroundStyle(Palette.tx)
                    Spacer()
                    Text("Add").foregroundStyle(Palette.ac)
                }
            }
        } else {
            HStack(spacing: 8) {
                DatePicker(label, selection: date, displayedComponents: .date)
                    .environment(\.timeZone, Days.utc)
                Button { iso = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.tx3)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Text("Clear \(Text(label))"))
            }
        }
    }

    private var date: Binding<Date> {
        Binding(get: { Days.date(iso) ?? .now }, set: { iso = Days.iso($0) })
    }
}

private struct OptionalTimeRow: View {
    let label: LocalizedStringKey
    @Binding var hhmm: String

    var body: some View {
        if hhmm.isEmpty {
            Button { hhmm = "12:00" } label: {
                HStack {
                    Text(label).foregroundStyle(Palette.tx)
                    Spacer()
                    Text("Add").foregroundStyle(Palette.ac)
                }
            }
        } else {
            HStack(spacing: 8) {
                DatePicker(label, selection: time, displayedComponents: .hourAndMinute)
                    .environment(\.timeZone, Days.utc)
                Button { hhmm = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.tx3)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Text("Clear \(Text(label))"))
            }
        }
    }

    private var time: Binding<Date> {
        Binding(
            get: {
                let p = hhmm.split(separator: ":").compactMap { Int($0) }
                let minutes = (p.first ?? 12) * 60 + (p.count > 1 ? p[1] : 0)
                return Date(timeIntervalSince1970: TimeInterval(minutes * 60))
            },
            set: {
                let m = Int($0.timeIntervalSince1970.truncatingRemainder(dividingBy: 86_400)) / 60
                hhmm = String(format: "%02d:%02d", (m / 60 + 24) % 24, (m % 60 + 60) % 60)
            }
        )
    }
}

// MARK: - dates as a range

/// One "Dates" row that opens an inline calendar: pick which end you're
/// setting, tap a day. Leave is picked first when editing, the usual change.
private struct DateRangeRow: View {
    let fromLabel: LocalizedStringKey
    let toLabel: LocalizedStringKey
    @Binding var from: String
    @Binding var to: String
    var startOpen = false

    @State private var open: Bool?
    @State private var settingEnd = true

    var body: some View {
        let isOpen = open ?? startOpen
        Button {
            withAnimation(Motion.quick) { open = !isOpen }
        } label: {
            HStack {
                Text("Dates").foregroundStyle(Palette.tx)
                Spacer()
                Text(summary)
                    .monospacedDigit()
                    .foregroundStyle(isOpen ? Palette.ac : Palette.tx2)
            }
        }
        if isOpen {
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    end(fromLabel, from, isEnd: false)
                    end(toLabel, to, isEnd: true)
                }
                RangeCalendar(from: $from, to: $to, settingEnd: $settingEnd)
            }
            .padding(.vertical, 6)
        }
    }

    private var summary: String {
        guard !from.isEmpty else { return String(localized: "Choose") }
        return "\(Days.short(from)) → \(to.isEmpty ? "…" : Days.short(to))"
    }

    private func end(_ label: LocalizedStringKey, _ iso: String, isEnd: Bool) -> some View {
        let on = settingEnd == isEnd
        return Button { settingEnd = isEnd } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.sans(12, weight: .medium)).foregroundStyle(on ? Palette.ac : Palette.tx3)
                Text(iso.isEmpty ? "—" : Days.short(iso)).font(.sans(16, weight: .semibold)).foregroundStyle(Palette.tx)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(on ? Palette.acSoft : Palette.fill, in: .rect(cornerRadius: 12))
            .overlay {
                if on { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.acLine, lineWidth: 1.5) }
            }
        }
        .buttonStyle(.borderless)
    }
}

/// A month grid in Apple's calendar style with the chosen nights as one band.
private struct RangeCalendar: View {
    @Binding var from: String
    @Binding var to: String
    @Binding var settingEnd: Bool
    @State private var month: String
    @State private var taps = 0

    init(from: Binding<String>, to: Binding<String>, settingEnd: Binding<Bool>) {
        _from = from
        _to = to
        _settingEnd = settingEnd
        let anchor = settingEnd.wrappedValue && !to.wrappedValue.isEmpty ? to.wrappedValue
            : (from.wrappedValue.isEmpty ? Days.today() : from.wrappedValue)
        _month = State(initialValue: String(anchor.prefix(8)) + "01")
    }

    /// In the app's language, not the phone's: Hungarian on an English phone
    /// shows Hungarian weekday letters.
    private static let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = Days.utc
        cal.locale = L10n.locale
        return cal
    }()

    private var cells: [String?] {
        guard let first = Days.date(month) else { return [] }
        let cal = Self.calendar
        let weekday = cal.component(.weekday, from: first)
        let lead = (weekday - cal.firstWeekday + 7) % 7
        let count = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        return Array(repeating: nil, count: lead) + (0..<count).map { Days.add(month, $0) }
    }

    private var weeks: [[String?]] {
        var all = cells
        while all.count % 7 != 0 { all.append(nil) }
        return stride(from: 0, to: all.count, by: 7).map { Array(all[$0..<$0 + 7]) }
    }

    private var weekdays: [String] {
        let s = Self.calendar.veryShortStandaloneWeekdaySymbols
        let k = Self.calendar.firstWeekday - 1
        return Array(s[k...] + s[..<k])
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(Days.monthTitle(month)).font(.sans(16, weight: .semibold)).foregroundStyle(Palette.tx)
                Spacer()
                Button { month = Days.addMonths(month, -1) } label: { Image(systemName: "chevron.left").frame(width: 36, height: 30) }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Previous month")
                Button { month = Days.addMonths(month, 1) } label: { Image(systemName: "chevron.right").frame(width: 36, height: 30) }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Next month")
            }
            .foregroundStyle(Palette.ac)
            // Plain rows of weeks, fixed heights: a lazy grid inside a form row
            // sends the list into a layout loop.
            HStack(spacing: 0) {
                ForEach(Array(weekdays.enumerated()), id: \.offset) { _, d in
                    Text(d).font(.sans(12, weight: .medium)).foregroundStyle(Palette.tx3)
                        .frame(maxWidth: .infinity).frame(height: 22)
                }
            }
            let weeks = weeks
            VStack(spacing: 0) {
                ForEach(weeks.indices, id: \.self) { w in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { d in
                            if let day = weeks[w][d] { cell(day) } else { Color.clear.frame(maxWidth: .infinity).frame(height: 40) }
                        }
                    }
                }
            }
            .frame(height: CGFloat(weeks.count) * 40)
        }
        .sensoryFeedback(.selection, trigger: taps)
    }

    private func cell(_ day: String) -> some View {
        let isFrom = day == from, isTo = day == to
        let hasRange = !from.isEmpty && !to.isEmpty && to > from
        let inside = hasRange && day > from && day < to
        let today = day == Days.today()
        return ZStack {
            HStack(spacing: 0) {
                Palette.acSoft.opacity(inside || (isTo && hasRange) ? 1 : 0)
                Palette.acSoft.opacity(inside || (isFrom && hasRange) ? 1 : 0)
            }
            .frame(height: 34)
            if isFrom || isTo {
                Circle().fill(Palette.ac).frame(width: 34, height: 34)
            }
            Text("\(Int(day.suffix(2)) ?? 0)")
                .font(.sans(16, weight: isFrom || isTo || today ? .semibold : .regular))
                .monospacedDigit()
                .foregroundStyle(isFrom || isTo ? Palette.on : today ? Palette.ac : inside ? Palette.ac : Palette.tx)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 40)
        .contentShape(.rect)
        .onTapGesture { pick(day) }
        .accessibilityElement()
        .accessibilityLabel(Days.short(day))
        .accessibilityAddTraits(isFrom || isTo ? [.isButton, .isSelected] : .isButton)
    }

    private func pick(_ day: String) {
        taps += 1
        if settingEnd {
            if from.isEmpty || day <= from {
                // Before the start: it becomes the new start.
                from = day
                to = ""
            } else {
                to = day
            }
        } else {
            from = day
            if !to.isEmpty, to <= day { to = "" }
            settingEnd = true
        }
    }
}

extension Days {
    static let utc = TimeZone(identifier: "UTC")!

    static func iso(_ date: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = utc
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// "October 2026"
    static func monthTitle(_ iso: String) -> String {
        guard let d = date(iso) else { return "" }
        let f = DateFormatter()
        f.locale = L10n.isEnglish ? Locale(identifier: "en_GB") : L10n.locale
        f.timeZone = utc
        f.setLocalizedDateFormatFromTemplate("LLLLyyyy")
        return f.string(from: d)
    }

    static func addMonths(_ iso: String, _ n: Int) -> String {
        guard let d = date(iso) else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = utc
        return cal.date(byAdding: .month, value: n, to: d).map(Days.iso) ?? iso
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
