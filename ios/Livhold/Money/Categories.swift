import SwiftUI

// The web's category registry (product/src/lib/trips/categories.ts), ported one
// to one: ids, labels, aliases, families and the everyday rule. Change a rule
// there, change it here. The colours and symbols are iOS's own (Money mock
// round 2, 27 Sep): every category a shade inside its family's colour, so the
// family-stacked chart still reads as groups while each row says what it is.

enum CategoryKind: String, Codable, Sendable { case expense, income }

struct Category: Identifiable, Sendable {
    let id: String
    let label: String
    let kind: CategoryKind
    let hint: String?
    let aliases: [String]
    /// SF Symbol drawn white on the category's tile.
    let symbol: String
    let light: RGBA
    let dark: RGBA

    var color: Color { Color(light: light, dark: dark) }
}

enum Family: String, CaseIterable, Identifiable, Sendable {
    case food, shops, around, wear, care, fun, other
    var id: Self { self }

    var label: String {
        switch self {
        case .food: String(localized: "Food & drinks")
        case .shops: String(localized: "Groceries & shops")
        case .around: String(localized: "Getting around")
        case .wear: String(localized: "Clothes & accessories")
        case .care: String(localized: "Health & care")
        case .fun: String(localized: "Activities")
        case .other: String(localized: "Other")
        }
    }

    /// The web's family colours (categories.ts GROUPS).
    var color: Color {
        switch self {
        case .food: Palette.ac
        case .shops: Palette.catGrocery
        case .around: Palette.catDaily
        case .wear: Palette.ac2
        case .care: Palette.warn
        case .fun: Palette.catActivity
        case .other: Palette.ln3
        }
    }
}

enum Categories {
    static let all: [Category] = [
        // expenses
        .init(id: "food", label: String(localized: "Food"), kind: .expense, hint: String(localized: "meals, street food, restaurants"),
              aliases: ["food", "meal", "meals", "restaurant", "restaurants", "eating out", "lunch", "dinner", "breakfast", "snacks", "airport (food, drinks)"],
              symbol: "fork.knife", light: RGBA(63, 90, 62), dark: RGBA(127, 163, 125)),
        .init(id: "drinks", label: String(localized: "Drinks"), kind: .expense, hint: String(localized: "coffee, beer, juice"),
              aliases: ["drink", "drinks", "coffee", "beer", "bar", "juice", "tea"],
              symbol: "cup.and.saucer.fill", light: RGBA(110, 139, 61), dark: RGBA(163, 191, 110)),
        .init(id: "groceries", label: String(localized: "Groceries"), kind: .expense, hint: String(localized: "supermarket runs"),
              aliases: ["groceries", "grocery", "supermarket", "market"],
              symbol: "cart.fill", light: RGBA(126, 154, 120), dark: RGBA(159, 184, 154)),
        .init(id: "convenience", label: String(localized: "Convenience store"), kind: .expense, hint: String(localized: "7-Eleven, FamilyMart, Lawson"),
              aliases: ["convenience", "convenience store", "7 eleven", "7-eleven", "7eleven", "seven eleven", "family mart", "familymart", "lawson"],
              symbol: "storefront.fill", light: RGBA(94, 143, 134), dark: RGBA(134, 184, 174)),
        .init(id: "stays", label: String(localized: "Stays"), kind: .expense, hint: String(localized: "hotels, Airbnb, rent"),
              aliases: ["stays", "stay", "accommodation", "hotel", "hostel", "airbnb", "rent", "booking"],
              symbol: "bed.double.fill", light: RGBA(122, 92, 153), dark: RGBA(169, 139, 199)),
        .init(id: "transport", label: String(localized: "Transport"), kind: .expense, hint: String(localized: "flights, trains, buses between cities"),
              aliases: ["transport", "flight", "flights", "train", "trains", "bus", "ferry", "plane", "intercity"],
              symbol: "airplane", light: RGBA(79, 111, 176), dark: RGBA(127, 155, 214)),
        .init(id: "local-transport", label: String(localized: "Getting around"), kind: .expense, hint: String(localized: "taxi, Grab, tuk-tuk, metro"),
              aliases: ["local transport", "public transport", "taxi", "grab", "tuktuk", "tuk-tuk", "tuk tuk", "metro", "bts", "mrt", "scooter", "bolt", "getting around"],
              symbol: "car.fill", light: RGBA(108, 140, 207), dark: RGBA(139, 166, 220)),
        .init(id: "activities", label: String(localized: "Activities"), kind: .expense, hint: String(localized: "tickets, tours, temples, concerts"),
              aliases: ["activities", "activity", "attraction", "attractions", "tour", "tours", "sightseeing", "museum", "temple", "entry", "ticket", "tickets",
                        "entertainment", "concert", "concerts", "cinema", "nightlife", "skz concert tickets"],
              symbol: "binoculars", light: RGBA(201, 138, 99), dark: RGBA(217, 160, 124)),
        .init(id: "health", label: String(localized: "Health"), kind: .expense, hint: String(localized: "pharmacy, doctor, massage"),
              aliases: ["health", "pharmacy", "doctor", "medicine", "medical", "massage", "dentist"],
              symbol: "cross.case.fill", light: RGBA(138, 100, 32), dark: RGBA(217, 168, 92)),
        .init(id: "personal-care", label: String(localized: "Personal care"), kind: .expense, hint: String(localized: "drugstore, skincare, toiletries"),
              aliases: ["personal care", "drogerie", "drugstore", "skincare", "face care", "toiletries", "beauty", "watsons", "haircut", "laundry"],
              symbol: "drop.fill", light: RGBA(165, 121, 74), dark: RGBA(216, 174, 126)),
        .init(id: "clothes", label: String(localized: "Clothes"), kind: .expense, hint: String(localized: "clothing and shoes"),
              aliases: ["clothes", "clothing", "shoes"],
              symbol: "tshirt.fill", light: RGBA(169, 76, 90), dark: RGBA(208, 135, 149)),
        .init(id: "accessories", label: String(localized: "Accessories"), kind: .expense, hint: String(localized: "jewellery, sunglasses, hair pins, phone straps"),
              aliases: ["accessory", "jewellery", "jewelry", "sunglasses", "hair pins", "phone strap"],
              symbol: "sunglasses.fill", light: RGBA(184, 104, 126), dark: RGBA(221, 160, 178)),
        .init(id: "souvenirs", label: String(localized: "Souvenirs"), kind: .expense, hint: String(localized: "gifts, keepsakes, postcards"),
              aliases: ["souvenir", "gift", "gifts", "keepsake", "postcard", "postcards"],
              symbol: "gift.fill", light: RGBA(156, 90, 140), dark: RGBA(197, 141, 182)),
        .init(id: "gear", label: String(localized: "Gear"), kind: .expense, hint: String(localized: "backpacks, electronics, adapters, trip kit"),
              aliases: ["gear", "equipment", "backpack", "luggage", "electronics", "adapter", "charger", "trip gear", "kit", "one-off", "one off", "extras"],
              symbol: "backpack.fill", light: RGBA(111, 118, 130), dark: RGBA(154, 162, 174)),
        .init(id: "connectivity", label: String(localized: "Phone & internet"), kind: .expense, hint: String(localized: "eSIM, data, wifi"),
              aliases: ["connectivity", "e-sim", "esim", "sim", "sim card", "internet", "phone", "data", "wifi"],
              symbol: "antenna.radiowaves.left.and.right", light: RGBA(63, 143, 168), dark: RGBA(111, 182, 204)),
        .init(id: "subscriptions", label: String(localized: "Subscriptions"), kind: .expense, hint: String(localized: "the monthly ones from home"),
              aliases: ["subscriptions", "subscription", "netflix", "spotify", "icloud"],
              symbol: "arrow.triangle.2.circlepath", light: RGBA(124, 115, 176), dark: RGBA(166, 158, 218)),
        .init(id: "insurance", label: String(localized: "Insurance & visas"), kind: .expense, hint: String(localized: "travel insurance, visa fees, permits"),
              aliases: ["insurance", "travel insurance", "visa", "visas", "visa fee", "permit", "insurance & visas"],
              symbol: "checkmark.shield.fill", light: RGBA(91, 107, 140), dark: RGBA(141, 155, 186)),
        .init(id: "fees", label: String(localized: "Fees & cash"), kind: .expense, hint: String(localized: "ATM, bank and exchange fees"),
              aliases: ["fees", "fee", "atm", "atm fee", "bank fee", "exchange"],
              symbol: "banknote.fill", light: RGBA(140, 138, 112), dark: RGBA(183, 181, 150)),
        .init(id: "giving", label: String(localized: "Giving"), kind: .expense, hint: String(localized: "donations and tips"),
              aliases: ["giving", "charity", "donation", "donations", "tip", "tips"],
              symbol: "heart.fill", light: RGBA(192, 102, 122), dark: RGBA(224, 151, 167)),
        .init(id: "other", label: String(localized: "Other"), kind: .expense, hint: String(localized: "anything else"),
              aliases: ["other", "misc", "miscellaneous", "(uncategorised)", "uncategorised", "uncategorized", "cash expense"],
              symbol: "shippingbox.fill", light: RGBA(138, 145, 140), dark: RGBA(167, 173, 169)),
        // income
        .init(id: "salary", label: String(localized: "Salary"), kind: .income, hint: nil, aliases: ["salary", "wage", "wages", "payroll"],
              symbol: "briefcase.fill", light: RGBA(63, 122, 85), dark: RGBA(127, 184, 146)),
        .init(id: "freelance", label: String(localized: "Freelance"), kind: .income, hint: nil, aliases: ["freelance", "client work", "contract", "invoice"],
              symbol: "laptopcomputer", light: RGBA(63, 122, 85), dark: RGBA(127, 184, 146)),
        .init(id: "savings", label: String(localized: "Savings brought in"), kind: .income, hint: String(localized: "money moved into the trip pot"),
              aliases: ["savings", "total wealth", "starting balance", "opening balance", "transfer in"],
              symbol: "building.columns.fill", light: RGBA(63, 122, 85), dark: RGBA(127, 184, 146)),
        .init(id: "refund", label: String(localized: "Refund"), kind: .income, hint: nil, aliases: ["refund", "refunds", "cashback", "reimbursement"],
              symbol: "arrow.uturn.backward", light: RGBA(63, 122, 85), dark: RGBA(127, 184, 146)),
        .init(id: "other-income", label: String(localized: "Other income"), kind: .income, hint: nil, aliases: ["other income", "misc income", "gift received"],
              symbol: "plus", light: RGBA(63, 122, 85), dark: RGBA(127, 184, 146)),
    ]

    private static let byId: [String: Category] = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })

    static func of(_ id: String) -> Category? { byId[id] }

    /// Unknown ids show as typed.
    static func label(_ id: String) -> String { byId[id]?.label ?? id }
    static func symbol(_ id: String) -> String { byId[id]?.symbol ?? "circle.fill" }
    static func color(_ id: String) -> Color { byId[id]?.color ?? Color(light: RGBA(138, 145, 140), dark: RGBA(167, 173, 169)) }

    static func list(_ kind: CategoryKind) -> [Category] { all.filter { $0.kind == kind } }

    static let defaultId: [CategoryKind: String] = [.expense: "other", .income: "other-income"]

    /// Not day-to-day living: kept out of the daily pace (categories.ts NON_DAILY_CATEGORIES).
    static let nonDaily: Set<String> = ["stays", "transport", "gear", "insurance", "subscriptions", "fees"]

    /// Unknown ids count as everyday; income never does.
    static func isEveryday(_ id: String) -> Bool {
        !nonDaily.contains(id) && (byId[id]?.kind ?? .expense) == .expense
    }

    /// Whether an entry's own switch may override its category (spending.ts everydaySwitchable).
    static func switchable(_ id: String) -> Bool {
        !["stays", "transport", "subscriptions"].contains(id)
    }

    private static let familyOf: [String: Family] = [
        "food": .food, "drinks": .food,
        "groceries": .shops, "convenience": .shops,
        "local-transport": .around,
        "clothes": .wear, "accessories": .wear, "souvenirs": .wear,
        "health": .care, "personal-care": .care,
        "activities": .fun,
    ]

    static func family(_ id: String) -> Family { familyOf[id] ?? .other }

    // MARK: suggesting a category from the name

    private static let aliasIndex: [(alias: String, id: String, kind: CategoryKind)] = {
        var out: [(String, String, CategoryKind)] = []
        for c in all {
            var keys = Set(c.aliases)
            keys.insert(c.id)
            keys.insert(c.label.lowercased())
            for k in keys { out.append((k, c.id, c.kind)) }
        }
        return out.sorted { $0.0.count > $1.0.count }
    }()

    private static func fold(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// The longest alias found as a whole word in the name (categories.ts suggestCategory).
    static func suggest(_ name: String, kind: CategoryKind) -> String? {
        let folded = fold(name)
        guard folded.count >= 3 else { return nil }
        func isWordChar(_ c: Character) -> Bool { c.isASCII && (c.isLetter || c.isNumber) }
        for entry in aliasIndex where entry.kind == kind {
            var search = folded.startIndex
            while let r = folded.range(of: entry.alias, range: search..<folded.endIndex) {
                let before = r.lowerBound == folded.startIndex ? nil : folded[folded.index(before: r.lowerBound)]
                let after = r.upperBound == folded.endIndex ? nil : folded[r.upperBound]
                if !(before.map(isWordChar) ?? false), !(after.map(isWordChar) ?? false) { return entry.id }
                search = folded.index(after: r.lowerBound)
            }
        }
        return nil
    }

    private static let defaultRow: [CategoryKind: [String]] = [
        .expense: ["food", "drinks", "convenience", "local-transport", "activities", "groceries", "clothes", "health"],
        .income: ["salary", "freelance", "savings", "refund", "other-income"],
    ]

    /// The trip's own most used first, then a sensible default order.
    static func mostUsed(_ ledger: [LedgerEntry], kind: CategoryKind, n: Int) -> [String] {
        var counts: [String: Int] = [:]
        for e in ledger where e.type == kind && byId[e.category] != nil { counts[e.category, default: 0] += 1 }
        let used = counts.sorted { $0.value > $1.value || ($0.value == $1.value && $0.key < $1.key) }.map(\.key)
        var out: [String] = []
        for id in used + (defaultRow[kind] ?? []) where !out.contains(id) {
            out.append(id)
            if out.count == n { break }
        }
        return out
    }
}

/// A category's tile: its colour, its symbol in white (the iOS Settings look).
/// `hollow` marks an entry left out of the daily average.
struct CategoryTile: View {
    let id: String
    var size: CGFloat = 30
    var hollow = false
    var badge: String? = nil

    var body: some View {
        let color = Categories.color(id)
        RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            .fill(hollow ? Color.clear : color)
            .overlay {
                if hollow {
                    RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).strokeBorder(color, lineWidth: 2)
                }
            }
            .overlay {
                Image(systemName: Categories.symbol(id))
                    .font(.system(size: size * 0.46, weight: .semibold))
                    .foregroundStyle(hollow ? color : .white)
            }
            .frame(width: size, height: size)
            .overlay(alignment: .bottomTrailing) {
                if let badge {
                    Image(systemName: badge)
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(Palette.tx2)
                        .frame(width: 15, height: 15)
                        .background(Palette.sf, in: .circle)
                        .overlay(Circle().strokeBorder(Palette.ln2, lineWidth: 1))
                        .offset(x: 4, y: 4)
                }
            }
            .accessibilityHidden(true)
    }
}
