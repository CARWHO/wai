import Foundation

// JS Math.round: half up, towards +infinity
public func jsRound(_ x: Double) -> Double {
  let f = x.rounded(.down)
  return x - f >= 0.5 ? f + 1 : f
}

// JS Number.prototype.toFixed: rounds the exact binary value, and a tie goes to the larger magnitude
public func toFixed(_ x: Double, _ digits: Int) -> String {
  if !x.isFinite { return x.isNaN ? "NaN" : x > 0 ? "Infinity" : "-Infinity" }
  let exact = String(format: "%.1100f", abs(x)) // every digit of the double
  let dot = exact.firstIndex(of: ".")!
  let frac = exact[exact.index(after: dot)...]
  var ds = Array(exact[..<dot]) + Array(frac.prefix(digits))
  if frac.dropFirst(digits).first! >= "5" {
    var i = ds.count - 1
    while i >= 0 && ds[i] == "9" { ds[i] = "0"; i -= 1 }
    if i < 0 { ds.insert("1", at: 0) } else { ds[i] = Character(String(ds[i].wholeNumberValue! + 1)) }
  }
  let int = String(ds.prefix(ds.count - digits))
  return (x < 0 ? "-" : "") + int + (digits > 0 ? "." + String(ds.suffix(digits)) : "")
}

// A number as JS writes it in a template string
public func jsString(_ x: Double) -> String {
  if x.isNaN { return "NaN" }
  if x.isInfinite { return x > 0 ? "Infinity" : "-Infinity" }
  return x == x.rounded() && abs(x) < 1e21 ? String(Int64(x)) : "\(x)"
}

extension Reading {
  public subscript(key: MetricKey) -> Double? {
    get {
      switch key {
      case .levelCm: levelCm
      case .pctFull: pctFull
      case .soilPct: soilPct
      case .turbidity: turbidity
      case .ph: ph
      case .tds: tds
      case .tempC: tempC
      }
    }
    set {
      switch key {
      case .levelCm: levelCm = newValue
      case .pctFull: pctFull = newValue
      case .soilPct: soilPct = newValue
      case .turbidity: turbidity = newValue
      case .ph: ph = newValue
      case .tds: tds = newValue
      case .tempC: tempC = newValue
      }
    }
  }
}

// 0-100 water quality: penalise turbidity above 5 NTU, pH away from 7.2, TDS above 400.
// NaN when the reading has no water quality sensor, so absent data doesn't count as good.
public func score(_ r: Reading?) -> Double {
  guard let r, r.turbidity != nil || r.ph != nil || r.tds != nil else { return .nan }
  let s = 100 - max(0, (r.turbidity ?? 0) - 5) * 1.5 - (r.ph.map { abs($0 - 7.2) * 15 } ?? 0) - max(0, (r.tds ?? 0) - 400) * 0.05
  return jsRound(min(100, max(0, s)))
}

public func status(_ s: Double) -> Status { s >= 80 ? .good : s >= 50 ? .watch : .bad }

// Which limits a reading breaks, in plain words
public func breaches(_ r: Reading?) -> [String] {
  guard let r else { return [] }
  var out: [String] = []
  if let x = r.turbidity, x > Limits.turbidity { out.append("Turbidity \(toFixed(x, 0)) NTU (limit \(jsString(Limits.turbidity)))") }
  if let x = r.ph, x < Limits.phMin || x > Limits.phMax { out.append("pH \(toFixed(x, 1)) (safe \(jsString(Limits.phMin))–\(jsString(Limits.phMax)))") }
  if let x = r.tds, x > Limits.tds { out.append("TDS \(jsString(jsRound(x))) ppm (limit \(jsString(Limits.tds)))") }
  return out
}

// Seeded probes report every 30 min, so count them online for 45. Hardware probes: see Farm.swift.
public func isOnline(_ r: Reading?, now: Millis) -> Bool { r.map { now - time($0) < 45 * 60_000 } ?? false }

public func ago(_ iso: String?, now: Millis) -> String {
  guard let iso else { return "never" }
  let d = (now - parseISO(iso).rounded()) / 1000
  let s = d.isNaN ? d : max(0, d)
  if s < 60 { return "just now" }
  if s < 3600 { return "\(jsString((s / 60).rounded(.down))) min ago" }
  if s < 86400 { return "\(jsString((s / 3600).rounded(.down))) h ago" }
  return "\(jsString((s / 86400).rounded(.down))) d ago"
}

// One definition per measurement, shared by every screen
public let METRICS: [Metric] = [
  Metric(key: .levelCm, name: "Level", unit: "cm", digits: 0, min: nil, max: nil, low: nil, high: nil, wq: false),
  Metric(key: .pctFull, name: "% full", unit: "%", digits: 0, min: Limits.levelPct, max: nil, low: "Low level", high: nil, wq: false),
  Metric(key: .soilPct, name: "Soil moisture", unit: "%", digits: 0, min: Limits.soilDry, max: Limits.soilWet, low: "Soil dry", high: "Soil saturated", wq: false),
  Metric(key: .turbidity, name: "Turbidity", unit: "NTU", digits: 1, min: nil, max: Limits.turbidity, low: nil, high: nil, wq: true),
  Metric(key: .ph, name: "pH", unit: "", digits: 1, min: Limits.phMin, max: Limits.phMax, low: nil, high: nil, wq: true),
  Metric(key: .tds, name: "TDS", unit: "ppm", digits: 0, min: nil, max: Limits.tds, low: nil, high: nil, wq: true),
  Metric(key: .tempC, name: "Temp", unit: "°C", digits: 1, min: nil, max: nil, low: nil, high: nil, wq: true),
]
public func metric(_ k: MetricKey) -> Metric { METRICS.first { $0.key == k }! }
public let PRIMARY = METRICS.filter { !$0.wq }

public func value(_ r: Reading?, _ m: Metric) -> Double { r?[m.key] ?? .nan }
public func fmt(_ m: Metric, _ x: Double) -> String { x.isNaN ? "–" : toFixed(x, m.digits) }
public func withUnit(_ m: Metric, _ x: Double) -> String {
  x.isNaN ? "–" : m.unit == "%" ? "\(fmt(m, x))%" : !m.unit.isEmpty ? "\(fmt(m, x)) \(m.unit)" : fmt(m, x)
}
// Metrics with at least one value in these readings, so absent sensors don't show "–" everywhere
public func present(_ rs: [Reading], _ ms: [Metric] = METRICS) -> [Metric] { ms.filter { m in rs.contains { $0[m.key] != nil } } }
public func metricName(_ m: Metric) -> String { m.key == .ph || m.key == .pctFull ? m.name : m.name.lowercased() }

// `State` in the TypeScript; renamed so it does not clash with SwiftUI's @State
public enum MetricState: String, Sendable { case high = "High", low = "Low", normal = "Normal" }
public func state(_ m: Metric, _ x: Double) -> MetricState {
  if let max = m.max, x > max { return .high }
  if let min = m.min, x < min { return .low }
  return .normal
}
public func hasLimit(_ m: Metric) -> Bool { m.min != nil || m.max != nil }
public func limitText(_ m: Metric) -> String {
  let u = m.unit == "%" ? "%" : !m.unit.isEmpty ? " \(m.unit)" : ""
  if let min = m.min, let max = m.max { return "\(jsString(min))–\(jsString(max))\(u)" }
  if let max = m.max { return "≤ \(jsString(max))\(u)" }
  if let min = m.min { return "≥ \(jsString(min))\(u)" }
  return "None"
}
// dashed lines on charts
public func limitLines(_ m: Metric) -> [Double] { [m.min, m.max].compactMap { $0 } }

// Out-of-limit measurements in a reading, e.g. Issue(m: Turbidity, x: 14, state: .high)
public struct Issue: Sendable {
  public var m: Metric, x: Double, state: MetricState
  public init(m: Metric, x: Double, state: MetricState) { self.m = m; self.x = x; self.state = state }
}
public func issues(_ r: Reading?, _ ms: [Metric] = METRICS) -> [Issue] {
  guard let r else { return [] }
  return ms.filter(hasLimit)
    .map { Issue(m: $0, x: value(r, $0), state: state($0, value(r, $0))) }
    .filter { !$0.x.isNaN && $0.state != .normal }
}
public func issueTitle(_ i: Issue) -> String {
  (i.state == .low ? i.m.low : i.m.high) ?? "\(i.m.name) \(i.state.rawValue.lowercased())"
}

public func mean(_ xs: [Double]) -> Double { xs.isEmpty ? .nan : xs.reduce(0, +) / Double(xs.count) }
public func median(_ xs: [Double]) -> Double { xs.isEmpty ? .nan : xs.sorted()[xs.count / 2] }

public let HOUR: Millis = 3_600_000
// `Range` in the TypeScript; renamed so it does not shadow Swift.Range
public struct TimeRange: Hashable, Sendable {
  public let k: String, name: String, hours: Double
}
public let RANGES = [
  TimeRange(k: "1d", name: "1d", hours: 24),
  TimeRange(k: "7d", name: "7d", hours: 168),
  TimeRange(k: "4w", name: "4w", hours: 672),
]
public func rangeHours(_ k: String) -> Double { RANGES.first { $0.k == k }!.hours }

// "3 d 4 h", "5 h", "40 min"
public func duration(_ hours: Double) -> String {
  if !hours.isFinite { return "–" }
  if hours < 1 { return "\(jsString(max(1, jsRound(hours * 60)))) min" }
  if hours < 48 { return "\(jsString(jsRound(hours))) h" }
  return "\(jsString((hours / 24).rounded(.down))) d \(jsString(jsRound(hours.truncatingRemainder(dividingBy: 24)))) h"
}

// Probe line colours on multi-probe charts
public let SERIES = ["#141412", "#3a9d5d", "#d98b2b", "#6b6a64"]

// Report interval: "5 s", "30 min", "1.5 h"
public func every(_ ms: Double) -> String {
  !ms.isFinite ? "–" : ms < 60_000 ? "\(jsString(jsRound(ms / 1000))) s"
    : ms < 90 * 60_000 ? "\(jsString(jsRound(ms / 60_000))) min" : "\(toFixed(ms / 3_600_000, 1)) h"
}
