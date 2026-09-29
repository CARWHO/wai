import SwiftUI

// Bottom sheet: title, round close button, content.
// Present it with `.waiSheet(isPresented:)`, which fits the sheet to its content on iOS.
public struct Sheet<Content: View>: View {
  var title: String, sub: String?, onClose: () -> Void
  var content: Content

  public init(_ title: String, sub: String? = nil, onClose: @escaping () -> Void, @ViewBuilder content: () -> Content) {
    self.title = title; self.sub = sub; self.onClose = onClose; self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 0) {
          Text(title).font(WaiFont.sans(24, .medium)).tracking(24 * Theme.Tracking.tight)
          if let sub { Text(sub).font(WaiFont.sans(15)).foregroundStyle(Theme.muted) }
        }
        Spacer(minLength: 0)
        RoundButton(icon: "close", label: "Close", action: onClose)
      }
      VStack(alignment: .leading, spacing: 0) { content }
    }
    .frame(maxWidth: 448, alignment: .leading) // max-w-md
    .padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 24)
    .foregroundStyle(Theme.ink)
  }
}

private struct HeightKey: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

private struct WaiSheet<Body: View>: ViewModifier {
  @Binding var isPresented: Bool
  var title: String, sub: String?
  var body: () -> Body
  @State private var height: CGFloat = 300

  func body(content: Content) -> some View {
    content.sheet(isPresented: $isPresented) {
      let sheet = Sheet(title, sub: sub, onClose: { isPresented = false }, content: body)
        .background(GeometryReader { Color.clear.preference(key: HeightKey.self, value: $0.size.height) })
        .onPreferenceChange(HeightKey.self) { if $0 > 0 { height = $0 } }
      #if os(iOS)
      sheet
        .frame(maxHeight: .infinity, alignment: .top)
        .presentationDetents([.height(height)])
        .presentationCornerRadius(Theme.Radius.card)
        .presentationBackground(Theme.paper)
      #else
      sheet.frame(width: 390).background(Theme.paper)
      #endif
    }
  }
}

extension View {
  public func waiSheet<C: View>(isPresented: Binding<Bool>, title: String, sub: String? = nil,
                                @ViewBuilder content: @escaping () -> C) -> some View {
    modifier(WaiSheet(isPresented: isPresented, title: title, sub: sub, body: content))
  }
}
