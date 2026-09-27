import Foundation

/// Any JSON, kept exactly as it came. The trip is one document that the web
/// grows over time (reminders, subscriptions, extras, …); the phone reads only
/// part of it, so saves edit THIS copy field by field and send it back whole.
/// Nothing the app doesn't know about is ever dropped.
enum JSONValue: Codable, Sendable, Hashable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n):
            // Whole numbers go out without ".0", as JavaScript writes them.
            if n.rounded() == n, abs(n) < 9_007_199_254_740_992 { try c.encode(Int64(n)) } else { try c.encode(n) }
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    subscript(key: String) -> JSONValue? {
        get { if case .object(let o) = self { o[key] } else { nil } }
        set {
            guard case .object(var o) = self else { return }
            o[key] = newValue
            self = .object(o)
        }
    }

    var stringValue: String? { if case .string(let s) = self { s } else { nil } }

    /// Inserts or updates the item with this id in a list of the document
    /// (`segments`, `stays`, `transport`). Only the given fields change; a nil
    /// removes that field, like `undefined` on the web. A new item goes last.
    mutating func upsert(_ list: String, id: String, _ fields: [String: JSONValue?]) {
        var items: [JSONValue] = []
        if case .array(let a)? = self[list] { items = a }
        if let i = items.firstIndex(where: { $0["id"]?.stringValue == id }), case .object(var o) = items[i] {
            for (k, v) in fields { o[k] = v }
            items[i] = .object(o)
        } else {
            var o: [String: JSONValue] = ["id": .string(id)]
            for (k, v) in fields { if let v { o[k] = v } }
            items.append(.object(o))
        }
        self[list] = .array(items)
    }

    mutating func remove(_ list: String, id: String) {
        guard case .array(let items)? = self[list] else { return }
        self[list] = .array(items.filter { $0["id"]?.stringValue != id })
    }

    /// Changes every object in a list that `where` picks.
    mutating func update(_ list: String, where pick: ([String: JSONValue]) -> Bool, _ change: (inout [String: JSONValue]) -> Void) {
        guard case .array(var items)? = self[list] else { return }
        for i in items.indices {
            if case .object(var o) = items[i], pick(o) {
                change(&o)
                items[i] = .object(o)
            }
        }
        self[list] = .array(items)
    }
}

extension JSONValue {
    /// "" for a blank string, as the web stores cleared text fields.
    static func text(_ s: String) -> JSONValue { .string(s) }
    /// A string, or no field at all when it's empty.
    static func textOrNone(_ s: String) -> JSONValue? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : .string(t)
    }
}

/// Ids the way the web makes them: a prefix and a lowercase UUID ("st3f2a…").
func newId(_ prefix: String) -> String { prefix + UUID().uuidString.lowercased() }
