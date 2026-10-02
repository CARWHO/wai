import SwiftUI
import WaiKit

// The web opens `?group=` and `?section=` as URLs; here they are local state.
private let DAY = 24 * HOUR
private let VERDICT_COLOR: [String: Color] = ["Apply now": .status(.good), "Wait for rain": .status(.watch)]
private let weekdayNarrow: DateFormatter = {
  let f = DateFormatter(); f.locale = Locale(identifier: "en_NZ"); f.dateFormat = "EEEEE"; return f
}()
private let monthLong: DateFormatter = {
  let f = DateFormatter(); f.locale = Locale(identifier: "en_NZ"); f.dateFormat = "MMMM"; return f
}()

// JS String.prototype.replace with a string pattern: the first occurrence only
private func replaceFirst(_ s: String, _ a: String, _ b: String) -> String {
  guard let r = s.range(of: a) else { return s }
  return s.replacingCharacters(in: r, with: b)
}

struct InsightsScreen: View {
  @Environment(FarmStore.self) private var farm
  @State private var tip = FarmTip()

  var body: some View {
    ScrollView { InsightsContent(tip: tip.tip) }
      .background(Theme.paper)
      .task(id: FarmTip.key(farm)) { await tip.load(farm) }
  }
}

private struct Item {
  var id: String, name: String, sub: String
  var s: Status? = nil, ai = false, metric: MetricKey? = nil, report = false
}
private struct Group {
  var id: String, title: String, sub: String? = nil, items: [Item]
}

private struct FertCtx: Encodable {
  struct Paddock: Encodable { var name: String; var soil_pct: Double }
  var soil_pct: Double, lat: Double, lng: Double, paddocks: [Paddock], month: String
}

// The page without its ScrollView, so it can be rendered offscreen
struct InsightsContent: View {
  var tip: AITip?
  @Environment(FarmStore.self) private var farm
  @Environment(Router.self) private var router
  @State private var mk = MetricKey.pctFull
  @State private var range = "1d"
  @State private var open: String? // ?section=
  @State private var group: String? // ?group=
  @State private var fertRes: (k: String, d: AIFertiliser)?

  // only measurements some probe actually sends
  private var shown: [Metric] { present(farm.readings).filter { $0.key != .tempC } }
  private var m: Metric { shown.first { $0.key == mk } ?? metric(.pctFull) }
  // periods are measured back from the newest reading
  private var now: Millis { farm.readings.first?.t ?? 0 }
  private func age(_ r: Reading) -> Millis { now - r.t }

  private func period(_ days: Double) -> (n: Int, bad: Int, pct: Int) {
    let rs = farm.readings.filter { age($0) < days * DAY }
    let bad = rs.filter { !issues($0).isEmpty }.count
    return (rs.count, bad, rs.isEmpty ? 0 : Int(jsRound(Double(rs.count - bad) / Double(rs.count) * 100)))
  }
  private var cards: [(name: String, n: Int, bad: Int, pct: Int)] {
    [("Today", period(1)), ("Last 7 days", period(7))].map { ($0.0, $0.1.n, $0.1.bad, $0.1.pct) }
  }

  // mean of each probe's mean, so a probe reporting every 5 s doesn't outweigh one reporting every 30 min
  private func avg(_ from: Double, _ to: Double, _ x: Metric) -> Double {
    mean(farm.views.map { v in
      mean(v.history.filter { age($0) >= from * DAY && age($0) < to * DAY }.map { value($0, x) }.filter { !$0.isNaN })
    }.filter { !$0.isNaN })
  }
  private func avgOf(_ x: Metric) -> Double { avg(0, 1, x) }
  private var unit: String { m.unit.isEmpty ? "pH" : m.unit }

  // trough visits, only for probes with an ultrasonic sensor
  private var troughs: [ProbeView] {
    farm.views.filter { v in v.hardware && v.history.contains { r in r.raw?["distance_cm"].map { $0 != .null } ?? false } }
  }

  // fertiliser timing: average soil now, forecast at the farm
  private var soil: Double { mean(farm.views.compactMap { $0.latest?.soilPct }) }
  private var at: ProbeView? { farm.views.first { $0.located != nil } ?? farm.views.first }
  private var fertKey: String? {
    guard !farm.loading, let at, !soil.isNaN else { return nil }
    return "\(jsString((now / HOUR).rounded(.down))):\(jsString(jsRound(soil / 5))):\(toFixed(at.probe.lat, 2)),\(toFixed(at.probe.lng, 2))"
  }
  private var fert: AIFertiliser? { fertRes.flatMap { $0.k == fertKey ? $0.d : nil } }
  private var fertS: Status {
    guard let fert else { return .watch }
    return fert.verdict == "Apply now" ? .good : fert.verdict == "Wait for rain" ? .watch : .bad
  }

  private var pct: Int { cards[0].pct }
  private var live: Int { farm.views.filter(\.online).count }
  private var visitsToday: Int { troughs.reduce(0) { $0 + visitsByDay($1.visits, now, 1)[0].n } }
  private var worst: [ProbeView] { farm.views.filter { $0.status != .good } }

  // Settings-style drill-down: groups of rows, each saying what's going on in a line; tap one to open it.
  private var GROUPS: [Group] {
    let alerts = farm.alerts, views = farm.views
    let full = fmt(metric(.pctFull), avgOf(metric(.pctFull)))
    let soilAvg = fmt(metric(.soilPct), avgOf(metric(.soilPct)))
    var ai = [Item(id: "today", name: "Today on the farm", sub: tip?.title ?? "Thinking…", ai: true)]
    if !soil.isNaN {
      ai.append(Item(id: "fertiliser", name: "Fertiliser timing",
                     sub: fert.map { "\($0.verdict) · soil \(jsString(jsRound(soil)))%" } ?? "Checking the forecast…", s: fertS, ai: true))
    }
    ai.append(Item(id: "alerts", name: "Alert analysis",
                   sub: alerts.isEmpty ? "No open alerts" : "\(alerts.count) open · \(alerts[0].probe.name) \(alerts[0].title.lowercased())",
                   s: alerts.isEmpty ? .good : .bad, ai: true))
    var water = [Item(id: "level", name: "Water level", sub: "\(full)% full on average today", s: status(Double(farm.subScores.level)), metric: .pctFull)]
    if !troughs.isEmpty { water.append(Item(id: "visits", name: "Trough visits", sub: "\(visitsToday) today")) }
    let probesS: Status = worst.contains { $0.status == .bad } ? .bad : !worst.isEmpty || live < views.count ? .watch : .good
    return [
      Group(id: "ai", title: "AI analytics", items: ai),
      Group(id: "water", title: "Water", sub: "\(full)% full\(troughs.isEmpty ? "" : " · \(visitsToday) visits today")", items: water),
      Group(id: "soil", title: "Soil", sub: "\(soilAvg)% moisture on average today", items: [
        Item(id: "soil", name: "Soil moisture", sub: "\(soilAvg)% on average today", s: status(Double(farm.subScores.soil)), metric: .soilPct),
      ]),
      Group(id: "farm", title: "Farm", sub: "\(live) of \(views.count) probes live · \(pct)% within limits today", items: [
        Item(id: "probes", name: "Probes",
             sub: "\(live) of \(views.count) live\(worst.isEmpty ? "" : " · \(worst.map(\.probe.name).joined(separator: ", ")) need a look")", s: probesS),
        Item(id: "limits", name: "Time within limits", sub: "\(pct)% of today's readings", s: pct >= 95 ? .good : pct >= 80 ? .watch : .bad),
        Item(id: "trends", name: "All measurements", sub: "Charts over time"),
        Item(id: "report", name: "Farm report", sub: "Printable water and soil record", report: true),
      ]),
    ]
  }

  private func worstOf(_ items: [Item]) -> Status? {
    items.contains { $0.s == .bad } ? .bad : items.contains { $0.s == .watch } ? .watch : items.contains { $0.s != nil } ? .good : nil
  }

  private func openItem(_ x: Item) {
    if x.report { return router.openReport() }
    if let k = x.metric { mk = k } // MetricTrend: a single-measurement section opens on that measurement
    open = x.id
  }

  var body: some View {
    let groups = GROUPS
    VStack(alignment: .leading, spacing: 0) {
      if let x = groups.flatMap(\.items).first(where: { $0.id == open }) {
        VStack(alignment: .leading, spacing: 24) {
          Header(x.name, back: { open = nil })
          if x.metric != nil { trend(false) } else { sectionBody(x.id) }
        }
      } else if let g = groups.dropFirst().first(where: { $0.id == group }) {
        VStack(alignment: .leading, spacing: 24) {
          Header(g.title, back: { group = nil })
          VStack(spacing: 0) {
            ForEach(g.items, id: \.id) { item($0) }
            if g.id == "farm" {
              Row(sub: "Fills gaps in the probe's data", action: { farm.setDemo(!farm.demo) }, key: {
                HStack(spacing: 8) { Color.clear.frame(width: 8, height: 1); Text("Demo mode") }
              }) { Text(farm.demo ? "On" : "Off") }
            }
          }
          .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
          .padding(.top, -16)
        }
      } else {
        VStack(alignment: .leading, spacing: 28) {
          Header("Insights")
          VStack(spacing: 0) {
            ForEach(groups[0].items, id: \.id) { item($0) }
            ForEach(groups.dropFirst(), id: \.id) { g in
              let s = worstOf(g.items)
              // a group of one opens straight into it
              Row(sub: g.sub, action: {
                if g.items.count == 1 && !g.items[0].report { openItem(g.items[0]) } else { group = g.id }
              }, key: {
                HStack(spacing: 8) { dot(s); Text(g.title) }
              }) { EmptyView() }
            }
          }
          .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
          .padding(.top, -16)
        }
      }
    }
    .padding(.horizontal, Theme.gutter)
    .padding(.bottom, 112)
    .task(id: fertKey) {
      guard let k = fertKey, let at, fertRes?.k != k else { return }
      let views = farm.views
      let ctx = FertCtx(
        soil_pct: jsRound(soil), lat: at.probe.lat, lng: at.probe.lng,
        paddocks: views.compactMap { v in v.latest?.soilPct.map { FertCtx.Paddock(name: v.probe.name, soil_pct: jsRound($0)) } },
        month: monthLong.string(from: Date(timeIntervalSince1970: now / 1000)))
      if let d: AIFertiliser = await AIClient.shared.ask(kind: .fertiliser, context: ctx, key: k) { fertRes = (k, d) }
    }
  }

  @ViewBuilder private func dot(_ s: Status?) -> some View {
    if let s { Dot(s) } else { Color.clear.frame(width: 8, height: 8) }
  }

  // AI features look like every other row, with the sparkles after the name
  private func item(_ x: Item) -> some View {
    Row(action: { openItem(x) }, key: {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 8) {
          dot(x.s)
          Text(x.name)
          if x.ai { Sparkles(size: 14).foregroundStyle(Theme.healthy) }
        }
        Text(x.sub).font(WaiFont.mono(12))
          .foregroundStyle(x.s.map { $0 != .good ? Color.status($0) : Theme.muted } ?? Theme.muted)
      }
    }) { EmptyView() }
  }

  @ViewBuilder private func sectionBody(_ id: String) -> some View {
    switch id {
    case "today": todayCard
    case "fertiliser": fertCard
    case "alerts": AlertList()
    case "visits": ForEach(troughs) { visitCard($0) }
    case "probes": probeTable
    case "limits": limitCards
    case "trends": trend(true)
    default: EmptyView()
    }
  }

  private var todayCard: some View {
    AICard(s: status(Double(farm.farmScore)), note: tip.map { $0.source == "openai" ? "From your probes now" : "Standard guidance" }) {
      if let tip {
        VStack(alignment: .leading, spacing: 8) {
          Text(tip.title).font(WaiFont.sans(24, .medium)).tracking(24 * Theme.Tracking.tight)
          Text(tip.body).font(WaiFont.sans(15)).lineSpacing(15 * 0.625 - 3)
        }
      } else {
        AIThinking("Reading every probe…")
      }
    }
  }

  private var fertCard: some View {
    AICard(s: fertS, note: fert.map { $0.source == "openai" ? "Soil + rain forecast" : "Standard guidance" }) {
      VStack(alignment: .leading, spacing: 8) {
        if let fert {
          Text(fert.verdict).font(WaiFont.sans(24, .medium)).tracking(24 * Theme.Tracking.tight)
            .foregroundStyle(VERDICT_COLOR[fert.verdict] ?? .status(.bad))
          Text(fert.reason).font(WaiFont.sans(15)).lineSpacing(15 * 0.625 - 3)
        } else {
          AIThinking("Checking the rain forecast…")
        }
        HStack {
          Text("Soil \(jsString(jsRound(soil)))% avg")
          Spacer(minLength: 8)
          Text(fert?.rain48hMm.map { "\(jsString($0)) mm rain next 48 h" } ?? (fert != nil ? "Forecast unavailable" : ""))
        }
        .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
        .padding(.top, 4)
      }
    }
  }

  private func visitCard(_ v: ProbeView) -> some View {
    let days = visitsByDay(v.visits, now, 7)
    return Card(action: { router.openProbe(v.probe.id) }) {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .firstTextBaseline) {
          Text(v.probe.name).font(WaiFont.sans(16, .medium))
          Spacer()
          Text("last 7 days").font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
        }
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text("\(days.last!.n)").font(WaiFont.sans(30, .medium)).tracking(30 * Theme.Tracking.tight).monospacedDigit()
          Text("visits today").font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
        }
        Bars(days.map { Bars.Datum(k: $0.k, label: weekdayNarrow.string(from: Date(timeIntervalSince1970: $0.day / 1000)), n: $0.n) }, height: 48)
        Text("Counted from the level sensor: an animal at the trough reads closer than the water.")
          .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
      }
    }
  }

  private var probeTable: some View {
    let table = Grid(alignment: .trailing, horizontalSpacing: 8, verticalSpacing: 0) {
      GridRow(alignment: .top) {
        Text("Probe").gridColumnAlignment(.leading)
        ForEach(shown, id: \.key) { x in
          VStack(alignment: .trailing, spacing: 0) {
            Text(x.key == .soilPct ? "Soil" : x.name)
            if !x.unit.isEmpty && x.unit != "%" { Text(x.unit) }
          }
        }
      }
      .monoCaps(11).foregroundStyle(Theme.muted)
      .padding(.bottom, 6)
      ForEach(farm.views) { v in
        Rectangle().fill(Theme.line).frame(height: 1).gridCellUnsizedAxes(.horizontal)
        GridRow {
          HStack(spacing: 8) { Dot(v.status); Text(v.probe.name) }
            .font(WaiFont.sans(14, .medium)).lineLimit(1).fixedSize()
          ForEach(shown, id: \.key) { x in
            let n = value(v.latest, x)
            let out = !n.isNaN && state(x, n) != .normal
            Text(n.isNaN ? "·" : fmt(x, n))
              .font(WaiFont.mono(13, out ? .medium : .regular))
              .foregroundStyle(out ? Color.status(.bad) : n.isNaN ? Theme.muted : Theme.ink)
          }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { router.openProbe(v.probe.id) }
      }
    }
    return ViewThatFits(in: .horizontal) {
      table.frame(maxWidth: .infinity)
      ScrollView(.horizontal) { table.padding(.horizontal, Theme.gutter) }
        .scrollIndicators(.hidden)
        .padding(.horizontal, -Theme.gutter)
    }
  }

  private var limitCards: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 12) {
        ForEach(cards, id: \.name) { c in
          let s: Status = c.pct >= 95 ? .good : c.pct >= 80 ? .watch : .bad
          Card(action: { router.openReport() }) {
            Ring(value: Double(c.pct), size: 44, stroke: 4, color: .status(s)) { Text("\(c.pct)%").font(WaiFont.mono(10)) }
            Text(c.name).monoCaps().foregroundStyle(Theme.muted).padding(.top, 8)
            Text("\(c.n)").font(WaiFont.sans(32, .medium)).tracking(32 * Theme.Tracking.tight).monospacedDigit()
            Text("readings").font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
            HStack {
              Text("\(c.bad) outside limits").lineLimit(1)
              Spacer(minLength: 4)
              Icon("chevron", size: 16)
            }
            .font(WaiFont.mono(12))
            .padding(.top, 8)
            .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
            .padding(.top, 12)
          }
          .containerRelativeFrame(.horizontal) { w, _ in max(160, (w - 2 * Theme.gutter) * 0.46) }
        }
      }
      .padding(.horizontal, Theme.gutter)
    }
    .scrollIndicators(.hidden)
    .padding(.horizontal, -Theme.gutter)
  }

  // A chart for the chosen measurement, with the picker when `pick` is set
  @ViewBuilder private func trend(_ pick: Bool) -> some View {
    let m = m
    if pick { Chips(options: shown.map { Choice($0.key, $0.name) }, value: m.key) { mk = $0 } }
    HStack(alignment: .top, spacing: 0) {
      stat("Today", fmt(m, avg(0, 1, m)), unit, size: 30).padding(.trailing, 12)
      Rectangle().fill(Theme.line).frame(width: 1)
      stat("Last 7d", fmt(m, avg(0, 7, m)), unit, size: 18).padding(.horizontal, 12)
      Rectangle().fill(Theme.line).frame(width: 1)
      stat("Limit", hasLimit(m) ? replaceFirst(replaceFirst(limitText(m), " \(m.unit)", ""), "%", "") : "None",
           hasLimit(m) ? unit : "varies by probe", size: 18).padding(.leading, 12)
    }
    .fixedSize(horizontal: false, vertical: true)
    Segmented(options: RANGES.map { Choice($0.k, $0.name) }, value: range) { range = $0 }
    let since = now - rangeHours(range) * HOUR
    TrendChart(m: m, series: farm.views.map { v in TrendSeries(name: v.probe.name, readings: v.history.filter { $0.t >= since }) },
               hours: rangeHours(range), height: 220)
    TrendLegend(names: farm.views.map(\.probe.name), limit: hasLimit(m))
  }

  private func stat(_ label: String, _ value: String, _ unit: String, size: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(label).monoCaps().foregroundStyle(Theme.muted)
      Text(value).font(WaiFont.sans(size, .medium)).tracking(size * Theme.Tracking.tight).monospacedDigit()
      Text(unit).font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
