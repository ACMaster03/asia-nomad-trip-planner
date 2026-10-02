import SwiftUI

// Reminders (Patrik, 2 Oct, after build 19): Home's card leads here, and so does
// its slim row when nothing is due. The page is laid out like Subscriptions:
// cards of rows, the amount on the right. Money reminders carry no dot; the
// amount says what they are. Each subscription adds only its next charge, not
// one per month.

/// A reminder as Home and the page show it (reminders.ts deriveReminders, plus
/// the next charge of each subscription): yours from `state.reminders`, the
/// money ones worked out from booked stays and active subscriptions.
struct HomeReminder: Identifiable, Equatable {
    enum Kind { case mine, cancel, charge, subscription }
    /// Where a tap on a money reminder goes.
    enum Opens: Equatable { case stop(String), subscriptions }

    let id: String
    let kind: Kind
    let title: String
    /// The stay a deadline belongs to, before its date.
    var note: String?
    /// In the journey's currency, on the right.
    var amount: String?
    /// Under the amount, as Subscriptions has the cadence there: "card charge", "subscription".
    var caption: String?
    let due: String?
    var doneOn: String?
    let overdue: Bool
    var opens: Opens?

    var done: Bool { doneOn != nil }
    var isMine: Bool { kind == .mine }

    static func derive(_ trip: TripRow, today: String) -> [HomeReminder] {
        var out: [HomeReminder] = []
        if case .array(let list)? = trip.rawState["reminders"] {
            for item in list {
                guard let id = item["id"]?.stringValue, !id.isEmpty else { continue }
                let due = item["due"]?.stringValue.flatMap { $0.isEmpty ? nil : String($0.prefix(10)) }
                let doneOn = item["doneOn"]?.stringValue.flatMap { $0.isEmpty ? nil : String($0.prefix(10)) }
                out.append(HomeReminder(id: id, kind: .mine, title: item["title"]?.stringValue ?? "",
                                        due: due, doneOn: doneOn,
                                        overdue: doneOn == nil && due.map { $0 < today } == true))
            }
        }
        let state = trip.state
        let base = state.meta.baseCurrency
        for st in state.stays where st.include == true && Journey.isBooked(st.status) {
            guard let seg = state.segments.first(where: { $0.id == st.segId }) else { continue }
            let amount = MoneyText.full(Journey.toBase(Journey.stayTotal(st, seg), st.cur, state.rates), base)
            let name = Journey.stayName(st, in: seg)
            if let c = st.cancelUntil, !c.isEmpty, st.remind != false, c >= today {
                out.append(HomeReminder(id: "money-cancel-\(st.id)", kind: .cancel,
                                        title: String(localized: "Free cancellation ends"), note: name, amount: amount,
                                        due: String(c.prefix(10)), overdue: false, opens: .stop(seg.id)))
            }
            if let c = st.chargeDate, !c.isEmpty, c >= today {
                out.append(HomeReminder(id: "money-charge-\(st.id)", kind: .charge,
                                        title: name, amount: amount, caption: String(localized: "card charge"),
                                        due: String(c.prefix(10)), overdue: false, opens: .stop(seg.id)))
            }
        }
        // Only the next charge of each: a monthly one is not twelve reminders.
        if case .array(let subs)? = trip.rawState["subscriptions"] {
            for raw in subs {
                guard let s = Subscription(raw: raw), !s.isCancelled,
                      let next = Subscriptions.nextCharge(s, from: today) else { continue }
                out.append(HomeReminder(id: "money-sub-\(s.id)", kind: .subscription,
                                        title: s.label,
                                        amount: MoneyText.full(Journey.toBase(s.amount, s.cur, state.rates), base),
                                        caption: String(localized: "subscription"),
                                        due: next, overdue: false, opens: .subscriptions))
            }
        }
        return out.sorted { a, b in
            switch (a.due, b.due) {
            case let (x?, y?): x == y ? a.title < b.title : x < y
            case (nil, _?): false
            case (_?, nil): true
            case (nil, nil): a.title < b.title
            }
        }
    }

    /// Home's live rule (reminders.ts comingUp): undone, dated, overdue or due
    /// within a week; overdue first, then soonest.
    static func comingUp(_ all: [HomeReminder], today: String) -> [HomeReminder] {
        all.filter { !$0.done && $0.due != nil && ($0.overdue || Days.between(today, $0.due!) <= 7) }
            .sorted { $0.overdue == $1.overdue ? ($0.due ?? "") < ($1.due ?? "") : $0.overdue }
    }

    /// "17 Sep · in 5 days", "today", "was due 8 Sep · 4 days ago" (reminders.ts dueLabel).
    func dueLabel(today: String) -> String {
        guard let due else { return String(localized: "no date") }
        let days = Days.between(today, due) - Days.between(due, today)
        let date = Days.short(due)
        if days < 0 { return String(localized: "was due \(date) · \(-days) days ago") }
        switch days {
        case 0: return String(localized: "\(date) · today")
        case 1: return String(localized: "\(date) · tomorrow")
        default: return String(localized: "\(date) · in \(days) days")
        }
    }

    /// The row's second line: what it is, then when.
    func line(today: String) -> String {
        if let doneOn { return String(localized: "done \(Days.short(doneOn))") }
        return [note, dueLabel(today: today)].compactMap { $0 }.joined(separator: " · ")
    }
}

/// One reminder: your own with a tick circle, a money one with a card or a
/// calendar; the title and when, the amount on the right.
struct ReminderRow: View {
    let r: HomeReminder
    let today: String
    var onTick: (() -> Void)?
    var onOpen: (() -> Void)?
    @Environment(TripStore.self) private var store

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            leading
            if let onOpen {
                Button(action: onOpen) { content.contentShape(.rect) }.buttonStyle(.plain)
            } else {
                content
            }
        }
        .padding(.vertical, 11)
    }

    private var content: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: r.title).font(.sans(16, weight: .semibold))
                    .foregroundStyle(r.done ? Palette.tx2 : Palette.tx)
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: r.line(today: today)).font(.sans(14))
                    .foregroundStyle(r.overdue && !r.done ? Palette.warn : Palette.tx2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            if let amount = r.amount {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(verbatim: amount).font(.sans(15, weight: .semibold)).foregroundStyle(Palette.tx)
                        .monospacedDigit().lineLimit(1)
                    if let caption = r.caption {
                        Text(verbatim: caption).font(.sans(12.5)).foregroundStyle(Palette.tx2).lineLimit(1)
                    }
                }
                .padding(.top, 1)
            }
            if onOpen != nil {
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Palette.tx3).padding(.top, 5)
            }
        }
    }

    @ViewBuilder private var leading: some View {
        if r.isMine {
            Button { onTick?() } label: {
                ZStack {
                    if r.done {
                        Circle().fill(Palette.ac)
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.on)
                    } else {
                        Circle().strokeBorder(r.overdue ? Palette.warn : Palette.ln3, lineWidth: 2)
                    }
                }
                .frame(width: 24, height: 24)
                .frame(width: 44, height: 44)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(!store.canEdit || onTick == nil)
            .padding(.horizontal, -10)
            .padding(.vertical, -10)
            .accessibilityLabel(r.done ? Text("Mark as not done") : Text("Mark as done"))
        } else {
            Image(systemName: r.kind == .cancel ? "calendar.badge.clock" : "creditcard")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Palette.tx3)
                .frame(width: 24, height: 24)
        }
    }
}

extension TabRouter {
    /// Where a money reminder leads: the stop on Trip, or Subscriptions on Money.
    func open(_ target: HomeReminder.Opens) {
        switch target {
        case .stop(let id):
            paths[.trip] = [.stop(id)]
            select(.trip)
        case .subscriptions:
            paths[.money] = [.moneySubscriptions]
            select(.money)
        }
    }
}

// MARK: - the page

/// Every reminder: overdue, next, done. Opens from Home.
struct RemindersScreen: View {
    @Environment(TripStore.self) private var store
    @Environment(TabRouter.self) private var router
    @State private var editing: ReminderTarget?
    /// A tick's new doneOn from the tap until the save lands.
    @State private var flipped: [String: String?] = [:]

    var body: some View {
        Group {
            if let trip = store.trip {
                content(trip, today: Days.today())
            } else {
                Color.clear
            }
        }
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("Reminders")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if store.canEdit {
                ToolbarItem(placement: .primaryAction) {
                    Button { editing = ReminderTarget(reminder: nil) } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Add reminder")
                }
            }
        }
        .sheet(item: $editing) { ReminderForm(reminder: $0.reminder).environment(store) }
        .sensoryFeedback(.success, trigger: flipped.count)
    }

    private func content(_ trip: TripRow, today: String) -> some View {
        let all = HomeReminder.derive(trip, today: today).map { r in
            guard let to = flipped[r.id] else { return r }
            return HomeReminder(id: r.id, kind: r.kind, title: r.title, note: r.note, amount: r.amount, caption: r.caption, due: r.due,
                                doneOn: to, overdue: to == nil && r.due.map { $0 < today } == true, opens: r.opens)
        }
        // After the journey, what's still open is history; Done stays (rig rule).
        let over = Journey.isFinished(trip.state, today: today)
        let overdue = over ? [] : all.filter { !$0.done && $0.overdue }
        let next = over ? [] : all.filter { !$0.done && !$0.overdue }
        let done = all.filter(\.done).sorted { ($0.doneOn ?? "") > ($1.doneOn ?? "") }
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if all.isEmpty {
                    card {
                        Text("Nothing here yet. Your own reminders, booking deadlines and the next charge of each subscription all land on this one list.")
                            .font(.sans(14)).foregroundStyle(Palette.tx2)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.vertical, 6)
                    }
                }
                group(Text("Overdue"), overdue, today: today, warn: true)
                group(Text("Next"), next, today: today)
                group(Text("Done"), done, today: today)
                Text("Ticking one takes it off Home and keeps it here under Done. Money reminders follow the stay or subscription they come from.")
                    .font(.sans(13.5)).foregroundStyle(Palette.tx2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .animation(Motion.settle, value: flipped)
    }

    @ViewBuilder private func group(_ title: Text, _ rows: [HomeReminder], today: String, warn: Bool = false) -> some View {
        if !rows.isEmpty {
            card {
                title.font(.sans(12.5, weight: .semibold)).textCase(.uppercase).tracking(1.4)
                    .foregroundStyle(warn ? Palette.warn : Palette.tx2)
                    .padding(.bottom, 2)
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                    if i > 0 { Divider().overlay(Palette.ln) }
                    ReminderRow(r: r, today: today, onTick: { toggle(r, today: today) }, onOpen: open(r))
                }
            }
        }
    }

    private func open(_ r: HomeReminder) -> (() -> Void)? {
        if r.isMine { return store.canEdit ? { editing = ReminderTarget(reminder: r) } : nil }
        return r.opens.map { target in { router.open(target) } }
    }

    /// Ticks or unticks at once; the save follows. On a failure the row goes back.
    private func toggle(_ r: HomeReminder, today: String) {
        let to: String? = r.done ? nil : today
        flipped[r.id] = .some(to)
        Task {
            do {
                try await store.save { doc in doc.upsert("reminders", id: r.id, ["doneOn": to.map { .string($0) } ?? .null]) }
            } catch {
                store.saveNotice = error.localizedDescription
            }
            flipped[r.id] = nil
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.sf, in: .rect(cornerRadius: Radius.r))
    }
}

// MARK: - the form

/// Which reminder the form edits; nil adds one.
struct ReminderTarget: Identifiable {
    let reminder: HomeReminder?
    var id: String { reminder?.id ?? "new" }
}

/// Add or edit one of your reminders (the web's AddReminderSheet): what, and
/// optionally when. Writes `state.reminders` through write_state, changing only
/// its own fields.
struct ReminderForm: View {
    let reminder: HomeReminder?
    @Environment(TripStore.self) private var store
    @State private var title: String
    @State private var due: String?
    private let today = Days.today()

    init(reminder: HomeReminder?) {
        self.reminder = reminder
        _title = State(initialValue: reminder?.title ?? "")
        _due = State(initialValue: reminder?.due)
    }

    var body: some View {
        if let state = store.trip?.state {
            EditForm(
                verbatimTitle: reminder == nil ? String(localized: "New reminder") : String(localized: "Edit reminder"),
                canSave: !title.trimmed.isEmpty && (due == nil || Subscriptions.valid(due)),
                dirty: title != (reminder?.title ?? "") || due != reminder?.due,
                saveLabel: reminder == nil ? "Add" : "Save",
                save: { try await save() },
                delete: reminder.map { r in
                    EditDelete(label: "Delete reminder", question: "Delete this reminder?",
                               action: { try await store.save { $0.remove("reminders", id: r.id) } })
                }
            ) {
                Section {
                    TextField("Remind me to… e.g. Extend the Thai visa", text: $title)
                }
                .listRowBackground(Palette.sf)

                Section {
                    Toggle("On a date", isOn: Binding(get: { due != nil },
                                                      set: { on in withAnimation(Motion.quick) { due = on ? (due ?? Days.add(today, 7)) : nil } }))
                    if due != nil {
                        DatePicker("Date", selection: dueDate, displayedComponents: .date)
                            .environment(\.timeZone, Days.utc)
                    }
                    HStack(spacing: 8) {
                        chip(Text("In a week")) { due = Days.add(today, 7) }
                        if let stop = Self.anchor(state, today: today) {
                            chip(Text("Before \(stop.city) ends")) { due = stop.depart }
                        }
                    }
                } footer: {
                    Text("Dated reminders appear on Home from 7 days before, and stay after the date until you tick them.")
                }
                .listRowBackground(Palette.sf)
            }
        }
    }

    /// The stop you're in, or the next one.
    static func anchor(_ state: TripState, today: String) -> Segment? {
        let stops = state.segments.filter(\.inPlan).sorted { $0.arrive < $1.arrive }
        return stops.first { $0.arrive <= today && today <= $0.depart } ?? stops.first { $0.arrive > today }
    }

    private func chip(_ label: Text, _ action: @escaping () -> Void) -> some View {
        Button { withAnimation(Motion.quick) { action() } } label: {
            label.font(.sans(14, weight: .semibold)).foregroundStyle(Palette.ac2Deep)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Palette.ac2Soft, in: .capsule)
        }
        .buttonStyle(.borderless)
    }

    private var dueDate: Binding<Date> {
        Binding(get: { Days.date(due ?? today) ?? .now }, set: { due = Days.iso($0) })
    }

    private func save() async throws {
        let id = reminder?.id ?? newId("rm")
        try await store.save {
            $0.upsert("reminders", id: id, ["title": .string(title.trimmed), "due": due.map { .string($0) } ?? .null])
        }
    }
}
