import Foundation
import Supabase

// Port of src/lib/derive.ts: values the app works out from a probe's readings
// (see hardware/firmware/README.md for `raw`)

// ms since epoch, rounded: Date keeps seconds as a Double, so parseISO can be off by a fraction of a ms
func time(_ r: Reading) -> Millis { r.t.rounded() }
// only finite numbers count, like `typeof x === "number" && isFinite(x)`
public func num(_ x: AnyJSON?) -> Double? {
  switch x {
  case .integer(let i): Double(i)
  case .double(let d) where d.isFinite: d
  default: nil
  }
}
// JS truthiness of a JSON value
func truthy(_ x: AnyJSON?) -> Bool {
  switch x {
  case nil, .null: false
  case .bool(let b): b
  case .integer(let i): i != 0
  case .double(let d): d != 0 && !d.isNaN
  case .string(let s): !s.isEmpty
  case .object, .array: true
  }
}

// % full from the probe's depth; soil % from the column, or raw for rows written before the trigger
public func enrich(_ r: Reading, _ depth: Double?) -> Reading {
  var out = r
  out.soilPct = r.soilPct ?? num(r.raw?["soil_pct"])
  if let l = r.levelCm, let depth, depth != 0, !depth.isNaN {
    out.pctFull = min(100, max(0, (l / depth) * 100))
  } else {
    out.pctFull = nil
  }
  return out
}

public struct Gps: Sendable {
  public var fix: Bool, lat: Double?, lng: Double?, hdop: Double?, sats: Double?, ageMs: Double?
}
public func gps(_ r: Reading?) -> Gps? {
  guard let g = r?.raw?["gps"]?.objectValue else { return nil }
  return Gps(fix: truthy(g["fix"]), lat: num(g["lat"]), lng: num(g["lng"]), hdop: num(g["hdop"]), sats: num(g["sats"]), ageMs: num(g["age_ms"]))
}

// A fix worth trusting: valid, and HDOP low enough that jitter stays within a few metres
public func goodFix(_ r: Reading?) -> Coord? {
  guard let g = gps(r), g.fix, let lat = g.lat, let lng = g.lng, (g.hdop ?? 99) <= Limits.hdopMax else { return nil }
  return Coord(lat: lat, lng: lng)
}

// Metres between two points (haversine)
public func metres(_ a: Coord, _ b: Coord) -> Double {
  let rad = Double.pi / 180
  let s1 = sin(((b.lat - a.lat) * rad) / 2), s2 = sin(((b.lng - a.lng) * rad) / 2)
  let x = s1 * s1 + cos(a.lat * rad) * cos(b.lat * rad) * (s2 * s2)
  return 2 * 6_371_000 * asin(x.squareRoot())
}

// Newest good fixes (up to n) from the hour before the latest reading, newest first
let FIX_MAX_AGE: Millis = 3_600_000
public func recentFixes(_ history: [Reading], _ n: Int = 1) -> [Coord] {
  var out: [Coord] = []
  guard let last = history.last else { return out }
  let from = time(last) - FIX_MAX_AGE
  var i = history.count - 1
  while i >= 0 && out.count < n && time(history[i]) >= from {
    if let f = goodFix(history[i]) { out.append(f) }
    i -= 1
  }
  return out
}

// Distance of the probe from home, from its last 3 good fixes (oldest-first history).
// Moved only if all three are outside the geofence, so one wild fix doesn't raise an alert.
public func geofence(_ probe: Probe, _ history: [Reading]) -> Geofence? {
  guard let lat = probe.homeLat, let lng = probe.homeLng else { return nil }
  let home = Coord(lat: lat, lng: lng)
  let fixes = recentFixes(history, 3)
  if fixes.isEmpty { return nil }
  let ds = fixes.map { metres(home, $0) }
  return Geofence(home: home, radius: probe.geofenceM, distance: ds[0], moved: ds.allSatisfy { $0 > probe.geofenceM })
}

// Usual gap between reports, in ms: the probe's own setting if it sends one, else the median gap
public func interval(_ history: [Reading]) -> Millis {
  if let iv = num(history.last?.raw?["interval_s"]), iv != 0 { return iv * 1000 }
  let recent = Array(history.suffix(50))
  return median(recent.indices.dropFirst().map { time(recent[$0]) - time(recent[$0 - 1]) })
}

// Level trend over the last 6 h (least squares). Hours until empty if falling, else nil.
public func timeToEmpty(_ history: [Reading]) -> Double? {
  guard let last = history.last, let level = last.levelCm else { return nil }
  let from = time(last) - 6 * 3_600_000
  let pts = history.compactMap { r -> (Double, Double)? in
    guard let l = r.levelCm, time(r) >= from else { return nil }
    return ((time(r) - from) / 3_600_000, l)
  }
  if pts.count < 4 { return nil }
  let n = Double(pts.count)
  let mx = pts.reduce(0) { $0 + $1.0 } / n
  let my = pts.reduce(0) { $0 + $1.1 } / n
  let den = pts.reduce(0) { $0 + ($1.0 - mx) * ($1.0 - mx) }
  if den == 0 || den.isNaN { return nil }
  let slope = pts.reduce(0) { $0 + ($1.0 - mx) * ($1.1 - my) } / den // cm per hour
  if slope > -0.05 { return nil }
  return max(0, level / -slope)
}

// Animal visits from the ultrasonic sensor: a head or muzzle over the trough reads closer than the water.
// A reading well below the median distance of the previous 10 minutes is a dip; dips less than
// 2 minutes apart are one visit. Returns visit start times (ms).
let BASELINE_MS: Millis = 10 * 60_000
let MERGE_MS: Millis = 2 * 60_000
public func visits(_ history: [Reading]) -> [Millis] {
  let pts = history.compactMap { r -> (t: Millis, d: Double)? in
    guard let d = num(r.raw?["distance_cm"]), d > 0, num(r.raw?["echo_ok"]) != 0 else { return nil }
    return (time(r), d)
  }
  var out: [Millis] = []
  var lastDip = -Double.infinity
  var j = 0
  for i in pts.indices {
    while pts[j].t < pts[i].t - BASELINE_MS { j += 1 }
    let window = pts[j..<i].map(\.d)
    if window.count < 5 { continue }
    let base = median(window)
    if pts[i].d >= base - max(2, base * 0.2) { continue }
    if pts[i].t - lastDip > MERGE_MS { out.append(pts[i].t) }
    lastDip = pts[i].t
  }
  return out
}

// YYYY-MM-DD in the given time zone (the TypeScript uses the browser's)
public func dayKey(_ ms: Millis, timeZone: TimeZone = .current) -> String {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.calendar = Calendar(identifier: .gregorian)
  f.timeZone = timeZone
  f.dateFormat = "yyyy-MM-dd"
  return f.string(from: Date(timeIntervalSince1970: ms / 1000))
}
public struct DayVisits: Sendable {
  public var k: String, day: Millis, n: Int
}
// Visits per day for the last n days, oldest first
public func visitsByDay(_ starts: [Millis], _ now: Millis, _ n: Int = 7, timeZone: TimeZone = .current) -> [DayVisits] {
  (0..<n).map { i in
    let day = now - Double(n - 1 - i) * 86_400_000
    let k = dayKey(day, timeZone: timeZone)
    return DayVisits(k: k, day: day, n: starts.filter { dayKey($0, timeZone: timeZone) == k }.count)
  }
}

// Is each part of a hardware probe working? From its latest reading, in plain words.
public struct Check: Sendable {
  public var part: String, s: Status, text: String
}
public func health(_ latest: Reading?, _ online: Bool, _ lastHeard: String) -> [Check] {
  let raw = latest?.raw ?? [:]
  let rssi = num(raw["rssi"])
  if !online { return [Check(part: "Connection", s: .bad, text: "Last heard \(lastHeard)")] }
  var out = [
    rssi.map { $0 < -80 } == true
      ? Check(part: "Connection", s: .watch, text: "Weak · \(jsString(rssi!)) dBm")
      : Check(part: "Connection", s: .good, text: rssi.map { "Live · \(jsString($0)) dBm" } ?? "Live"),
  ]
  let tries = raw["echo_us"]?.arrayValue.map { Double($0.count) } ?? 5
  if let ok = num(raw["echo_ok"]) {
    out.append(
      ok == 0 ? Check(part: "Water level", s: .bad, text: "No echo")
        : ok < tries ? Check(part: "Water level", s: .watch, text: "\(jsString(ok)) of \(jsString(tries)) echoes")
        : Check(part: "Water level", s: .good, text: "\(num(raw["distance_cm"]).map { toFixed($0, 0) } ?? "–") cm to water"))
  }
  if let adc = num(raw["soil_adc"]) {
    out.append(
      adc == 0 ? Check(part: "Soil moisture", s: .watch, text: "0%")
        : Check(part: "Soil moisture", s: .good, text: "\(num(raw["soil_pct"]).map { toFixed($0, 0) } ?? "–")% moisture"))
  }
  let chars = num(raw["gps"]?.objectValue?["chars"])
  if let g = gps(latest) {
    out.append(
      g.fix ? Check(part: "GPS", s: (g.hdop ?? 99) <= Limits.hdopMax ? .good : .watch, text: "\(jsString(g.sats ?? 0)) satellites")
        : chars.map { $0 != 0 } == true ? Check(part: "GPS", s: .watch, text: "No fix")
        : Check(part: "GPS", s: .bad, text: "No data"))
  }
  return out
}
