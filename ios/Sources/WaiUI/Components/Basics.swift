import SwiftUI
import WaiKit

public struct Ring<Content: View>: View {
  var value: Double, size: CGFloat, stroke: CGFloat, color: Color, track: Color
  var content: Content

  public init(value: Double, size: CGFloat = 160, stroke: CGFloat = 12, color: Color, track: Color = Theme.line,
              @ViewBuilder content: () -> Content) {
    self.value = value; self.size = size; self.stroke = stroke; self.color = color; self.track = track
    self.content = content()
  }

  public var body: some View {
    ZStack {
      Circle().inset(by: stroke / 2).stroke(track, lineWidth: stroke)
      Circle().inset(by: stroke / 2)
        .trim(from: 0, to: min(100, max(0, value)) / 100)
        .stroke(color, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
        .rotationEffect(.degrees(-90))
      content.multilineTextAlignment(.center)
    }
    .frame(width: size, height: size)
  }
}

extension Ring where Content == EmptyView {
  public init(value: Double, size: CGFloat = 160, stroke: CGFloat = 12, color: Color, track: Color = Theme.line) {
    self.init(value: value, size: size, stroke: stroke, color: color, track: track) { EmptyView() }
  }
}

public struct Dot: View {
  var s: Status
  public init(_ s: Status) { self.s = s }
  public var body: some View { Circle().fill(Color.status(s)).frame(width: 8, height: 8) }
}

/// Sparkline: monotone curve over the values, y from min to max, 4 pt top margin, gaps at nil.
public struct Spark: View {
  var data: [Double?], color: Color, height: CGFloat

  public init(_ data: [Double?], color: Color = Theme.ink, height: CGFloat = 64) {
    self.data = data; self.color = color; self.height = height
  }

  /// `<Spark data={readings} k="level_cm" />`
  public init(data: [Reading], k: KeyPath<Reading, Double?>, color: Color = Theme.ink, height: CGFloat = 64) {
    self.init(data.map { $0[keyPath: k] }, color: color, height: height)
  }

  public var body: some View {
    SparkShape(data: data)
      .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
      .frame(height: height)
  }
}

struct SparkShape: Shape {
  var data: [Double?]

  func path(in rect: CGRect) -> Path {
    let ys = data.compactMap { $0 }.filter(\.isFinite)
    guard let lo = ys.min(), let hi = ys.max(), data.count > 1 else { return Path() }
    let top = rect.minY + 4, h = rect.height - 4
    let dx = rect.width / CGFloat(data.count - 1)
    func y(_ v: Double) -> CGFloat { hi == lo ? top + h / 2 : top + h * CGFloat((hi - v) / (hi - lo)) }
    // Split into runs of finite values, like recharts without connectNulls
    var runs: [[CGPoint]] = [[]]
    for (i, v) in data.enumerated() {
      if let v, v.isFinite { runs[runs.count - 1].append(CGPoint(x: rect.minX + CGFloat(i) * dx, y: y(v))) }
      else if !runs[runs.count - 1].isEmpty { runs.append([]) }
    }
    var p = Path()
    for run in runs where !run.isEmpty { monotoneX(run, into: &p) }
    return p
  }
}

// d3 curveMonotoneX, the curve recharts draws for type="monotone"
private func monotoneX(_ pts: [CGPoint], into p: inout Path) {
  p.move(to: pts[0])
  guard pts.count > 2 else { if pts.count == 2 { p.addLine(to: pts[1]) }; return }
  func sign(_ x: CGFloat) -> CGFloat { x < 0 ? -1 : 1 }
  let n = pts.count
  var t = [CGFloat](repeating: 0, count: n)
  for i in 1 ..< n - 1 {
    let a = pts[i - 1], b = pts[i], c = pts[i + 1]
    let h0 = b.x - a.x, h1 = c.x - b.x
    let s0 = (b.y - a.y) / h0, s1 = (c.y - b.y) / h1
    let q = (s0 * h1 + s1 * h0) / (h0 + h1)
    let m = (sign(s0) + sign(s1)) * min(abs(s0), abs(s1), 0.5 * abs(q))
    t[i] = m.isFinite ? m : 0
  }
  func ends(_ a: CGPoint, _ b: CGPoint, _ tt: CGFloat) -> CGFloat {
    let h = b.x - a.x
    return h != 0 ? (3 * (b.y - a.y) / h - tt) / 2 : tt
  }
  t[0] = ends(pts[0], pts[1], t[1])
  t[n - 1] = ends(pts[n - 2], pts[n - 1], t[n - 2])
  for i in 1 ..< n {
    let a = pts[i - 1], b = pts[i], d = (b.x - a.x) / 3
    p.addCurve(to: b, control1: CGPoint(x: a.x + d, y: a.y + d * t[i - 1]), control2: CGPoint(x: b.x - d, y: b.y - d * t[i]))
  }
}

/// The TS icon set, drawn with the nearest SF Symbol. Unknown names show a dashed question mark.
public struct Icon: View {
  var name: String, size: CGFloat

  public init(_ name: String, size: CGFloat = 20) { self.name = name; self.size = size }

  static let symbols: [String: String] = [
    "home": "house", "pin": "mappin.and.ellipse", "bell": "bell", "chart": "chart.xyaxis.line",
    "back": "chevron.left", "chevron": "chevron.right", "close": "xmark", "more": "ellipsis",
    "locate": "scope", "layers": "square.2.layers.3d", "search": "magnifyingglass", "check": "checkmark",
    "doc": "doc.text", "share": "square.and.arrow.up", "download": "arrow.down.to.line",
    "logout": "rectangle.portrait.and.arrow.right",
  ]

  public var body: some View {
    // strokeWidth 1.6 on a 24 box reads as a light symbol; "more" uses a heavy stroke (3)
    Image(systemName: Self.symbols[name] ?? "questionmark.square.dashed")
      .font(.system(size: size * 0.8, weight: name == "more" ? .bold : .light))
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

// Round outlined icon button (Halter ⋯ / ×). Without an action it is a plain view, for use as a NavigationLink label.
public struct RoundButton: View {
  var icon: String, label: String, action: (() -> Void)?

  public init(icon: String, label: String, action: (() -> Void)? = nil) {
    self.icon = icon; self.label = label; self.action = action
  }

  public var body: some View {
    let face = Icon(icon)
      .frame(width: 40, height: 40)
      .background(Circle().fill(Theme.card))
      .overlay(Circle().strokeBorder(Theme.line, lineWidth: 1))
      .contentShape(Circle())
      .accessibilityLabel(label)
    if let action {
      Button(action: action) { face }.buttonStyle(.plain)
    } else {
      face
    }
  }
}

// Small status pill, e.g. "Moved"
public struct Badge: View {
  var text: String, color: Color
  public init(_ text: String, color: Color = .status(.bad)) { self.text = text; self.color = color }
  public var body: some View {
    Text(text).monoCaps(10).foregroundStyle(Theme.paper)
      .padding(.horizontal, 8).padding(.vertical, 2)
      .background(Capsule().fill(color))
  }
}

// Row of day bars with counts, e.g. trough visits per day
public struct Bars: View {
  public struct Datum: Identifiable {
    public var k: String, label: String, n: Int
    public var id: String { k }
    public init(k: String, label: String, n: Int) { self.k = k; self.label = label; self.n = n }
  }

  var data: [Datum], height: CGFloat
  public init(_ data: [Datum], height: CGFloat = 64) { self.data = data; self.height = height }

  public var body: some View {
    let top = max(1, data.map(\.n).max() ?? 0)
    HStack(alignment: .bottom, spacing: 6) {
      ForEach(Array(data.enumerated()), id: \.element.id) { i, d in
        VStack(spacing: 4) {
          Text("\(d.n)").font(WaiFont.mono(11)).monospacedDigit()
          UnevenRoundedRectangle(topLeadingRadius: Theme.Radius.sm, topTrailingRadius: Theme.Radius.sm)
            .fill(i == data.count - 1 ? Theme.ink : Theme.line)
            .frame(height: height * max(0.03, CGFloat(d.n) / CGFloat(top)))
            .frame(height: height, alignment: .bottom)
          Text(d.label).font(WaiFont.mono(10)).textCase(.uppercase).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
      }
    }
  }
}
