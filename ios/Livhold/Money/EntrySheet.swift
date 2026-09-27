import Observation
import SwiftUI

// Adding and editing one ledger entry: the web's EntrySheet (components/money/
// EntrySheet.tsx), redrawn for the phone (Money mock round 2, §4): the amount
// large at the top over the system number pad, the currency a menu, the four
// categories you use most as tiles, then the date and the daily-average switch
// on ONE row (Patrik, 27 Sep). Cancel / Add like every form sheet in the app.

enum EntryTarget: Identifiable, Hashable {
    case add(CategoryKind)
    case edit(LedgerEntry)

    var id: String {
        switch self {
        case .add(let k): "add-\(k.rawValue)"
        case .edit(let e): "edit-\(e.id)"
        }
    }
}

@MainActor
@Observable
final class MoneyEditor {
    var target: EntryTarget?
    var toast: String?
}

struct EntrySheet: View {
    let target: EntryTarget

    @Environment(TripStore.self) private var store
    @Environment(MoneyEditor.self) private var editor
    @Environment(\.dismiss) private var dismiss

    @State private var type: CategoryKind = .expense
    @State private var amountText = ""
    @State private var currency = ""
    @State private var note = ""
    @State private var category = ""
    /// Set once the category is picked by hand; the name stops suggesting then.
    @State private var picked = false
    @State private var date = Date.now
    /// Whether it counts in the daily average; nil = the category decides.
    @State private var counts: Bool?
    @State private var busy = false
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var confirmDiscard = false
    @State private var allCategories = false
    @State private var started = false
    @FocusState private var focus: Field?

    private enum Field { case amount, note }

    private var editing: LedgerEntry? {
        if case .edit(let e) = target { return e }
        return nil
    }

    private var imported: Bool { editing?.isImported ?? false }
    private var trip: TripRow? { store.trip }
    private var base: String { trip?.state.meta.baseCurrency ?? "HUF" }
    private var rates: [String: Double] {
        var r = trip?.state.rates ?? [:]
        r[base] = 1
        return r
    }

    private var amount: Double? {
        let cleaned = amountText.filter { !$0.isWhitespace && $0 != "\u{00A0}" && $0 != "\u{202F}" }
            .replacingOccurrences(of: ",", with: ".")
        guard cleaned.range(of: #"^\d*\.?\d*$"#, options: .regularExpression) != nil, let v = Double(cleaned), v.isFinite else { return nil }
        return v
    }

    private var valid: Bool { (amount ?? 0) > 0 }

    private var byCategory: Bool { Categories.isEveryday(category) }
    private var asksEveryday: Bool { type == .expense && !imported && Categories.switchable(category) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    amountBlock
                    group {
                        TextField("What was it? · optional", text: $note)
                            .font(.sans(16))
                            .focused($focus, equals: .note)
                            .submitLabel(.done)
                            .padding(.vertical, 13)
                            .onChange(of: note) { _, name in
                                guard !picked, editing == nil, let s = Categories.suggest(name, kind: type) else { return }
                                withAnimation(Motion.quick) { category = s }
                            }
                    }
                    categoryBlock
                    group {
                        HStack {
                            Text("Date").font(.sans(16))
                            Spacer()
                            DatePicker("Date", selection: $date, displayedComponents: .date)
                                .labelsHidden()
                                .disabled(imported)
                        }
                        .padding(.vertical, 6)
                        if asksEveryday {
                            Divider().overlay(Palette.ln)
                            Toggle(isOn: Binding(get: { counts ?? byCategory }, set: { counts = $0 })) {
                                Text("In the daily average").font(.sans(16))
                            }
                            .tint(Palette.ac)
                            .padding(.vertical, 6)
                        }
                    }
                    if let hint = footnote {
                        Text(hint).font(.sans(13)).foregroundStyle(Palette.tx2)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
                    }
                    if let error { Notice(text: error, kind: .warn) }
                    if editing != nil {
                        Button("Delete entry", role: .destructive) { confirmDelete = true }
                            .font(.sans(16, weight: .medium))
                            .foregroundStyle(Palette.ac2Deep)
                            .padding(.top, 8)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Palette.canvas.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
        }
        .onAppear(perform: start)
        .interactiveDismissDisabled(changed)
        .confirmationDialog("Discard this entry?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        }
        .confirmationDialog("Delete this entry?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
        } message: {
            if imported { Text("It came from a booking; it won’t be added again.") }
        }
        .sheet(isPresented: $allCategories) {
            CategoryPicker(kind: type, selection: $category) { picked = true }
        }
        .sensoryFeedback(.selection, trigger: category)
    }

    // MARK: parts

    private func group<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(.horizontal, 14)
            .background(Palette.sf, in: .rect(cornerRadius: 16))
    }

    private var amountBlock: some View {
        VStack(spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                TextField("0", text: $amountText)
                    .font(.sans(46, weight: .semibold, relativeTo: .largeTitle))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .fixedSize()
                    .focused($focus, equals: .amount)
                    .disabled(imported)
                    .accessibilityLabel("Amount")
                Menu {
                    Picker("Currency", selection: $currency) {
                        ForEach(currencies, id: \.self) { Text($0).tag($0) }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(currency).font(.sans(15, weight: .semibold))
                        Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold))
                    }
                    .foregroundStyle(Palette.tx)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Palette.fill, in: .rect(cornerRadius: 9))
                }
                .disabled(imported)
            }
            .frame(maxWidth: .infinity)
            Text(conversionLine).font(.sans(13)).foregroundStyle(Palette.tx2)
                .multilineTextAlignment(.center)
                .contentTransition(.numericText())
                .animation(Motion.quick, value: conversionLine)
        }
        .padding(.top, 8)
    }

    private var categoryBlock: some View {
        let tiles: [String] = {
            var row = Categories.mostUsed(trip?.ledger ?? [], kind: type, n: 4)
            if !category.isEmpty, !row.contains(category) { row = [category] + row.prefix(3) }
            return Array(row.prefix(4))
        }()
        return VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 4) {
                ForEach(tiles, id: \.self) { id in
                    Button {
                        withAnimation(Motion.quick) { category = id; picked = true }
                    } label: {
                        VStack(spacing: 6) {
                            CategoryTile(id: id, size: 46)
                                .padding(3)
                                .overlay {
                                    if category == id {
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .strokeBorder(Categories.color(id), lineWidth: 2)
                                    }
                                }
                            Text(shortLabel(id))
                                .font(.sans(11.5, weight: category == id ? .semibold : .regular))
                                .foregroundStyle(category == id ? Palette.tx : Palette.tx2)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .disabled(imported)
                    .accessibilityLabel(Categories.label(id))
                    .accessibilityAddTraits(category == id ? .isSelected : [])
                }
            }
            Button("All \(Categories.list(type).count) categories") { allCategories = true }
                .font(.sans(14, weight: .medium))
                .foregroundStyle(Palette.ac)
                .disabled(imported)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Palette.sf, in: .rect(cornerRadius: 16))
    }

    private func shortLabel(_ id: String) -> String {
        id == "convenience" ? "Convenience" : Categories.label(id)
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { changed ? (confirmDiscard = true) : dismiss() }
        }
        ToolbarItem(placement: .principal) {
            if editing == nil {
                Menu {
                    Button("Expense") { switchType(.expense) }
                    Button("Income") { switchType(.income) }
                } label: {
                    HStack(spacing: 4) {
                        Text(type == .expense ? "Add expense" : "Add income").font(.sans(16, weight: .semibold))
                        Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold))
                    }
                    .foregroundStyle(Palette.tx)
                }
            } else {
                Text(type == .expense ? "Expense" : "Income").font(.sans(16, weight: .semibold))
            }
        }
        ToolbarItem(placement: .confirmationAction) {
            if busy {
                ProgressView()
            } else {
                Button(editing == nil ? "Add" : "Save") { Task { await save() } }
                    .fontWeight(.semibold)
                    .disabled(!valid)
            }
        }
        ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("Done") { focus = nil }.fontWeight(.semibold)
        }
    }

    // MARK: text

    private var currencies: [String] {
        var list = Array(rates.keys).sorted()
        if let i = list.firstIndex(of: base) { list.remove(at: i); list.insert(base, at: 0) }
        if !currency.isEmpty, !list.contains(currency) { list.append(currency) }
        return list
    }

    private var conversionLine: String {
        var parts: [String] = []
        if currency != base, let a = amount, a > 0 {
            parts.append("≈ " + MoneyText.full(Journey.toBase(a, currency, rates), base))
        }
        if editing == nil, let country = hereCountry, Self.currency(of: country) == currency, currency != base {
            parts.append("you’re in \(country)")
        }
        return parts.isEmpty ? " " : parts.joined(separator: " · ")
    }

    private var footnote: String? {
        if imported { return "Amount and date follow the booking on the Trip page." }
        if category == "subscriptions", editing == nil { return "How often it repeats is set on livhold.com for now." }
        if editing == nil, store.tracking == .no || store.tracking == .ask { return "Saving this turns on spending tracking." }
        return nil
    }

    private var hereCountry: String? {
        guard let state = trip?.state else { return nil }
        let today = Days.today()
        return state.segments.filter(\.inPlan).first { !$0.arrive.isEmpty && $0.arrive <= today && today <= $0.depart }?.country
    }

    /// The currency of a country named in English ("Thailand" → "THB").
    static func currency(of country: String) -> String? {
        let en = Locale(identifier: "en_US")
        for region in Locale.Region.isoRegions {
            guard en.localizedString(forRegionCode: region.identifier)?.caseInsensitiveCompare(country) == .orderedSame else { continue }
            return Locale(components: .init(languageCode: "en", languageRegion: region)).currency?.identifier
        }
        return nil
    }

    // MARK: state

    private var changed: Bool {
        guard started else { return false }
        if let e = editing {
            return amount != e.amount || note != e.note || category != e.category || currency != e.currency
                || Self.iso(date) != e.date || counts != e.everyday
        }
        return !amountText.isEmpty || !note.trimmed.isEmpty
    }

    private func start() {
        guard !started else { return }
        switch target {
        case .add(let kind):
            type = kind
            category = Categories.defaultId[kind] ?? "other"
            currency = pickCurrency()
            date = Days.date(Days.today()).map(Self.localDate) ?? .now
            focus = .amount
        case .edit(let e):
            type = e.type
            amountText = e.amount.formatted(.number.precision(.fractionLength(0...2)).grouping(.never).locale(Locale(identifier: "en_US")))
            currency = e.currency.isEmpty ? base : e.currency
            note = e.note
            category = e.category
            picked = true
            date = Days.date(e.date).map(Self.localDate) ?? .now
            counts = e.everyday
        }
        started = true
    }

    /// Where you are beats what you last typed (entryCurrency.ts pickEntryCurrency).
    private func pickCurrency() -> String {
        let watched = Set(rates.keys)
        if let country = hereCountry, let code = Self.currency(of: country), watched.contains(code) { return code }
        let last = trip?.ledger.filter { $0.isExpense }.max { $0.date < $1.date }?.currency
        if let last, watched.contains(last) { return last }
        return base
    }

    private func switchType(_ kind: CategoryKind) {
        guard kind != type else { return }
        type = kind
        category = Categories.defaultId[kind] ?? "other"
        picked = false
        counts = nil
    }

    // MARK: saving

    private func save() async {
        guard let amount, amount > 0, !busy else { return }
        busy = true
        error = nil
        var entry = editing ?? LedgerEntry(id: newId("le"), date: "", type: type, category: category, amount: 0,
                                           currency: currency, note: "", everyday: nil)
        entry.type = type
        entry.category = category
        entry.amount = (amount * 100).rounded() / 100
        entry.currency = currency.isEmpty ? base : currency
        entry.note = note.trimmed
        entry.date = Self.iso(date)
        // Stored only when it differs from the category (EntrySheet.tsx).
        if asksEveryday, let counts, counts != byCategory { entry.everyday = counts } else { entry.everyday = nil }
        do {
            try await store.upsertEntry(entry)
            if editing == nil, store.tracking == .no || store.tracking == .ask {
                try? await store.setTracking(true)
            }
            let label = entry.note.isEmpty ? Categories.label(entry.category) : entry.note
            let shown = MoneyText.full(Journey.toBase(entry.amount, entry.currency, rates), base)
            editor.toast = "\(editing == nil ? "Added" : "Saved") · \(shown) · \(label)"
            dismiss()
        } catch {
            self.error = error.localizedDescription
            busy = false
        }
    }

    private func delete() async {
        guard let e = editing else { return }
        busy = true
        do {
            try await store.deleteEntry(e)
            editor.toast = "Deleted · \(e.note.isEmpty ? Categories.label(e.category) : e.note)"
            dismiss()
        } catch {
            self.error = error.localizedDescription
            busy = false
        }
    }

    // MARK: dates — the ledger stores the day you meant, in your own calendar

    static func iso(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// A UTC-midnight date from `Days.date` as the same day at noon, local time.
    static func localDate(_ utc: Date) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        var c = cal.dateComponents([.year, .month, .day], from: utc)
        c.hour = 12
        return Calendar.current.date(from: c) ?? utc
    }
}

/// Every category of a kind, with its hint (the web's "All N…" picker).
struct CategoryPicker: View {
    let kind: CategoryKind
    @Binding var selection: String
    var onPick: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(Categories.list(kind)) { c in
                Button {
                    selection = c.id
                    onPick()
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        CategoryTile(id: c.id, size: 32)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(c.label).font(.sans(16, weight: .medium)).foregroundStyle(Palette.tx)
                            if let hint = c.hint { Text(hint).font(.sans(13)).foregroundStyle(Palette.tx2) }
                        }
                        Spacer()
                        if selection == c.id { Image(systemName: "checkmark").foregroundStyle(Palette.ac).fontWeight(.semibold) }
                    }
                }
                .listRowBackground(Palette.sf)
            }
            .scrollContentBackground(.hidden)
            .background(Palette.canvas.ignoresSafeArea())
            .navigationTitle("Category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.large])
    }
}
