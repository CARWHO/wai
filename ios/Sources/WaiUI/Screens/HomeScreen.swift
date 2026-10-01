import SwiftUI
import WaiKit

// src/app/app/page.tsx
private func word(_ v: Int) -> String { v >= 80 ? "Good" : v >= 50 ? "Fair" : "Poor" }
private let LEVEL = metric(.levelCm)
private let FULL = metric(.pctFull)
private let SOIL = metric(.soilPct)

// Level now, % full, the change over the last 24 hours and time until empty
private func levelStats(_ v: ProbeView) -> (now: Double, full: Double, change: Double, empty: Double?)? {
  guard let latest = v.latest, let now = latest.levelCm else { return nil }
  let t = latest.t - 24 * HOUR
  let dayAgo = v.history.first { $0.t >= t }?.levelCm ?? now
  return (now, latest.pctFull ?? .nan, now - dayAgo, v.emptyIn)
}

private func last24(_ v: ProbeView) -> [Reading] {
  let t = v.latest.map { $0.t - 24 * HOUR } ?? 0
  return v.history.filter { $0.t >= t }
}

struct HomeScreen: View {
  @Environment(FarmStore.self) private var farm
  @State private var tip = FarmTip()

  var body: some View {
    ScrollView { HomeContent(tip: tip.tip) }
      .background(Theme.paper)
      .task(id: FarmTip.key(farm)) { await tip.load(farm) }
  }
}

// The page without its ScrollView, so it can be rendered offscreen
struct HomeContent: View {
  var tip: AITip?
  @Environment(FarmStore.self) private var farm
  @Environment(Router.self) private var router
  @Environment(SessionStore.self) private var session
  @State private var page: Int? = 0

  private func dash(_ x: String) -> String { farm.loading ? "–" : x }

  var body: some View {
    let s = status(Double(farm.farmScore))
    VStack(alignment: .leading, spacing: 28) {
      Header(title: { Wordmark() }) {
        HStack(spacing: 12) {
          Label("UC farm")
          RoundButton(icon: "logout", label: "Sign out") { Task { await session.signOut() } }
        }
      }

      if !farm.alerts.isEmpty {
        VStack(spacing: 8) {
          ForEach(farm.alerts, id: \.key) { a in
            Card(action: { router.openAlert(a.id) }) {
              HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                  Label {
                    HStack {
                      Text("● Alert").foregroundStyle(Theme.alert)
                      Spacer(minLength: 0)
                      Text(ago(a.since, now: farm.now))
                    }
                  }
                  Text(a.probe.name).font(WaiFont.sans(16, .medium)).padding(.top, 4)
                  Text("\(a.title) · \(a.detail.first ?? "")").font(WaiFont.mono(13)).foregroundStyle(Theme.alert)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Icon("chevron", size: 16).foregroundStyle(Theme.muted)
              }
            }
          }
        }
        .padding(.top, -12)
      }

      AICard(s: s, note: tip.map { $0.source == "openai" ? "From your probes now" : "Standard guidance" }) {
        if let tip {
          Text(tip.title).font(WaiFont.sans(22, .medium)).tracking(22 * Theme.Tracking.tight)
          Text(tip.body).font(WaiFont.sans(15)).lineSpacing(15 * 0.625 - 3).foregroundStyle(Theme.muted).padding(.top, 4)
        } else {
          AIThinking("Reading every probe…")
        }
      }

      Section("In Focus") {
        VStack(spacing: 8) {
          ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 16) {
              healthCard(s).id(0)
              levelCard.id(1)
              soilCard.id(2)
            }
            .fixedSize(horizontal: false, vertical: true)
            .scrollTargetLayout()
          }
          .scrollIndicators(.hidden)
          .scrollTargetBehavior(.viewAligned)
          .scrollPosition(id: $page)

          HStack(spacing: 0) {
            ForEach(Array(["Farm health", "Water level", "Soil moisture"].enumerated()), id: \.offset) { i, name in
              Button { withAnimation { page = i } } label: {
                Circle().fill(i == (page ?? 0) ? Theme.ink : Theme.line).frame(width: 6, height: 6)
                  .frame(width: 16, height: 24).contentShape(Rectangle())
              }
              .buttonStyle(.plain)
              .accessibilityLabel(name)
            }
          }
          .frame(maxWidth: .infinity)
        }
      }

      Section("At a Glance", action: {
        Button { router.openInsights() } label: {
          Text("See all").font(WaiFont.sans(14)).foregroundStyle(Theme.muted).underline()
        }
        .buttonStyle(.plain)
      }) {
        Grid(horizontalSpacing: 12, verticalSpacing: 12) {
          ForEach(Array(stride(from: 0, to: farm.views.count, by: 2)), id: \.self) { i in
            GridRow {
              glanceCard(farm.views[i])
              if i + 1 < farm.views.count { glanceCard(farm.views[i + 1]) } else { Color.clear.gridCellUnsizedAxes([.horizontal, .vertical]) }
            }
          }
        }
      }
    }
    .frame(maxWidth: 448, alignment: .leading)
    .padding(.horizontal, Theme.gutter)
    .padding(.bottom, 112)
    .frame(maxWidth: .infinity)
  }

  // Garmin Training Readiness factor grid
  private func healthCard(_ s: Status) -> some View {
    let sub = farm.subScores
    let online = farm.views.filter(\.online).count
    let factors: [(String, String)] = [
      (word(sub.level), "Water level"),
      (word(sub.soil), "Soil moisture"),
      ("\(online) of \(farm.views.count)", "Probes live"),
      (farm.alerts.isEmpty ? "None" : "\(farm.alerts.count) open", "Alerts"),
    ]
    return focusCard {
      Text("Farm health").font(WaiFont.sans(15, .medium))
      HStack(spacing: 16) {
        Ring(value: farm.loading ? 0 : Double(farm.farmScore), size: 88, stroke: 8, color: .status(s)) {
          Text(dash("\(farm.farmScore)")).font(WaiFont.sans(28, .medium)).tracking(28 * Theme.Tracking.tight).monospacedDigit()
        }
        Text(dash(s.label)).font(WaiFont.sans(24, .medium)).tracking(24 * Theme.Tracking.tight)
      }
      .padding(.top, 12)
      Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 12) {
        ForEach([0, 2], id: \.self) { i in
          GridRow {
            ForEach(factors[i ... i + 1], id: \.1) { v, k in
              VStack(alignment: .leading, spacing: 0) {
                Text(dash(v)).font(WaiFont.sans(18, .medium))
                Label(k)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      }
      .padding(.top, 16)
    }
  }

  private var levelCard: some View {
    let level = farm.subScores.level
    return focusCard {
      Text("Water level").font(WaiFont.sans(15, .medium))
      score(level).padding(.top, 8)
      Grid(horizontalSpacing: 8, verticalSpacing: 0) {
        GridRow {
          ForEach(Array(["Probe", "Now", "Full", "24 h", "Empty in"].enumerated()), id: \.offset) { i, h in
            Text(h).font(WaiFont.mono(11)).tracking(11 * Theme.Tracking.wider).textCase(.uppercase).foregroundStyle(Theme.muted)
              .gridColumnAlignment(i == 0 ? .leading : .trailing)
              .frame(maxWidth: i == 0 ? .infinity : nil, alignment: .leading)
              .padding(.bottom, 4)
          }
        }
        ForEach(farm.views) { v in
          if let l = levelStats(v) {
            Rectangle().fill(Theme.line).frame(height: 1).gridCellUnsizedAxes(.horizontal)
            GridRow {
              Text(v.probe.name).font(WaiFont.sans(14)).frame(maxWidth: .infinity, alignment: .leading)
              Text(withUnit(LEVEL, l.now))
              Text(withUnit(FULL, l.full)).foregroundStyle(l.full < FULL.min! ? Color.status(.bad) : Theme.ink)
              Text("\(jsRound(l.change) > 0 ? "+" : "")\(jsString(jsRound(l.change)))")
              Text(l.now <= 0 ? "Empty" : l.empty.map(duration) ?? "Steady")
                .foregroundStyle(l.empty.map { $0 < 24 } == true ? Color.status(.bad) : Theme.ink)
            }
            .font(WaiFont.mono(13))
            .padding(.vertical, 8)
          }
        }
      }
      .padding(.top, 12)
    }
  }

  private var soilCard: some View {
    let soilViews = farm.views.filter { $0.latest?.soilPct != nil }
    return focusCard {
      Text("Soil moisture").font(WaiFont.sans(15, .medium))
      score(farm.subScores.soil).padding(.top, 8)
      Label("Soil moisture, last 24 h (%)").padding(.top, 12).padding(.bottom, 4)
      TrendChart(m: SOIL, series: soilViews.map { TrendSeries(name: $0.probe.name, readings: last24($0)) }, hours: 24, height: 120)
      Legend(names: soilViews.map(\.probe.name), limit: true).padding(.top, 8)
    }
  }

  private func score(_ v: Int) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(dash("\(v)")).font(WaiFont.sans(34, .medium)).tracking(34 * Theme.Tracking.tight).monospacedDigit()
      Text(dash(word(v))).font(WaiFont.sans(17, .medium)).foregroundStyle(Color.status(status(Double(v))))
    }
  }

  // One card per screen width, no peeking edge; 16 pt is the gap
  private func focusCard(@ViewBuilder _ content: () -> some View) -> some View {
    Card {
      VStack(alignment: .leading, spacing: 0) { content() }
        .frame(maxHeight: .infinity, alignment: .top)
    }
    .containerRelativeFrame(.horizontal)
  }

  private func glanceCard(_ v: ProbeView) -> some View {
    let bad = issues(v.latest).first
    let full = v.latest?.pctFull
    return Card(action: { router.openProbe(v.probe.id) }) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 8) {
          Dot(v.status)
          Text(v.probe.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
          if v.geo?.moved == true { Badge("Moved") }
        }
        .font(WaiFont.sans(15, .medium))
        HStack(alignment: .firstTextBaseline, spacing: 0) {
          Text(v.latest?.levelCm.map { toFixed($0, 0) } ?? "–")
            .font(WaiFont.sans(26, .medium)).tracking(26 * Theme.Tracking.tight).monospacedDigit()
          Text("cm").font(WaiFont.mono(13)).foregroundStyle(Theme.muted).padding(.leading, 4)
          if let full {
            Spacer(minLength: 0)
            Text("\(jsString(jsRound(full)))%").font(WaiFont.mono(13)).foregroundStyle(Theme.muted)
          }
        }
        .padding(.top, 12)
        Spark(data: last24(v), k: \.levelCm, height: 40).padding(.top, 8)
        Text(bad.map { "\(issueTitle($0)) · \(withUnit($0.m, $0.x))" } ?? withUnit(SOIL, v.latest?.soilPct ?? .nan))
          .font(WaiFont.mono(14))
          .foregroundStyle(bad != nil ? Color.status(.bad) : Theme.ink)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 8)
        Text("\(bad != nil ? "Out of limits" : "Soil moisture") · \(v.online ? "live" : ago(v.latest?.createdAt, now: farm.now))")
          .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxHeight: .infinity, alignment: .top)
    }
  }
}

// Legend from src/components/TrendChart.tsx (not in the shared components yet)
private struct Legend: View {
  var names: [String], limit = false

  var body: some View {
    if names.count >= 2 || limit {
      HStack(spacing: 16) {
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
