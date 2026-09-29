import SwiftUI
import WaiKit

// src/app/app/alerts/[id]/page.tsx
struct AlertDetailScreen: View {
  let id: String
  @Environment(FarmStore.self) var farm
  @Environment(Router.self) var router
  @State private var ai: AIAlert?

  var body: some View {
    // id is probe~kind; a bare probe id opens that probe's first alert
    let a = farm.alerts.first { $0.id == (id.removingPercentEncoding ?? id) } ?? farm.alerts.first { $0.probe.id == id }
    let v = farm.views.first { $0.probe.id == a?.probe.id }
    ScrollView {
      Group {
        if let a {
          AlertDetail(a: a, v: v, now: farm.now, ai: ai)
        } else {
          VStack(alignment: .leading, spacing: 0) {
            Header("Alert", back: router.back)
            if !farm.loading {
              Card(padding: EdgeInsets(top: 32, leading: 16, bottom: 32, trailing: 16)) {
                Text("No open alert here. It may have cleared or been handled.")
                  .foregroundStyle(Theme.muted).multilineTextAlignment(.center).frame(maxWidth: .infinity)
              }
            }
          }
        }
      }
      .padding(.horizontal, Theme.gutter)
      .padding(.bottom, 112)
    }
    .background(Theme.paper)
    .task(id: a?.key) {
      ai = nil
      guard let a else { return }
      ai = await AIClient.shared.ask(kind: .alert, context: AlertContext(a: a, v: v, now: farm.now), key: a.key)
    }
  }
}

private func kindOf(_ m: Metric) -> AlertKind { m.wq ? .quality : m.key == .soilPct ? .soil : .level }

private func when(_ iso: String) -> String {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_NZ")
  f.setLocalizedDateFormatFromTemplate("dMMMhmm")
  return f.string(from: Date(timeIntervalSince1970: parseISO(iso) / 1000))
}

// usual = average before the problem started
private func usual(_ a: WaiKit.Alert, _ v: ProbeView?, _ k: Metric) -> Double {
  mean((v?.history ?? []).filter { $0.createdAt < a.since }.map { value($0, k) }.filter { !$0.isNaN })
}

// `+x.toFixed(d)`; NaN becomes null in JSON.stringify
private func fixed(_ x: Double, _ d: Int) -> Double? {
  let n = Double(toFixed(x, d)) ?? .nan
  return n.isNaN ? nil : n
}

private enum Step: CaseIterable {
  case handled, snooze
  var name: String { self == .handled ? "Mark handled" : "Snooze 1 hour" }
  var sub: String { self == .handled ? "Clears the alert until the next problem" : "Hides the alert, then shows it again if it's still happening" }
}

struct AlertDetail: View {
  let a: WaiKit.Alert, v: ProbeView?, now: Millis, ai: AIAlert?
  @Environment(FarmStore.self) var farm
  @Environment(Router.self) var router
  @State private var choice = Step.handled

  private var r: Reading { a.reading }
  private var list: [Issue] { issues(r).filter { kindOf($0.m) == a.kind } }
  private var bad: Color { .status(.bad) }

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      VStack(alignment: .leading, spacing: 0) {
        Header(a.probe.name, back: router.back)
        Label { Text("● Alert").foregroundStyle(Theme.alert) + Text(" · started \(ago(a.since, now: now))") }
        Text(a.title).font(WaiFont.sans(28, .medium)).tracking(28 * Theme.Tracking.tight).padding(.top, 4)
      }

      if !list.isEmpty { table }

      if a.kind == .moved, let v, let geo = v.geo {
        VStack(spacing: 0) {
          Row("From home") { Text("\(jsString(jsRound(geo.distance))) m").foregroundStyle(bad) }
          Row("Geofence") { Text("\(jsString(geo.radius)) m") }
          if let g = gps(r) {
            Row("GPS now") { Text(g.fix ? "\(jsString(g.sats ?? 0)) sats · HDOP \(g.hdop.map { toFixed($0, 1) } ?? "–")" : "No fix") }
          }
          Row("Where it is now", sub: "Last good fix", action: { router.openMap(probe: a.probe.id) }) {
            Text("\(toFixed(v.probe.lat, 5)), \(toFixed(v.probe.lng, 5))")
          }
        }
        .padding(.top, -12)
      }

      if a.kind == .offline, let v {
        VStack(spacing: 0) {
          Row("Last reading") { Text(when(r.createdAt)) }
          Row("Last heard") { Text(ago(r.createdAt, now: now)).foregroundStyle(bad) }
          Row("Usually reports every") { Text(every(v.interval)) }
          Row("Link") { Text(r.raw?["via"] == .string("lora") ? "LoRa bridge" : "Wi-Fi") }
        }
        .padding(.top, -12)
      }

      AICard(s: v?.status == .bad ? .bad : .watch, note: ai.map { $0.source == "openai" ? "From this probe's readings" : "Standard guidance" }) {
        if let ai {
          VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
              Label("What's happening")
              relaxed("\(ai.wrong) \(ai.cause)")
            }
            AINext("\n" + ai.action)
            VStack(alignment: .leading, spacing: 4) {
              Label("If nothing changes")
              relaxed(ai.risk)
            }
          }
        } else {
          AIThinking("Reading this probe's data…")
        }
      }

      VStack(alignment: .leading, spacing: 10) {
        Text("What next?").font(WaiFont.sans(20, .medium)).tracking(20 * Theme.Tracking.tight)
        ForEach(Step.allCases, id: \.self) { c in
          let on = choice == c
          Button { choice = c } label: {
            HStack(spacing: 12) {
              VStack(alignment: .leading, spacing: 0) {
                Text(c.name).font(WaiFont.sans(16, .medium))
                Text(c.sub).font(WaiFont.sans(13)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              Circle().strokeBorder(on ? Theme.ink : Theme.line, lineWidth: 2).frame(width: 24, height: 24)
                .overlay { if on { Circle().fill(Theme.ink).frame(width: 12, height: 12) } }
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: Theme.Radius.card).fill(Theme.card))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card).strokeBorder(on ? Theme.ink : Theme.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
          }
          .buttonStyle(.plain)
        }
      }

      HStack(spacing: 24) {
        Button { router.back() } label: { Text("Cancel").font(WaiFont.sans(16)).underline() }.buttonStyle(.plain)
        Button(action: confirm) {
          Text("Confirm").font(WaiFont.sans(16)).foregroundStyle(Theme.paper)
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(Capsule().fill(Theme.ink))
        }
        .buttonStyle(.plain)
      }
    }
  }

  private func relaxed(_ s: String) -> some View {
    Text(s).font(WaiFont.sans(15)).lineSpacing(15 * 0.625 - 3).fixedSize(horizontal: false, vertical: true)
  }

  private var table: some View {
    let head = { (s: String) in Text(s).monoCaps(11).foregroundStyle(Theme.muted).padding(.bottom, 6) }
    let line = Rectangle().fill(Theme.line).frame(height: 1)
    return Grid(alignment: .trailing, horizontalSpacing: 16, verticalSpacing: 0) {
      GridRow {
        Color.clear.frame(height: 0).gridCellUnsizedAxes(.horizontal)
        head("Now"); head("Usual"); head("Limit")
      }
      ForEach(list, id: \.m.key) { i in
        line
        GridRow {
          (Text(i.m.name).font(WaiFont.sans(15))
            + Text(!i.m.unit.isEmpty && i.m.unit != "%" ? " \(i.m.unit)" : "").font(WaiFont.mono(12)).foregroundStyle(Theme.muted))
            .frame(maxWidth: .infinity, alignment: .leading)
          Text(fmt(i.m, i.x)).foregroundStyle(bad)
          Text(fmt(i.m, usual(a, v, i.m)))
          Text(replaceFirst(limitText(i.m), " \(i.m.unit)")).foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 10)
      }
      if a.kind == .level, let emptyIn = v?.emptyIn {
        line
        GridRow {
          Text("Empty in").font(WaiFont.sans(15)).frame(maxWidth: .infinity, alignment: .leading)
          Text(duration(emptyIn)).foregroundStyle(bad)
          Color.clear.frame(width: 0, height: 0)
          Color.clear.frame(width: 0, height: 0)
        }
        .padding(.vertical, 10)
      }
    }
    .font(WaiFont.mono(14))
  }

  // String.prototype.replace with a string pattern: first match only
  private func replaceFirst(_ s: String, _ p: String) -> String {
    guard let range = s.range(of: p) else { return s }
    return s.replacingCharacters(in: range, with: "")
  }

  private func confirm() {
    if choice == .handled {
      farm.handle(a.key)
      router.back()
      router.openHome()
    } else {
      farm.snooze(a.key, ms: HOUR)
      router.openAlerts()
    }
  }
}

// The context object the TSX sends to /api/ai, with the same keys; nulls are kept like JSON.stringify keeps them
struct AlertContext: Encodable {
  let a: WaiKit.Alert, v: ProbeView?, now: Millis

  private struct Key: CodingKey {
    var stringValue: String
    init(_ s: String) { stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    var intValue: Int? { nil }
    init?(intValue: Int) { nil }
  }

  // an object with keys decided at run time
  private struct Obj: Encodable {
    var pairs: [(String, any Encodable)]
    func encode(to encoder: Encoder) throws {
      var c = encoder.container(keyedBy: Key.self)
      for (k, x) in pairs { try c.encode(x, forKey: Key(k)) }
    }
  }

  func encode(to encoder: Encoder) throws {
    let r = a.reading
    let history = v?.history ?? []
    // each out-of-limit reading: where it was when the alert started, now, and the last 3 h of movement
    let trend = issues(r).filter { kindOf($0.m) == a.kind }.map { i -> (String, any Encodable) in
      let since = history.filter { $0.createdAt >= a.since }
      let at = { (ms: Millis) in since.first { $0.t >= ms } }
      let start = value(since.first, i.m)
      let recent = at(r.t - 3 * HOUR) ?? since.first
      let over = duration((r.t - (recent?.t ?? .nan)) / HOUR)
      return (i.m.key.rawValue, Obj(pairs: [
        ("at_start", fixed(start, i.m.digits)), ("now", fixed(i.x, i.m.digits)),
        ("recent_change", fixed(i.x - value(recent, i.m), i.m.digits)), ("over", over),
      ]))
    }
    let usualObj = METRICS.compactMap { m in fixed(usual(a, v, m), m.digits).map { (m.key.rawValue, $0 as any Encodable) } }
    let o = Obj(pairs: [
      ("kind", a.kind.rawValue),
      ("probe", a.probe.name),
      ("title", a.title),
      ("detail", a.detail),
      ("started", ago(a.since, now: now)),
      ("now", Obj(pairs: [
        ("level_cm", r.levelCm), ("pct_full", r.pctFull.map { jsRound($0) }), ("soil_pct", r.soilPct),
        ("turbidity_ntu", r.turbidity), ("ph", r.ph), ("tds_ppm", r.tds), ("temp_c", r.tempC),
      ])),
      ("usual", Obj(pairs: usualObj)),
      ("trend", Obj(pairs: trend)),
      ("lat", a.probe.lat),
      ("lng", a.probe.lng),
      ("depth_cm", a.probe.depthCm),
      ("empty_in_h", v?.emptyIn.flatMap { fixed($0, 1) }),
      ("distance_m", v?.geo.map { jsRound($0.distance) }),
      ("geofence_m", a.probe.geofenceM),
      ("last_seen", ago(r.createdAt, now: now)),
      ("interval", v.map { every($0.interval) }),
      ("via_lora", r.raw?["via"] == .string("lora") ? 1 : 0),
    ])
    try o.encode(to: encoder)
  }
}
