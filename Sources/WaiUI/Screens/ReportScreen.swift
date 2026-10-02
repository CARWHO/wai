import SwiftUI
import WaiKit

// The web prints the page to PDF; here Share sends the same record as plain text.
private struct Stats { var min: Double, max: Double, avg: Double }
private func stats(_ all: [Double?]) -> Stats? {
  let xs = all.compactMap { $0 }
  return xs.isEmpty ? nil : Stats(min: xs.min()!, max: xs.max()!, avg: xs.reduce(0, +) / Double(xs.count))
}
private func fmt(_ s: Stats?, _ d: Int = 1) -> String {
  s.map { "\(toFixed($0.min, d)) – \(toFixed($0.max, d)) (avg \(toFixed($0.avg, d)))" } ?? "–"
}
private let ROWS: [MetricKey: (String, Int)] = [
  .levelCm: ("Level (cm)", 0), .pctFull: ("% full", 0), .soilPct: ("Soil moisture (%)", 0),
  .turbidity: ("Turbidity (NTU)", 1), .ph: ("pH", 2), .tds: ("TDS (ppm)", 0), .tempC: ("Temp (°C)", 1),
]

// Count exceedance events: a run of consecutive out-of-limit readings is one event
private func events(_ rs: [Reading]) -> Int {
  var n = 0, prev = false
  for r in rs {
    let b = !issues(r).isEmpty
    if b && !prev { n += 1 }
    prev = b
  }
  return n
}

// en-NZ { dateStyle: "medium", timeStyle: "short" }
private let medium: DateFormatter = {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_NZ")
  f.dateFormat = "d MMM yyyy, h:mm a"
  f.amSymbol = "am"; f.pmSymbol = "pm"
  return f
}()
private func d(_ iso: String?) -> String {
  guard let iso else { return "–" }
  let t = parseISO(iso)
  return t.isNaN ? "–" : medium.string(from: Date(timeIntervalSince1970: t / 1000))
}

struct ReportScreen: View {
  @Environment(Router.self) private var router
  @Environment(FarmStore.self) private var farm

  var body: some View {
    let r = ReportContent(views: farm.views, readings: farm.readings, generated: isoString(nowMs()))
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Header("Report", back: { router.back() }) {
          ShareLink(item: r.text, subject: Text("Farm water & soil record")) {
            HStack(spacing: 6) {
              Icon("share", size: 16)
              Text("Share").font(WaiFont.sans(14, .medium))
            }
            .foregroundStyle(Theme.paper)
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Capsule().fill(Theme.ink))
          }
          .buttonStyle(.plain)
        }
        r
      }
      .padding(.horizontal, Theme.gutter)
      .padding(.bottom, 112)
    }
    .background(Theme.paper)
  }
}

// The record itself, drawn and as text
struct ReportContent: View {
  var views: [ProbeView], readings: [Reading], generated: String

  private struct ProbeRow {
    var name: String, n: Int, pct: Double, ev: Int, rows: [(String, String)]
  }

  private var from: String? { readings.last?.createdAt }
  private var to: String? { readings.first?.createdAt }
  private var wq: Bool { !present(readings, METRICS.filter { $0.wq && $0.key != .tempC }).isEmpty }
  private var limits: String {
    "Limits applied: level ≥ \(jsString(Limits.levelPct))% full · soil moisture \(jsString(Limits.soilDry))–\(jsString(Limits.soilWet))%"
      + (wq ? " · turbidity ≤ \(jsString(Limits.turbidity)) NTU · pH \(jsString(Limits.phMin))–\(jsString(Limits.phMax)) · TDS ≤ \(jsString(Limits.tds)) ppm" : "")
      + ". Readings are logged automatically by the probes."
  }
  private var footer: String { "Generated \(d(generated)) by Wai. Source data is stored and available on request." }

  private var probes: [ProbeRow] {
    views.map { v in
      let rs = v.history
      let ok = rs.filter { issues($0).isEmpty }.count
      let pct = rs.isEmpty ? 0 : Double(ok) / Double(rs.count) * 100
      var rows = [("Readings", "\(rs.count) · \(toFixed(pct, 1))% within limits")]
      rows += present(rs).map { m in (ROWS[m.key]!.0, fmt(stats(rs.map { $0[m.key] }), ROWS[m.key]!.1)) }
      if v.hardware && !v.visits.isEmpty { rows.append(("Trough visits", "\(v.visits.count)")) }
      return ProbeRow(name: v.probe.name, n: rs.count, pct: pct, ev: events(rs), rows: rows)
    }
  }
  private func verdict(_ ev: Int) -> String { ev > 0 ? "\(ev) exceedance\(ev > 1 ? "s" : "")" : "Within limits" }

  var text: String {
    var out = ["Farm water & soil record", "UC farm", "\(d(from)) to \(d(to))", "", limits]
    for p in probes {
      out += ["", "\(p.name): \(verdict(p.ev))"]
      out += p.rows.map { "  \($0.0): \($0.1)" }
    }
    out += ["", footer]
    return out.joined(separator: "\n")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        Text("Farm water & soil record").font(WaiFont.sans(24, .medium)).tracking(24 * Theme.Tracking.tight)
        Text("UC farm").foregroundStyle(Theme.muted)
        Text("\(d(from)) to \(d(to))").foregroundStyle(Theme.muted)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.bottom, 12)
      .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }

      Text(limits).foregroundStyle(Theme.muted).padding(.top, 12)

      ForEach(Array(probes.enumerated()), id: \.offset) { _, p in
        VStack(alignment: .leading, spacing: 4) {
          HStack {
            Text(p.name).font(WaiFont.sans(15, .medium))
            Spacer()
            Text(verdict(p.ev)).font(WaiFont.sans(13, .medium)).foregroundStyle(Color.status(p.ev > 0 ? .bad : .good))
          }
          VStack(spacing: 0) {
            ForEach(Array(p.rows.enumerated()), id: \.offset) { i, row in
              HStack(alignment: .firstTextBaseline) {
                Text(row.0).foregroundStyle(Theme.muted)
                Spacer(minLength: 8)
                Text(row.1).font(i == 0 ? WaiFont.sans(14) : WaiFont.mono(14)).multilineTextAlignment(.trailing)
              }
              .padding(.vertical, 4)
              .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
            }
          }
        }
        .padding(.top, 16)
      }

      Text(footer).font(WaiFont.sans(11)).foregroundStyle(Theme.muted)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 12)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
        .padding(.top, 20)
    }
    .font(WaiFont.sans(14))
    .foregroundStyle(Theme.ink)
  }
}
