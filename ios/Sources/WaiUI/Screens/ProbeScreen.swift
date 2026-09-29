import Supabase
import SwiftUI
import WaiKit

// src/app/app/probe/[id]/page.tsx
private let TABS = [Choice("metrics", "Metrics"), Choice("history", "History"), Choice("device", "Device")]
private let RANGE_TEXT = ["1d": "last 24 hours", "7d": "last 7 days", "4w": "last 4 weeks"]

// `toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })`
private let whenFormat: DateFormatter = {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_NZ")
  f.dateFormat = "d MMM, h:mm a" // "27 Sept, 2:15 pm", as Chrome writes en-NZ
  f.shortMonthSymbols = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]
  f.amSymbol = "am"
  f.pmSymbol = "pm"
  return f
}()
private func when(_ iso: String?) -> String {
  guard let iso else { return "–" }
  let t = parseISO(iso)
  return t.isNaN ? "Invalid Date" : whenFormat.string(from: Date(timeIntervalSince1970: t / 1000))
}

// `x != null` for a raw JSON value
private func given(_ x: AnyJSON?) -> Bool {
  if case .null = x { return false }
  return x != nil
}
// a raw JSON value as a JS template string writes it
private func text(_ x: AnyJSON) -> String {
  switch x {
  case .integer(let i): String(i)
  case .double(let d): jsString(d)
  case .string(let s): s
  case .bool(let b): b ? "true" : "false"
  case .null: "null"
  case .object: "[object Object]"
  case .array(let a): a.map(text).joined(separator: ",")
  }
}

// Readings as a CSV file in the temporary directory, for the share sheet
private func csv(_ name: String, _ rows: [Reading]) -> URL {
  let head = ["time"] + METRICS.map { "\($0.name)\($0.unit.isEmpty ? "" : " (\($0.unit))")" }
  let body = rows.map { r in ([r.createdAt] + METRICS.map { r[$0.key].map(jsString) ?? "" }).joined(separator: ",") }
  let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name) readings.csv")
  try? ([head.joined(separator: ",")] + body).joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
  return url
}

struct ProbeScreen: View {
  let id: String
  @Environment(FarmStore.self) private var farm
  @Environment(Router.self) private var router

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        if let v = farm.views.first(where: { $0.probe.id == id }) {
          ProbeContent(v: v, mine: farm.alerts.filter { $0.probe.id == id }, now: farm.now)
        } else {
          Header(farm.loading ? "" : "Probe not found", back: router.back)
        }
      }
      .padding(.horizontal, Theme.gutter)
      .padding(.bottom, 112)
      .frame(maxWidth: 448)
      .frame(maxWidth: .infinity)
    }
    .background(Theme.paper)
  }
}

struct ProbeContent: View {
  let v: ProbeView, mine: [WaiKit.Alert], now: Millis
  @Environment(FarmStore.self) private var farm
  @Environment(Router.self) private var router
  @State private var tab = "metrics"
  @State private var range = "1d"
  @State private var mk = MetricKey.pctFull
  @State private var menu = false
  @State private var homeMsg: String?
  @State private var csvURL: URL?

  var body: some View {
    let r = v.latest
    // only measurements this probe actually sends; water quality only from recent readings
    let primary = present(v.history, PRIMARY)
    let quality = present(Array(v.history.suffix(50)), METRICS.filter(\.wq))
    let charted = present(v.history)
    let m = charted.first { $0.key == mk } ?? charted.first ?? PRIMARY[0]
    // periods are measured back from the newest reading
    let newest = r?.t ?? 0
    let since = newest - rangeHours(range) * HOUR
    let rows = v.history.filter { $0.t >= since }
    let xs = rows.map { value($0, m) }.filter { !$0.isNaN }
    let within = xs.isEmpty ? .nan : jsRound(Double(xs.filter { state(m, $0) == .normal }.count) / Double(xs.count) * 100)

    let raw = r?.raw ?? [:]
    let g = gps(r)
    let fix = recentFixes(v.history).first
    let trough = v.hardware && v.history.contains { given($0.raw?["distance_cm"]) }
    let week = trough ? visitsByDay(v.visits, newest, 7) : []

    Header(v.probe.name) {
      HStack(spacing: 8) {
        RoundButton(icon: "more", label: "More") { csvURL = csv(v.probe.name, v.history); menu = true }
        RoundButton(icon: "close", label: "Close", action: router.back)
      }
    }
    .waiSheet(isPresented: $menu, title: v.probe.name) {
      VStack(spacing: 10) {
        Button { menu = false; router.openMap(probe: v.probe.id) } label: { menuItem("pin", "Show on map") }
          .buttonStyle(.plain)
        if let csvURL {
          ShareLink(item: csvURL) { menuItem("download", "Download readings (CSV)") }.buttonStyle(.plain)
        }
      }
    }

    HStack(spacing: 16) {
      Ring(value: Double(v.score), size: 64, stroke: 6, color: .status(v.status)) {
        Text("\(v.score)").font(WaiFont.sans(20, .medium)).tracking(20 * Theme.Tracking.tight).monospacedDigit()
      }
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 8) {
          Text(v.status.label).font(WaiFont.sans(22, .medium)).tracking(22 * Theme.Tracking.tight)
          if v.geo?.moved == true { Badge("Moved") }
        }
        Text("\(v.online ? "Live" : "Offline") · updated \(ago(r?.createdAt, now: now))")
          .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
      }
    }

    ForEach(mine) { a in
      Card(action: { router.openAlert(a.id) }) {
        HStack(spacing: 12) {
          Dot(.bad)
          VStack(alignment: .leading, spacing: 0) {
            Text(a.title).font(WaiFont.sans(16, .medium))
            Text("Started \(ago(a.since, now: now)) · see what to do").font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          Icon("chevron", size: 16).foregroundStyle(Theme.muted)
        }
      }
    }

    Tabs(options: TABS, selection: $tab)

    switch tab {
    case "metrics":
      VStack(spacing: 0) {
        ForEach(primary, id: \.key) { metricRow($0, r) }
        if let level = r?.levelCm {
          Row("Empty in", sub: "At the last 6 h rate") {
            Text(level <= 0 ? "Empty" : v.emptyIn.map(duration) ?? "Steady")
          }
        }
        if trough {
          Row("Trough visits today", sub: "\(week.reduce(0) { $0 + $1.n }) in the last 7 days") { Text("\(week.last!.n)") }
        }
        if let g {
          let sub = g.fix ? "\(g.hdop.map { $0 <= 2 } == true ? "Good" : g.hdop.map { $0 <= 5 } == true ? "Fair" : "Poor") fix" : "Searching for satellites"
          Row("GPS accuracy", sub: sub) { Text(sats(g)) }
        }
        ForEach(quality, id: \.key) { metricRow($0, r) }
      }
      .padding(.top, -12)

    case "history":
      VStack(alignment: .leading, spacing: 16) {
        Segmented(options: RANGES.map { Choice($0.k, $0.name) }, selection: $range)
        Chips(options: charted.map { Choice($0.key, $0.name) }, value: m.key) { mk = $0 }
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(fmt(m, mean(xs))).font(WaiFont.sans(40, .medium)).tracking(40 * Theme.Tracking.tight).monospacedDigit()
            Text(m.unit).font(WaiFont.mono(14)).foregroundStyle(Theme.muted)
          }
          Text("Average \(metricName(m)), \(RANGE_TEXT[range]!)").font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
        }
        TrendChart(m: m, series: [TrendSeries(name: m.name, readings: rows)], hours: rangeHours(range))
        if hasLimit(m) { LimitLegend() }
        VStack(spacing: 0) {
          Row("Lowest") { Text(xs.min().map { fmt(m, $0) } ?? "–") }
          Row("Highest") { Text(xs.max().map { fmt(m, $0) } ?? "–") }
          if hasLimit(m) {
            Row("Within limits", sub: "Limit \(limitText(m))") { Text(within.isNaN ? "–" : "\(jsString(within))%") }
          }
          Row("Readings") { Text("\(xs.count)") }
        }
        if !v.history.isEmpty && rows.count == v.history.count && range != "1d" {
          Text("Showing all readings; this probe has data from \(when(v.history[0].createdAt)).")
            .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
        }
      }

    default:
      VStack(alignment: .leading, spacing: 0) {
        Row("Status") { Text(v.online ? "Live" : "Offline").foregroundStyle(Color.status(v.online ? .good : .bad)) }
        Row("Last reading") { Text(when(r?.createdAt)) }
        Row("Reports every") { Text(every(v.interval)) }
        if let up = num(raw["uptime_s"]) {
          Row("Uptime", sub: "Since last restart") { Text(duration(up / 3600)) }
        }
        if let lora = raw["lora"]?.objectValue, let rssi = lora["rssi"], given(rssi) {
          Row("LoRa signal", sub: "Last uplink") {
            Text("\(text(rssi)) dBm · SNR \(lora["snr"].flatMap { given($0) ? text($0) : nil } ?? "–") dB")
          }
        } else if let rssi = num(raw["rssi"]) {
          Row("Wi-Fi signal", sub: num(raw["wifi_ch"]) != nil ? "Channel \(text(raw["wifi_ch"]!))" : nil) { Text("\(jsString(rssi)) dBm") }
        }
        if let c = num(raw["chip_temp_c"]) {
          Row("Chip temperature", sub: "Board, not water") { Text("\(toFixed(c, 1)) °C") }
        }
        if case .string(let fw) = raw["fw"] { Row("Firmware") { Text(fw) } }
        if let heap = num(raw["free_heap"]) { Row("Free memory") { Text("\(jsString(jsRound(heap / 1024))) KB") } }
        if let g {
          Row("GPS", sub: g.fix ? "Fix \(g.ageMs.map { "\(toFixed($0 / 1000, 1)) s old" } ?? "current")" : "No fix") { Text(sats(g)) }
        }
        Row("Location", action: { router.openMap(probe: v.probe.id) }) {
          Text("\(toFixed(v.probe.lat, 4)), \(toFixed(v.probe.lng, 4))\(v.located == .gps ? " · GPS" : v.located == .phone ? " · phone" : "")")
        }
        Row("Home", sub: v.probe.homeLat == nil ? "Not set, so no movement alerts"
          : "Geofence \(jsString(v.probe.geofenceM)) m\(v.geo.map { " · \(jsString(jsRound($0.distance))) m away now" } ?? "")") {
          if let lat = v.probe.homeLat, let lng = v.probe.homeLng { Text("\(toFixed(lat, 4)), \(toFixed(lng, 4))") } else { Text("–") }
        }
        if v.hardware {
          VStack(alignment: .leading, spacing: 6) {
            Button { Task { await markHome(fix) } } label: {
              Text("Set home to current GPS position").font(WaiFont.sans(14))
                .frame(maxWidth: .infinity).padding(.vertical, 10)
                .background(Capsule().fill(Theme.card))
                .overlay(Capsule().strokeBorder(Theme.line, lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(fix == nil).opacity(fix == nil ? 0.5 : 1)
            Text(homeMsg ?? (fix == nil ? "Waiting for a GPS fix with HDOP ≤ 5."
              : v.probe.homeLat != nil
                ? "Uses the last good fix, \(jsString(jsRound(metres(Coord(lat: v.probe.homeLat!, lng: v.probe.homeLng ?? .nan), fix!)))) m from the current home."
                : "Uses the last good fix."))
              .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
          }
          .padding(.top, 12)
        }
        Row("Readings stored") { Text("\(v.history.count)") }
        Row("First reading") { Text(when(v.history.first?.createdAt)) }
        // only real hardware probes (they fill `raw`) can take commands
        if v.hardware { ProbeControls(probeId: v.probe.id).padding(.top, 24) }
      }
      .padding(.top, -12)
    }
  }

  private func metricRow(_ x: Metric, _ r: Reading?) -> some View {
    let n = value(r, x)
    let st = state(x, n)
    return Row(x.name, sub: hasLimit(x) ? "Limit \(limitText(x))" : nil, action: { mk = x.key; tab = "history" }) {
      VStack(alignment: .trailing, spacing: 0) {
        HStack(spacing: 4) {
          Text(fmt(x, n))
          Text(x.unit).font(WaiFont.mono(12)).foregroundStyle(Theme.muted).frame(width: 40, alignment: .leading)
        }
        if hasLimit(x) && !n.isNaN {
          Text(st.rawValue).font(WaiFont.mono(12)).foregroundStyle(Color.status(st == .normal ? .good : .bad))
        }
      }
    }
  }

  private func sats(_ g: Gps) -> String {
    "\(jsString(g.sats ?? 0)) sats · HDOP \(g.fix && g.hdop != nil ? toFixed(g.hdop!, 1) : "–")"
  }

  private func menuItem(_ icon: String, _ name: String) -> some View {
    HStack(spacing: 12) {
      Icon(icon)
      Text(name).font(WaiFont.sans(16, .medium)).frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 16).padding(.vertical, 14)
    .background(RoundedRectangle(cornerRadius: Theme.Radius.card).fill(Theme.card))
    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card).strokeBorder(Theme.line, lineWidth: 1))
    .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
  }

  private func markHome(_ fix: Coord?) async {
    guard let fix else { return }
    homeMsg = "Saving…"
    let err = await farm.setHome(v.probe.id, at: fix)
    homeMsg = err.map { "Couldn't save: \($0)" } ?? "Home set to the current GPS position"
  }
}

// `<Legend names={[]} limit />` from TrendChart.tsx: only the dashed limit key
private struct LimitLegend: View {
  var body: some View {
    HStack(spacing: 6) {
      Path { p in p.move(to: .zero); p.addLine(to: CGPoint(x: 16, y: 0)) }
        .stroke(Theme.muted, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
        .frame(width: 16, height: 1)
      Text("Limit")
    }
    .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
  }
}
