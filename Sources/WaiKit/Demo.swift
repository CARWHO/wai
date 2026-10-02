import Foundation
import Supabase

// Demo mode for the hardware probe: real readings pass through as they are, except GPS, which
// can't get a fix indoors, so it reads as a fix at the phone (or the last good fix). Past silent
// stretches get readings every minute so the history is unbroken; up to now stays real, so an
// unplugged probe still shows offline.

public let DEMO_KEY = "wai-demo"
private let STEP: Millis = 60_000
private let MAX_GAP: Millis = 3 * 60_000 // a gap longer than this gets filled
private let MAX_FILL = 6 * 60 // at most 6 h of made-up readings per gap

// `new Date(ms).toISOString()`, from whole ms so the digits are exact
private let isoSeconds: DateFormatter = {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.calendar = Calendar(identifier: .gregorian)
  f.timeZone = TimeZone(identifier: "UTC")
  f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
  return f
}()
func jsISO(_ ms: Millis) -> String {
  let s = (ms / 1000).rounded(.down)
  return isoSeconds.string(from: Date(timeIntervalSince1970: s)) + String(format: ".%03dZ", Int(ms - s * 1000))
}
// `+x.toFixed(d)`
private func fixed(_ x: Double, _ d: Int) -> Double { Double(toFixed(x, d))! }

// small, steady wobble from the timestamp, so values don't jump between renders
private func wobble(_ ms: Millis, _ amp: Double, _ period: Double = 17 * 60_000) -> Double {
  amp * (sin((ms / period) * 2 * Double.pi) * 0.7 + sin((ms / (period * 0.37)) * 2 * Double.pi) * 0.3)
}

private struct Good { var level: Double, soil: Double, lat: Double, lng: Double }

private func goodLevel(_ r: Reading, _ depth: Double) -> Double? {
  guard let l = r.levelCm, l > 0.5, l < depth - 3, num(r.raw?["echo_ok"]) != 0 else { return nil } // under 3 cm is too close to trust
  return l
}
private func goodSoil(_ r: Reading) -> Double? {
  guard let s = r.soilPct ?? num(r.raw?["soil_pct"]), s > 0, s < 100 else { return nil }
  return s
}

private func patch(_ r: Reading, _ g: Good, _ depth: Double, _ ms: Millis, _ id: Int) -> Reading {
  let real = goodLevel(r, depth)
  let level = real ?? fixed(g.level + wobble(ms, 0.4), 1)
  let lvl = real.flatMap { abs($0 - level) < 0.5 ? $0 : nil }
  let soil = goodSoil(r) ?? fixed(g.soil + wobble(ms, 0.8, 41 * 60_000), 1)
  let fix = goodFix(r)
  let distance = fixed(depth - level, 1)
  let echo = Int(jsRound((distance / 0.0343) * 2))
  let raw = r.raw ?? [:]
  let gps = raw["gps"]?.objectValue ?? [:]
  var out = r
  out.id = id
  out.createdAt = jsISO(ms)
  out.levelCm = level
  out.soilPct = soil
  var o = raw
  o["distance_cm"] = lvl != nil ? raw["distance_cm"] : .double(distance)
  o["echo_ok"] = lvl != nil ? raw["echo_ok"] : 5
  o["echo_us"] = lvl != nil ? raw["echo_us"] : .array([echo, echo + 3, echo - 2, echo + 1, echo].map { .integer($0) })
  o["soil_pct"] = .double(soil)
  o["soil_adc"] = goodSoil(r) != nil ? raw["soil_adc"] : .integer(Int(jsRound((soil / 100) * 1500)))
  o["rssi"] = num(raw["rssi"]) != nil ? raw["rssi"] : .integer(Int(jsRound(-55 + wobble(ms, 4, 5 * 60_000))))
  o["gps"] = .object(fix != nil ? gps : gps.merging([
    "fix": true, "lat": .double(g.lat), "lng": .double(g.lng), "sats": 8, "hdop": 0.9, "age_ms": 800,
    "chars": num(gps["chars"]) != nil ? gps["chars"]! : 1,
  ]) { $1 })
  out.raw = o
  return out
}

// rows: one probe's readings, newest first. Returns the same order.
// here: the phone's position, used when the probe has no good GPS fix (it's next to the phone)
public func demoFill(_ rows: [Reading], _ probe: Probe, _ now: Millis, _ here: Coord?) -> [Reading] {
  guard let first = rows.first, first.raw != nil else { return rows } // only real hardware probes
  let depth = probe.depthCm ?? 30
  let old = Array(rows.reversed())
  // start from the first good values anywhere in the history
  let at = here ?? old.lazy.compactMap(goodFix).first ?? Coord(lat: probe.homeLat ?? probe.lat, lng: probe.homeLng ?? probe.lng)
  var g = Good(level: old.lazy.compactMap { goodLevel($0, depth) }.first ?? depth * 0.8,
               soil: old.lazy.compactMap(goodSoil).first ?? 42, lat: at.lat, lng: at.lng)
  var out: [Reading] = []
  var fake = -1
  func fill(_ from: Millis, _ to: Millis, _ like: Reading) {
    var k = 1, ms = from + STEP
    while ms < to - STEP / 2 && k <= MAX_FILL {
      var r = like
      r.raw = (like.raw ?? [:]).merging(["echo_ok": 0, "soil_pct": 0, "soil_adc": 0, "gps": ["fix": false]]) { $1 }
      out.append(patch(r, g, depth, ms, fake))
      fake -= 1; k += 1; ms += STEP
    }
  }
  for (i, r) in old.enumerated() {
    if i > 0 && time(r) - time(old[i - 1]) > MAX_GAP { fill(time(old[i - 1]), time(r), old[i - 1]) }
    let f = goodFix(r)
    if f != nil {
      out.append(r)
    } else {
      let gps = r.raw?["gps"]?.objectValue ?? [:]
      var x = r
      x.raw = (r.raw ?? [:]).merging(["gps": .object(gps.merging([
        "fix": true, "lat": .double(g.lat), "lng": .double(g.lng), "sats": 8, "hdop": 0.9, "age_ms": 800,
      ]) { $1 })]) { $1 }
      out.append(x)
    }
    g.level = goodLevel(r, depth) ?? g.level
    g.soil = goodSoil(r) ?? g.soil
    if let f, here == nil { g.lat = f.lat; g.lng = f.lng }
  }
  return story(out, depth, now).reversed()
}

// A past event to point at in the live demo: this morning the trough ran low (a stuck float
// valve), the alert fired, and it refilled once the valve was freed. It sits 4 to 2 hours ago.
private let LOW_AT: Millis = 4 * 60 * 60_000
private func story(_ rows: [Reading], _ depth: Double, _ now: Millis) -> [Reading] {
  var out = rows
  let low = depth * 0.14 // under the 25% limit
  let a = now - LOW_AT, b = now - LOW_AT / 2
  let edge: Millis = 20 * 60_000 // drains over 20 min, refills over 20 min
  for i in out.indices {
    let ms = time(out[i])
    guard ms >= a, ms <= b, let l = out[i].levelCm else { continue }
    let f = min(1, (ms - a) / edge, (b - ms) / edge)
    let level = fixed(l + (low + wobble(ms, 0.3, 7 * 60_000) - l) * f, 1)
    let echo = Int(jsRound(((depth - level) / 0.0343) * 2))
    out[i].levelCm = level
    out[i].raw = (out[i].raw ?? [:]).merging([
      "distance_cm": .double(fixed(depth - level, 1)), "echo_ok": 5,
      "echo_us": .array([echo, echo + 2, echo - 1, echo, echo + 1].map { .integer($0) }),
    ]) { $1 }
  }
  return out
}

// The seeded probes (no `raw`) report every 30 min. In demo mode they carry on from their last
// reading up to now, and two of them drift into a believable alert over the next few hours:
// the Dam's turbidity climbs after rain and Bore 1's paddock dries out.
private let SEED_STEP: Millis = 30 * 60_000
private let SEED_MAX: Millis = 2 * 24 * 60 * 60_000
private let RAMP: Millis = 3 * 60 * 60_000
private let SCENARIO: [String: [(MetricKey, Double)]] = [
  "Dam": [(.turbidity, 14.2)],
  "Bore 1": [(.soilPct, 16.5)],
]

public func demoSeeded(_ rows: [Reading], _ probe: Probe, _ now: Millis) -> [Reading] {
  guard let last = rows.first, last.raw == nil else { return rows }
  var out: [Reading] = []
  var ms = time(last) + SEED_STEP
  while ms <= now && ms - time(last) <= SEED_MAX {
    let w = { (amp: Double, p: Double) in wobble(ms, amp, p) }
    var r = last
    r.id = -Int((ms / 1000).rounded(.down)) // stable per slot, so handled/snoozed alerts stay that way
    r.createdAt = jsISO(ms)
    r.turbidity = last.turbidity.map { fixed($0 + w(0.4, 3.1 * 3_600_000), 2) }
    r.ph = last.ph.map { fixed($0 + w(0.05, 5.3 * 3_600_000), 2) }
    r.tds = last.tds.map { fixed($0 + w(6, 4.2 * 3_600_000), 1) }
    r.tempC = last.tempC.map { fixed($0 + w(0.6, 12 * 3_600_000), 2) }
    r.levelCm = last.levelCm.map { fixed($0 + w(2, 7 * 3_600_000), 1) }
    r.soilPct = last.soilPct.map { fixed($0 + w(1, 9 * 3_600_000), 1) }
    out.append(r)
    ms += SEED_STEP
  }
  // ramp the scenario in from the last real reading, so the alert's start time stays put
  let s = SCENARIO[probe.name] ?? []
  let from = time(last)
  var all = rows + out
  for i in all.indices {
    let f = min(1, max(0, (time(all[i]) - from) / RAMP))
    if f == 0 { continue }
    for (k, target) in s {
      if let base = all[i][k] { all[i][k] = fixed(base + (target - base) * f, 2) }
    }
  }
  return all[rows.count...].reversed() + all[..<rows.count]
}
