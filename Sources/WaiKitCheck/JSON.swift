import Foundation
import Supabase
import WaiKit

// Fixture JSON: NaN is null, +/-Infinity is the string "Infinity" / "-Infinity"
extension AnyJSON {
  subscript(_ k: String) -> AnyJSON { objectValue?[k] ?? .null }
  subscript(_ i: Int) -> AnyJSON { arrayValue?[i] ?? .null }
  var arr: [AnyJSON] { arrayValue ?? [] }
  var d: Double {
    switch self {
    case .integer(let i): Double(i)
    case .double(let x): x
    case .string("Infinity"): .infinity
    case .string("-Infinity"): -.infinity
    default: .nan
    }
  }
  var dOpt: Double? { isNil ? nil : d }
  var s: String? { stringValue }
  var isNumber: Bool {
    switch self { case .integer, .double, .null: true; default: false }
  }
}

func j(_ x: Double?) -> AnyJSON {
  guard let x, !x.isNaN else { return .null }
  return x.isInfinite ? .string(x > 0 ? "Infinity" : "-Infinity") : .double(x)
}
func j(_ x: Int?) -> AnyJSON { x.map { .integer($0) } ?? .null }
func j(_ x: String?) -> AnyJSON { x.map { .string($0) } ?? .null }
func j(_ x: Bool) -> AnyJSON { .bool(x) }
func j(_ c: Coord?) -> AnyJSON { c.map { ["lat": j($0.lat), "lng": j($0.lng)] } ?? .null }
func j(_ g: Geofence?) -> AnyJSON {
  g.map { ["home": j($0.home), "distance": j($0.distance), "moved": j($0.moved), "radius": j($0.radius)] } ?? .null
}
func j<T>(_ xs: [T], _ f: (T) -> AnyJSON) -> AnyJSON { .array(xs.map(f)) }

// Any Encodable (Probe, Reading) through its Codable, so the fixture compares against the wire shape
func encoded<T: Encodable>(_ x: T) -> AnyJSON {
  let e = JSONEncoder()
  e.nonConformingFloatEncodingStrategy = .convertToString(positiveInfinity: "Infinity", negativeInfinity: "-Infinity", nan: "NaN")
  return try! JSONDecoder().decode(AnyJSON.self, from: e.encode(x))
}

// Deep compare: numbers within 1e-9 relative, null equals NaN, a missing key equals null
func checkJSON(_ name: String, _ got: AnyJSON, _ exp: AnyJSON) {
  switch (got, exp) {
  case (.string("NaN"), .null): checks += 1
  case _ where got.isNumber && exp.isNumber: checkClose(name, got.d, exp.d, tol: 1e-9)
  case (.array(let a), .array(let b)):
    guard a.count == b.count else { return check(name, false, "got \(a.count) items expected \(b.count)") }
    for i in b.indices { checkJSON("\(name)[\(i)]", a[i], b[i]) }
  case (.object(let a), .object(let b)):
    for k in Set(a.keys).union(b.keys).sorted() { checkJSON("\(name).\(k)", a[k] ?? .null, b[k] ?? .null) }
  default: check(name, got == exp, "got \(got) expected \(exp)")
  }
}
