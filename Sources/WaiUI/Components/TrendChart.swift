import Charts
import SwiftUI
import WaiKit

public struct TrendSeries {
  public var name: String
  public var readings: [Reading]
  public init(name: String, readings: [Reading]) { self.name = name; self.readings = readings }
}

private func nzFormatter(_ template: String) -> DateFormatter {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_NZ")
  f.setLocalizedDateFormatFromTemplate(template)
  f.amSymbol = "am"; f.pmSymbol = "pm" // as the browser writes en-NZ
  return f
}
private let hourTick = nzFormatter("j")
private let dayTick = nzFormatter("dMMM")
private let tipLabel = nzFormatter("EEEjmm")

// Time series for one metric, one line per probe, dashed limit lines
public struct TrendChart: View {
  let m: Metric
  let series: [TrendSeries]
  let hours: Double
  let height: CGFloat
  @State private var selected: Date?

  public init(m: Metric, series: [TrendSeries], hours: Double, height: CGFloat = 200) {
    self.m = m; self.series = series; self.hours = hours; self.height = height
  }

  private struct Point: Identifiable {
    var s: Int, t: Millis, y: Double
    var id: String { "\(s):\(t)" }
    var date: Date { Date(timeIntervalSince1970: t / 1000) }
  }

  public var body: some View {
    // one row per timestamp so the selection lists every probe at that time
    let points = series.enumerated().flatMap { i, s in
      s.readings.compactMap { r -> Point? in
        let y = value(r, m)
        return y.isNaN ? nil : Point(s: i, t: r.t, y: y)
      }
    }
    let rows = Dictionary(grouping: points, by: \.t)
    let times = rows.keys.sorted()
    if let lo = times.first, let hi = times.last {
      chart(points, rows: rows, times: times, domain: Date(timeIntervalSince1970: lo / 1000)...Date(timeIntervalSince1970: hi / 1000))
    } else {
      Text("No readings in this period").font(WaiFont.sans(14)).foregroundStyle(Theme.muted)
        .frame(maxWidth: .infinity).frame(height: height)
    }
  }

  private func chart(_ points: [Point], rows: [Millis: [Point]], times: [Millis], domain: ClosedRange<Date>) -> some View {
    let tick = hours <= 24 ? hourTick : dayTick
    let near = selected.map { sel -> Millis in
      let ms = sel.timeIntervalSince1970 * 1000
      return times.min { abs($0 - ms) < abs($1 - ms) }!
    }
    return Chart {
      ForEach(limitLines(m), id: \.self) { y in
        RuleMark(y: .value("Limit", y))
          .foregroundStyle(Theme.muted)
          .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
      }
      ForEach(points) { p in
        LineMark(x: .value("Time", p.date), y: .value(m.name, p.y), series: .value("Probe", p.s))
          .foregroundStyle(Color(hex: SERIES[p.s % SERIES.count]))
          .lineStyle(StrokeStyle(lineWidth: 1.5))
      }
      if let near {
        RuleMark(x: .value("Time", Date(timeIntervalSince1970: near / 1000)))
          .foregroundStyle(Theme.line)
          .annotation(position: .top, spacing: 4, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
            tooltip(near, rows[near] ?? [])
          }
      }
    }
    .chartXScale(domain: domain)
    .chartYScale(domain: .automatic(includesZero: false))
    .chartLegend(.hidden)
    .chartXSelection(value: $selected)
    .chartXAxis {
      AxisMarks(values: .automatic(desiredCount: 5)) { v in
        AxisValueLabel {
          if let d = v.as(Date.self) { Text(tick.string(from: d)).font(WaiFont.mono(10)).foregroundStyle(Theme.muted) }
        }
      }
    }
    .chartYAxis {
      AxisMarks(position: .leading) { v in
        AxisGridLine(stroke: StrokeStyle(lineWidth: 1)).foregroundStyle(Theme.line)
        AxisValueLabel {
          if let y = v.as(Double.self) { Text(jsString(y)).font(WaiFont.mono(10)).foregroundStyle(Theme.muted) }
        }
      }
    }
    .chartPlotStyle { $0.overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) } }
    .padding(.top, 8).padding(.trailing, 8)
    .frame(height: height)
  }

  private func tooltip(_ t: Millis, _ ps: [Point]) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(tipLabel.string(from: Date(timeIntervalSince1970: t / 1000)))
      ForEach(ps.sorted { $0.s < $1.s }) { p in
        Text("\(series[p.s].name) : \(toFixed(p.y, m.digits))\(m.unit.isEmpty ? "" : " \(m.unit)")")
          .foregroundStyle(Color(hex: SERIES[p.s % SERIES.count]))
      }
    }
    .font(WaiFont.mono(12))
    .padding(.horizontal, 10).padding(.vertical, 6)
    .background(RoundedRectangle(cornerRadius: 12).fill(Theme.card))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.line, lineWidth: 1))
  }
}

// `Legend`: probe names in their line colours, and the dashed limit line
public struct TrendLegend: View {
  var names: [String], limit: Bool
  public init(names: [String], limit: Bool = false) { self.names = names; self.limit = limit }

  public var body: some View {
    if names.count >= 2 || limit {
      Flow(x: 16, y: 4) {
        if names.count > 1 {
          ForEach(Array(names.enumerated()), id: \.offset) { i, n in
            HStack(spacing: 6) {
              Rectangle().fill(Color(hex: SERIES[i % SERIES.count])).frame(width: 16, height: 2)
              Text(n)
            }
          }
        }
        if limit {
          HStack(spacing: 6) {
            Path { p in p.move(to: .zero); p.addLine(to: CGPoint(x: 16, y: 0)) }
              .stroke(Theme.muted, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
              .frame(width: 16, height: 1)
            Text("Limit")
          }
        }
      }
      .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
    }
  }
}

// flex-wrap with a column and a row gap
private struct Flow: Layout {
  var x: CGFloat, y: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let frames = place(subviews, width: proposal.width ?? .infinity)
    return CGSize(width: frames.map(\.maxX).max() ?? 0, height: frames.map(\.maxY).max() ?? 0)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    for (f, s) in zip(place(subviews, width: bounds.width), subviews) {
      s.place(at: CGPoint(x: bounds.minX + f.minX, y: bounds.minY + f.minY), proposal: ProposedViewSize(f.size))
    }
  }

  private func place(_ subviews: Subviews, width: CGFloat) -> [CGRect] {
    var out: [CGRect] = [], at = CGPoint.zero, line: CGFloat = 0
    for s in subviews {
      let size = s.sizeThatFits(.unspecified)
      if at.x > 0 && at.x + size.width > width { at = CGPoint(x: 0, y: at.y + line + y); line = 0 }
      out.append(CGRect(origin: at, size: size))
      at.x += size.width + x
      line = max(line, size.height)
    }
    return out
  }
}
