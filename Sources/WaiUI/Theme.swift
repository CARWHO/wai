import SwiftUI
import WaiKit

// Same tokens as the landing page (globals.css). `watch` is the one addition:
// the app has a middle state between healthy and alert. Light only.
public enum Theme {
  public static let paper = Color(hex: "#f6f5f1")
  public static let ink = Color(hex: "#141412")
  public static let muted = Color(hex: "#6b6a64")
  public static let line = Color(hex: "#e3e1da")
  public static let healthy = Color(hex: "#3a9d5d")
  public static let watch = Color(hex: "#d98b2b")
  public static let alert = Color(hex: "#d9482b")
  public static let mint = Color(hex: "#dcefe0")
  public static let card = Color.white

  /// Tailwind radii: `rounded` 4, `rounded-2xl` 16, `rounded-3xl` 24
  public enum Radius {
    public static let sm: CGFloat = 4
    public static let card: CGFloat = 16
    public static let xl3: CGFloat = 24
  }

  /// `px-4` page gutter, `p-4` card padding
  public static let gutter: CGFloat = 16

  /// Letter spacing in em: `tracking-tight` and `tracking-wider`. Multiply by the font size.
  public enum Tracking {
    public static let tight: CGFloat = -0.025
    public static let wider: CGFloat = 0.05
  }
}

extension Color {
  /// `#rrggbb` or `#rrggbbaa`
  public init(hex: String) {
    let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    let v = UInt64(s, radix: 16) ?? 0
    let rgba = s.count == 8 ? v : v << 8 | 0xff
    self.init(.sRGB,
              red: Double(rgba >> 24 & 0xff) / 255, green: Double(rgba >> 16 & 0xff) / 255,
              blue: Double(rgba >> 8 & 0xff) / 255, opacity: Double(rgba & 0xff) / 255)
  }

  /// `statusColor[s]`
  public static func status(_ s: Status) -> Color { Color(hex: s.hex) }
}

extension View {
  /// Paper background edge to edge, ink text in Chivo 16: the web `body`.
  public func waiPage() -> some View {
    font(WaiFont.sans(16)).foregroundStyle(Theme.ink).background(Theme.paper.ignoresSafeArea())
  }

  /// `font-mono text-xs uppercase tracking-wider`, the caption style used by Label, TabBar and Badge
  func monoCaps(_ size: CGFloat = 12) -> some View {
    font(WaiFont.mono(size)).tracking(size * Theme.Tracking.wider).textCase(.uppercase)
  }
}
