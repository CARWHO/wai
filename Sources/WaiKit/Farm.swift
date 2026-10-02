import Foundation

// Pure farm computations. The store calls these; the UI reads the results.

public struct FarmSnapshot: Sendable {
  public var views: [ProbeView]
  public var readings: [Reading] // enriched, newest first
  public var alerts: [Alert]
  public var farmScore: Int
  public var subScores: FarmSubScores
  public init(views: [ProbeView], readings: [Reading], alerts: [Alert], farmScore: Int, subScores: FarmSubScores) {
    self.views = views; self.readings = readings; self.alerts = alerts; self.farmScore = farmScore; self.subScores = subScores
  }
}

public struct FarmSubScores: Sendable {
  public var level: Int, soil: Int, quality: Double, devices: Int // quality is .nan when no probe measures it
  public init(level: Int, soil: Int, quality: Double, devices: Int) {
    self.level = level; self.soil = soil; self.quality = quality; self.devices = devices
  }
}

// Metric alerts: which measurements each kind watches
private let WATCH: [AlertKind: [Metric]] = [
  .quality: METRICS.filter(\.wq),
  .level: [metric(.pctFull)],
  .soil: [metric(.soilPct)],
]

// 0-100 sub-scores per probe
public func levelScore(_ pct: Double?) -> Double { pct.map { min(100, $0 * 2) } ?? .nan }
public func soilScore(_ s: Double?) -> Double {
  guard let s else { return .nan }
  return s < 30 ? (s / 30) * 100 : s > 80 ? max(0, ((100 - s) / 20) * 100) : 100
}
func avg(_ xs: [Double]) -> Double { mean(xs.filter { !$0.isNaN }) }
// `x || 0` for a number
private func orZero(_ x: Double) -> Double { x.isNaN ? 0 : x }
// weighted mean over the parts that have data
func weighted(_ parts: [(Double, Double)]) -> Int {
  let ok = parts.filter { !$0.0.isNaN }
  let w = ok.reduce(0) { $0 + $1.1 }
  return w != 0 ? Int(jsRound(ok.reduce(0) { $0 + $1.0 * $1.1 } / w)) : 0
}

// `b.created_at.localeCompare(a.created_at)` for ISO timestamps: ICU puts "." before "+",
// code point order puts it after. Everything else in these strings orders the same both ways.
func newestFirst(_ a: Reading, _ b: Reading) -> Bool {
  let key = { (s: String) in s.unicodeScalars.map { $0 == "." ? 0x20 : $0.value } }
  return key(b.createdAt).lexicographicallyPrecedes(key(a.createdAt))
}

/// Everything the screens need, from the raw rows (newest first, as stored) and the UI state.
/// - rows: readings as stored, newest first
/// - now: ms since epoch
/// - here: the phone position, if known
/// - demo: demo mode on
/// - handled / snoozed: alert keys the farmer dismissed, and keys with the ms they wake up
public func computeFarm(probes: [Probe], rows: [Reading], now: Millis, here: Coord?, demo: Bool,
                        handled: Set<String>, snoozed: [String: Millis]) -> FarmSnapshot {
  let depth = Dictionary(probes.map { ($0.id, $0.depthCm) }, uniquingKeysWith: { $1 })
  let src = demo
    ? probes.flatMap { p in
      let mine = rows.filter { $0.probeId == p.id }
      return mine.first?.raw != nil ? demoFill(mine, p, now, here) : demoSeeded(mine, p, now)
    }.sorted(by: newestFirst)
    : rows
  let readings = src.map { enrich($0, depth[$0.probeId] ?? nil) }

  let views = probes.map { probe -> ProbeView in
    let mine = readings.filter { $0.probeId == probe.id }
    let history = Array(mine.reversed())
    let latest = mine.first
    let hardware = latest?.raw != nil
    let iv = interval(history)
    let online = hardware
      ? now - time(latest!) < max(Limits.offlineMinMs, 3 * orZero(iv))
      : isOnline(latest, now: now)
    let scores = ProbeView.SubScores(level: levelScore(latest?.pctFull), soil: soilScore(latest?.soilPct), quality: score(latest))
    let geo = geofence(probe, history)
    var s = latest != nil ? Int(jsRound(orZero(avg([scores.level, scores.soil, scores.quality])))) : 0
    if geo?.moved == true || (hardware && !online) { s = min(s, 40) }
    // Place a hardware probe by its last good GPS fix (XC3710), else next to the phone,
    // else where the probes table says.
    let fix = recentFixes(history).first
    let located: ProbeView.Located? = fix != nil ? .gps : here != nil && hardware ? .phone : nil
    var placed = probe
    if let at = fix ?? (located == .phone ? here : nil) { placed.lat = at.lat; placed.lng = at.lng }
    return ProbeView(probe: placed, latest: latest, history: history, score: s, status: status(Double(s)), online: online,
                     hardware: hardware, interval: iv, scores: scores, emptyIn: timeToEmpty(history),
                     visits: hardware ? visits(history) : [], geo: geo, located: located)
  }

  var alerts: [Alert] = []
  for v in views {
    guard let latest = v.latest else { continue }
    let mine = Array(v.history.reversed()) // newest first
    func add(_ kind: AlertKind, _ first: Reading, _ title: String, _ detail: [String]) {
      let key = "\(v.probe.id):\(kind.rawValue):\(first.id)"
      if handled.contains(key) || (snoozed[key] ?? 0) > now { return }
      alerts.append(Alert(id: "\(v.probe.id)~\(kind.rawValue)", key: key, kind: kind, probe: v.probe, since: first.createdAt,
                          reading: latest, title: title, detail: detail))
    }

    if v.hardware && !v.online {
      add(.offline, latest, "Probe offline", ["Last heard \(ago(latest.createdAt, now: now))", "Usually reports every \(every(v.interval))"])
    }

    if let geo = v.geo, geo.moved {
      // walk back to the first fix outside the geofence; readings without a good fix don't break the streak
      var first = latest
      for r in mine {
        guard let f = goodFix(r) else { continue }
        if metres(geo.home, f) <= geo.radius { break }
        first = r
      }
      add(.moved, first, "Probe moved", ["\(jsString(jsRound(geo.distance))) m from home · geofence \(jsString(geo.radius)) m"])
    }

    for kind in [AlertKind.level, .soil, .quality] {
      let cur = issues(latest, WATCH[kind]!)
      if cur.isEmpty { continue }
      var first = latest
      for r in mine {
        if issues(r, WATCH[kind]!).isEmpty { break }
        first = r
      }
      add(kind, first, cur.map(issueTitle).joined(separator: ", "), cur.map { i in
        "\(i.m.wq ? "\(i.m.name) " : "")\(withUnit(i.m, i.x))\(i.m.key == .pctFull ? " full" : i.m.key == .soilPct ? " moisture" : "") · limit \(limitText(i.m))"
      })
    }
  }

  let subScores = FarmSubScores(
    level: Int(jsRound(orZero(avg(views.map(\.scores.level))))),
    soil: Int(jsRound(orZero(avg(views.map(\.scores.soil))))),
    quality: jsRound(avg(views.map(\.scores.quality))), // NaN when no probe measures quality
    devices: views.isEmpty ? 0 : Int(jsRound(Double(views.filter(\.online).count) / Double(views.count) * 100)))
  let farmScore = weighted([(Double(subScores.level), 0.35), (Double(subScores.soil), 0.25), (subScores.quality, 0.2), (Double(subScores.devices), 0.2)])
  return FarmSnapshot(views: views, readings: readings, alerts: alerts, farmScore: farmScore, subScores: subScores)
}
