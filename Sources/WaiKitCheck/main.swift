import Foundation
import Supabase
import WaiKit

checkClose("parseISO plain", parseISO("2026-09-29T10:00:00+00:00"), 1_790_676_000_000, tol: 1e-12)
checkClose("parseISO 6 fractional digits", parseISO("2026-09-29T10:00:00.123456+00:00"), 1_790_676_000_123, tol: 1e-12)

// The model decodes real rows
let probes = try fixture("probes.json", as: [Probe].self)
let rows = try fixture("readings.json", as: [Reading].self)
let synthProbes = try fixture("synthetic-probes.json", as: [Probe].self)
let synthRows = try fixture("synthetic-readings.json", as: [Reading].self)
let meta = try fixture("meta.json", as: AnyJSON.self)
let now = meta["now"].d
let tz = TimeZone(identifier: "Pacific/Auckland")!
check("fixtures have rows", !probes.isEmpty && !rows.isEmpty)

func enrichAll(_ ps: [Probe], _ rs: [Reading]) -> [Reading] {
  let depth = Dictionary(ps.map { ($0.id, $0.depthCm) }, uniquingKeysWith: { $1 })
  return rs.map { enrich($0, depth[$0.probeId] ?? nil) }
}
let enriched = enrichAll(probes, rows)
let health = { (c: Check) -> AnyJSON in ["part": j(c.part), "s": j(c.s.rawValue), "text": j(c.text)] }

// derive.json
let derive = try fixture("derive.json", as: AnyJSON.self)
for (r, e) in zip(enriched, derive["readings"].arr) {
  checkJSON("derive reading \(r.id)", ["id": j(r.id), "pct_full": j(r.pctFull), "soil_pct": j(r.soilPct), "goodFix": j(goodFix(r))], e)
}
checkEqual("derive reading count", enriched.count, derive["readings"].arr.count)
for (set, ps, rs) in [("probes", probes, rows), ("synthetic", synthProbes, synthRows)] {
  let all = enrichAll(ps, rs)
  for (p, e) in zip(ps, derive[set].arr) {
    let h = Array(all.filter { $0.probeId == p.id }.reversed())
    let v = visits(h)
    let latest = h.last
    checkJSON("derive \(set) \(p.name)", [
      "id": j(p.id), "interval": j(interval(h)), "timeToEmpty": j(timeToEmpty(h)), "visits": j(v, j),
      "recentFixes": j(recentFixes(h, 3), j), "recentFix": j(recentFixes(h), j), "geofence": j(geofence(p, h)),
      "visitsByDay": j(visitsByDay(v, now, timeZone: tz)) { ["k": j($0.k), "day": j($0.day), "n": j($0.n)] },
      "healthOnline": j(WaiKit.health(latest, true, ago(latest?.createdAt, now: now)), health),
      "healthOffline": j(WaiKit.health(latest, false, ago(latest?.createdAt, now: now)), health),
    ], e)
  }
  checkEqual("derive \(set) count", ps.count, derive[set].arr.count)
}
for (i, e) in derive["metres"].arr.enumerated() {
  let c = { (x: AnyJSON) in Coord(lat: x["lat"].d, lng: x["lng"].d) }
  checkClose("metres \(i)", metres(c(e["a"]), c(e["b"])), e["m"].d, tol: 1e-9)
}

// metrics.json
let metrics = try fixture("metrics.json", as: AnyJSON.self)
let issue = { (i: Issue) -> AnyJSON in ["key": j(i.m.key.rawValue), "state": j(i.state.rawValue), "x": j(i.x), "title": j(issueTitle(i))] }
for (r, e) in zip(enriched, metrics["readings"].arr) {
  checkJSON("metrics reading \(r.id)", [
    "id": j(r.id), "score": j(score(r)), "status": j(status(score(r)).rawValue), "breaches": j(breaches(r), j),
    "issues": j(issues(r), issue), "wq": j(issues(r, METRICS.filter(\.wq)), issue),
  ], e)
}
checkEqual("metrics reading count", enriched.count, metrics["readings"].arr.count)
let pairs = { (e: AnyJSON, f: (Double) -> String) -> AnyJSON in j(e.arr) { p in [p[0], j(f(p[0].d))] } }
for (m, e) in zip(METRICS, metrics["metrics"].arr) {
  checkJSON("metric \(m.key)", [
    "key": j(m.key.rawValue), "name": j(m.name), "unit": j(m.unit), "digits": j(m.digits), "min": j(m.min), "max": j(m.max),
    "low": j(m.low), "high": j(m.high), "wq": j(m.wq), "metricName": j(metricName(m)), "hasLimit": j(hasLimit(m)),
    "limitText": j(limitText(m)), "limitLines": j(limitLines(m), j),
    "fmt": pairs(e["fmt"]) { fmt(m, $0) }, "withUnit": pairs(e["withUnit"]) { withUnit(m, $0) },
    "state": pairs(e["state"]) { state(m, $0).rawValue },
    "issueTitle": j([MetricState.high, .low]) { s in [j(s.rawValue), j(issueTitle(Issue(m: m, x: .nan, state: s)))] },
  ], e)
}
checkEqual("metric count", METRICS.count, metrics["metrics"].arr.count)
checkJSON("primary", j(PRIMARY) { j($0.key.rawValue) }, metrics["primary"])
checkJSON("present", j(probes) { p in
  ["id": j(p.id), "keys": j(present(Array(enriched.filter { $0.probeId == p.id }.reversed()))) { j($0.key.rawValue) }]
}, metrics["present"])
checkJSON("status", pairs(metrics["status"]) { status($0).rawValue }, metrics["status"])
checkJSON("mean", j(metrics["mean"].arr) { p in [p[0], j(mean(p[0].arr.map(\.d)))] }, metrics["mean"])
checkJSON("median", j(metrics["median"].arr) { p in [p[0], j(median(p[0].arr.map(\.d)))] }, metrics["median"])
checkJSON("duration", pairs(metrics["duration"], duration), metrics["duration"])
checkJSON("every", pairs(metrics["every"], every), metrics["every"])
checkJSON("ago", j(metrics["ago"].arr) { p in [p[0], j(ago(p[0].s, now: now))] }, metrics["ago"])
checkJSON("isOnline", j(metrics["isOnline"].arr) { p in [p[0], j(isOnline(rows.first { $0.id == Int(p[0].d) }, now: now))] }, metrics["isOnline"])

// farm.json: the FarmProvider result for each data set, demo mode, phone position and dismissal
let runs = try fixture("farm.json", as: [AnyJSON].self)
for run in runs {
  let (ps, rs) = run["set"] == "real" ? (probes, rows) : (synthProbes, synthRows)
  let here = run["here"].isNil ? nil : Coord(lat: run["here"]["lat"].d, lng: run["here"]["lng"].d)
  let demo = run["demo"].boolValue!
  let snoozed = (run["snoozed"].objectValue ?? [:]).mapValues(\.d)
  let f = computeFarm(probes: ps, rows: rs, now: now, here: here, demo: demo,
                      handled: Set(run["handled"].arr.compactMap(\.s)), snoozed: snoozed)
  let name = "farm \(run["set"].s!) demo=\(demo) here=\(here != nil) handled=\(run["handled"].arr.count) snoozed=\(snoozed.count)"
  var exp = run.objectValue!
  exp["views"] = j(run["views"].arr) { v in
    var o = v.objectValue!
    o["probe"] = .object(v["probe"].objectValue!.filter { $0.key != "created_at" })
    return .object(o)
  }
  exp["alerts"] = j(run["alerts"].arr) { a in
    var o = a.objectValue!
    o["probe"] = .object(a["probe"].objectValue!.filter { $0.key != "created_at" })
    return .object(o)
  }
  checkJSON(name, [
    "set": run["set"], "demo": run["demo"], "here": run["here"], "handled": run["handled"], "snoozed": run["snoozed"],
    "readingIds": j(f.readings) { j($0.id) },
    "readings": run["readings"].isNil ? .null : j(f.readings, encoded),
    "views": j(f.views) { v in [
      "probe": encoded(v.probe), "latestId": j(v.latest?.id), "historyLength": j(v.history.count),
      "firstId": j(v.history.first?.id), "lastId": j(v.history.last?.id), "score": j(v.score), "status": j(v.status.rawValue),
      "online": j(v.online), "hardware": j(v.hardware), "interval": j(v.interval),
      "scores": ["level": j(v.scores.level), "soil": j(v.scores.soil), "quality": j(v.scores.quality)],
      "emptyIn": j(v.emptyIn), "visits": j(v.visits, j), "geo": j(v.geo), "located": j(v.located?.rawValue),
    ] },
    "alerts": j(f.alerts) { a in [
      "id": j(a.id), "key": j(a.key), "kind": j(a.kind.rawValue), "probeId": j(a.probe.id), "probe": encoded(a.probe),
      "since": j(a.since), "readingId": j(a.reading.id), "title": j(a.title), "detail": j(a.detail, j),
    ] },
    "subScores": ["level": j(f.subScores.level), "soil": j(f.subScores.soil), "quality": j(f.subScores.quality), "devices": j(f.subScores.devices)],
    "farmScore": j(f.farmScore),
  ], .object(exp))
}

finish()
