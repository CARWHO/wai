import SwiftUI
import WaiKit

// src/app/app/map/page.tsx + LiveMap.tsx. The shell keeps this screen alive behind every tab, like LiveMapProvider.
struct MapScreen: View {
  let visible: Bool
  @Environment(FarmStore.self) var farm
  @Environment(Router.self) var router
  @State private var sheet: String? // "list" or a probe id
  @State private var layer = MapLayer.satellite
  @State private var fit = 0

  private func toggleLayer() { layer = layer == .satellite ? .map : .satellite }
  private func showFarm() { fit += 1 }
  private func close() { sheet = nil; router.mapProbe = nil }

  var body: some View {
    let views = farm.views
    GeometryReader { g in
      ZStack {
        Color(hex: "#1b2a20").ignoresSafeArea()
        if !views.isEmpty {
          FarmMap(views: views, selected: views.first { $0.probe.id == sheet }?.probe.id,
                  onSelect: { sheet = $0 }, layer: layer, fit: fit)
            .ignoresSafeArea()
        }
        // pt-[max(16px,env(safe-area-inset-top))]
        top.padding(.top, max(0, 16 - g.safeAreaInsets.top))
          .frame(maxHeight: .infinity, alignment: .top)
        if sheet != nil {
          bottom(maxHeight: g.size.height * 0.7)
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
      }
    }
    // /app/map?probe=: the page reads the probe each time Live opens
    .onChange(of: visible, initial: true) { if visible { sheet = router.mapProbe } else { router.mapProbe = nil } }
    .onChange(of: router.mapProbe) { if visible { sheet = router.mapProbe } }
  }

  private func dark(_ icon: String, _ label: String, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Icon(icon).foregroundStyle(Theme.paper)
        .frame(width: 44, height: 44)
        .background(Circle().fill(Theme.ink))
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  // Halter Live: round dark buttons either side of the summary pill
  private var top: some View {
    let views = farm.views
    let live = views.filter(\.online).count
    let s = status(Double(farm.farmScore))
    return HStack(alignment: .top, spacing: 8) {
      VStack(spacing: 12) {
        dark("home", "Home") { router.openHome() }
        dark("locate", "Show whole farm", showFarm)
        dark("layers", "Switch map layer", toggleLayer)
      }
      Spacer(minLength: 0)
      HStack(spacing: 10) {
        Ring(value: Double(farm.farmScore), size: 40, stroke: 4, color: .status(s), track: Color(hex: "#3f3e3a")) {
          Text("\(farm.farmScore)").font(WaiFont.mono(12))
        }
        VStack(alignment: .leading, spacing: 0) {
          Text("Farm health · \(s.label)")
          Text("\(live) of \(views.count) probes live").foregroundStyle(Theme.paper.opacity(0.7))
        }
        .font(WaiFont.mono(12))
      }
      .foregroundStyle(Theme.paper)
      .padding(.vertical, 4).padding(.leading, 4).padding(.trailing, 16)
      .background(Capsule().fill(Theme.ink))
      Spacer(minLength: 0)
      dark("search", "Find a probe") { sheet = "list" }
    }
    .frame(maxWidth: 448)
    .padding(.horizontal, 16)
  }

  private func line(_ p: ProbeView) -> String {
    "\(p.status.label) · \(p.online ? "Live" : "updated \(ago(p.latest?.createdAt, now: farm.now))")"
  }

  // Halter bottom sheet
  private func bottom(maxHeight: CGFloat) -> some View {
    let content = panel.frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 24)
    return ViewThatFits(in: .vertical) {
      content
      ScrollView { content }
    }
    .frame(maxWidth: 448, maxHeight: maxHeight)
    .background(UnevenRoundedRectangle(topLeadingRadius: Theme.Radius.card, topTrailingRadius: Theme.Radius.card).fill(Theme.paper))
    .overlay(UnevenRoundedRectangle(topLeadingRadius: Theme.Radius.card, topTrailingRadius: Theme.Radius.card)
      .strokeBorder(Theme.line, lineWidth: 1).mask(alignment: .top) { Rectangle().frame(height: Theme.Radius.card) })
  }

  private var panel: some View {
    let views = farm.views
    let v = views.first { $0.probe.id == sheet }
    return VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 0) {
          Text(v?.probe.name ?? "Probes").font(WaiFont.sans(26, .medium)).tracking(26 * Theme.Tracking.tight)
          if let v {
            HStack(spacing: 8) {
              Dot(v.status)
              Text(line(v))
            }
            .font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
            .padding(.top, 4)
          }
        }
        Spacer(minLength: 0)
        RoundButton(icon: "close", label: "Close", action: close)
      }

      if let v {
        if v.hardware { Card { SensorCheck(v: v, now: farm.now) }.padding(.top, 16) }
        VStack(spacing: 0) {
          let ms = present(v.history, PRIMARY) + present(Array(v.history.suffix(50)), METRICS.filter { $0.wq && $0.key != .tempC })
          ForEach(ms, id: \.key) { m in
            Row(m.name) { Text(withUnit(m, value(v.latest, m))) }
          }
          if let geo = v.geo {
            Row("From home", sub: "Geofence \(jsString(geo.radius)) m") {
              HStack(spacing: 4) {
                if geo.moved { Badge("Moved") }
                Text("\(jsString(jsRound(geo.distance))) m")
              }
            }
          }
        }
        .padding(.top, 8)
        Button { router.openProbe(v.probe.id) } label: {
          Text("Open probe").font(WaiFont.sans(17, .medium)).foregroundStyle(Theme.paper)
            .frame(maxWidth: .infinity).padding(.vertical, 14)
            .background(Capsule().fill(Theme.ink))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .padding(.top, 16)
      } else {
        VStack(spacing: 0) {
          ForEach(views) { p in
            Row(sub: line(p), action: { sheet = p.probe.id }) {
              HStack(spacing: 8) { Dot(p.status); Text(p.probe.name) }
            } trailing: { EmptyView() }
          }
        }
        .padding(.top, 8)
      }
    }
  }
}
