import SwiftUI

/// One option of Chips, Segmented or Tabs: `{ k, name }`
public struct Choice<K: Hashable>: Identifiable {
  public var k: K, name: String
  public var id: K { k }
  public init(_ k: K, _ name: String) { self.k = k; self.name = name }
}

// Pill chips for picking one option. Active is the primary button, the rest are secondary.
public struct Chips<K: Hashable>: View {
  var options: [Choice<K>], value: K, onChange: (K) -> Void

  public init(options: [Choice<K>], value: K, onChange: @escaping (K) -> Void) {
    self.options = options; self.value = value; self.onChange = onChange
  }

  public init(options: [Choice<K>], selection: Binding<K>) {
    self.init(options: options, value: selection.wrappedValue) { selection.wrappedValue = $0 }
  }

  public var body: some View {
    // -mx-4 px-4: scroll under the page gutter
    ScrollView(.horizontal) {
      HStack(spacing: 8) {
        ForEach(options) { o in
          let on = o.k == value
          Button { onChange(o.k) } label: {
            Text(o.name).font(WaiFont.sans(13))
              .padding(.horizontal, 14).padding(.vertical, 6)
              .foregroundStyle(on ? Theme.paper : Theme.ink)
              .background(Capsule().fill(on ? Theme.ink : Theme.card))
              .overlay { if !on { Capsule().strokeBorder(Theme.line, lineWidth: 1) } }
              .contentShape(Capsule())
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, Theme.gutter)
    }
    .scrollIndicators(.hidden)
    .padding(.horizontal, -Theme.gutter)
  }
}

// 1d / 7d / 4w segmented control
public struct Segmented<K: Hashable>: View {
  var options: [Choice<K>], value: K, onChange: (K) -> Void

  public init(options: [Choice<K>], value: K, onChange: @escaping (K) -> Void) {
    self.options = options; self.value = value; self.onChange = onChange
  }

  public init(options: [Choice<K>], selection: Binding<K>) {
    self.init(options: options, value: selection.wrappedValue) { selection.wrappedValue = $0 }
  }

  public var body: some View {
    HStack(spacing: 0) {
      ForEach(options) { o in
        let on = o.k == value
        Button { onChange(o.k) } label: {
          Text(o.name).font(WaiFont.mono(13))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .foregroundStyle(on ? Theme.paper : Theme.muted)
            .background(Capsule().fill(on ? Theme.ink : .clear))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
      }
    }
    .padding(4)
    .background(Capsule().fill(Theme.card))
    .overlay(Capsule().strokeBorder(Theme.line, lineWidth: 1))
  }
}

// Tab strip with underline
public struct Tabs<K: Hashable>: View {
  var options: [Choice<K>], value: K, onChange: (K) -> Void

  public init(options: [Choice<K>], value: K, onChange: @escaping (K) -> Void) {
    self.options = options; self.value = value; self.onChange = onChange
  }

  public init(options: [Choice<K>], selection: Binding<K>) {
    self.init(options: options, value: selection.wrappedValue) { selection.wrappedValue = $0 }
  }

  public var body: some View {
    HStack(spacing: 24) {
      ForEach(options) { o in
        let on = o.k == value
        Button { onChange(o.k) } label: {
          // pb-2.5 plus a 2 pt underline that sits 1 pt over the strip's hairline (-mb-px)
          Text(o.name).font(WaiFont.sans(16, on ? .medium : .regular))
            .foregroundStyle(on ? Theme.ink : Theme.muted)
            .padding(.bottom, 11)
            .overlay(alignment: .bottom) { Rectangle().fill(on ? Theme.ink : .clear).frame(height: 2) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
  }
}

/// The bottom bar tabs, in TabBar order.
public enum Tab: String, CaseIterable, Identifiable, Sendable {
  case home, map, alerts, insights
  public var id: Self { self }
  public var label: String {
    switch self { case .home: "Home"; case .map: "Live"; case .alerts: "Alerts"; case .insights: "Insights" }
  }
  public var icon: String {
    switch self { case .home: "home"; case .map: "pin"; case .alerts: "bell"; case .insights: "chart" }
  }
}

public struct TabBar: View {
  @Binding var selection: Tab
  var alerts: Int

  public init(selection: Binding<Tab>, alerts: Int) { _selection = selection; self.alerts = alerts }

  public var body: some View {
    HStack(spacing: 0) {
      ForEach(Tab.allCases) { t in
        Button { selection = t } label: {
          VStack(spacing: 4) {
            Icon(t.icon, size: 24)
            Text(t.label).monoCaps(10)
          }
          .frame(maxWidth: .infinity)
          .padding(.top, 10).padding(.bottom, 8)
          .foregroundStyle(t == selection ? Theme.ink : Theme.muted)
          .overlay(alignment: .top) {
            if t == .alerts, alerts > 0 {
              // absolute left-1/2 top-1.5 ml-1: leading edge 4 pt right of centre, 6 pt from the top
              Text("\(alerts)").font(WaiFont.mono(10)).foregroundStyle(Theme.paper)
                .padding(.horizontal, 4)
                .frame(minWidth: 16, minHeight: 16)
                .background(Capsule().fill(Theme.alert))
                .alignmentGuide(HorizontalAlignment.center) { _ in -4 }
                .alignmentGuide(.top) { _ in -6 }
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(t == .alerts && alerts > 0 ? "\(t.label), \(alerts)" : t.label)
      }
    }
    .frame(maxWidth: 448) // max-w-md
    .frame(maxWidth: .infinity)
    .background(Theme.paper.ignoresSafeArea(edges: .bottom))
    .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
  }
}
