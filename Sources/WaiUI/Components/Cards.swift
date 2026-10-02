import SwiftUI

// Page header: big title, optional back chevron, right slot
public struct Header<Title: View, Right: View>: View {
  var back: (() -> Void)?
  var title: Title, right: Right

  public init(back: (() -> Void)? = nil, @ViewBuilder title: () -> Title, @ViewBuilder right: () -> Right) {
    self.back = back; self.title = title(); self.right = right()
  }

  public var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        if let back {
          Button(action: back) { Icon("back").frame(width: 36, height: 36).contentShape(Rectangle()) }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")
            .padding(.leading, -8)
        }
        title
          .font(WaiFont.sans(back == nil ? 32 : 20, .medium))
          .tracking(back == nil ? 32 * Theme.Tracking.tight : 20 * -0.01)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
      right
    }
    .frame(minHeight: 64 - 16)
    .padding(.top, 16)
  }
}

extension Header where Title == Text {
  public init(_ title: String, back: (() -> Void)? = nil, @ViewBuilder right: () -> Right) {
    self.init(back: back, title: { Text(title) }, right: right)
  }
}

extension Header where Title == Text, Right == EmptyView {
  public init(_ title: String, back: (() -> Void)? = nil) {
    self.init(back: back, title: { Text(title) }, right: { EmptyView() })
  }
}

// White card with a hairline border on the paper background, as on the landing page.
// Without an action it is a plain view, for use as a NavigationLink label.
public struct Card<Content: View>: View {
  var padding: EdgeInsets, action: (() -> Void)?
  var content: Content

  public init(padding: EdgeInsets = EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16),
              action: (() -> Void)? = nil, @ViewBuilder content: () -> Content) {
    self.padding = padding; self.action = action; self.content = content()
  }

  public var body: some View {
    let face = VStack(alignment: .leading, spacing: 0) { content }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(padding)
      .background(RoundedRectangle(cornerRadius: Theme.Radius.card).fill(Theme.card))
      .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card).strokeBorder(Theme.line, lineWidth: 1))
      .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
    if let action {
      Button(action: action) { face }.buttonStyle(.plain)
    } else {
      face
    }
  }
}

// Garmin section title: "In Focus", "At a Glance · See All"
public struct Section<Action: View, Content: View>: View {
  var title: String
  var action: Action, content: Content

  public init(_ title: String, @ViewBuilder action: () -> Action, @ViewBuilder content: () -> Content) {
    self.title = title; self.action = action(); self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text(title).font(WaiFont.sans(20, .medium)).tracking(20 * Theme.Tracking.tight)
        Spacer(minLength: 0)
        action
      }
      content
    }
  }
}

extension Section where Action == EmptyView {
  public init(_ title: String, @ViewBuilder content: () -> Content) {
    self.init(title, action: { EmptyView() }, content: content)
  }
}

// Small mono caption: units, eyebrows, table headers
public struct Label<Content: View>: View {
  var content: Content
  public init(@ViewBuilder content: () -> Content) { self.content = content() }
  public var body: some View { content.monoCaps().foregroundStyle(Theme.muted) }
}

extension Label where Content == Text {
  public init(_ text: String) { self.init { Text(text) } }
}

// Label / value row with a hairline divider. The chevron shows when there is an action,
// or when `chevron` is set for a row used as a NavigationLink label.
public struct Row<Key: View, Trailing: View>: View {
  var sub: String?, chevron: Bool, action: (() -> Void)?
  var key: Key, trailing: Trailing

  public init(sub: String? = nil, chevron: Bool = false, action: (() -> Void)? = nil,
              @ViewBuilder key: () -> Key, @ViewBuilder trailing: () -> Trailing) {
    self.sub = sub; self.chevron = chevron || action != nil; self.action = action
    self.key = key(); self.trailing = trailing()
  }

  public var body: some View {
    let face = HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 0) {
        key.font(WaiFont.sans(16))
        if let sub { Text(sub).font(WaiFont.mono(12)).foregroundStyle(Theme.muted) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      trailing.font(WaiFont.mono(15)).multilineTextAlignment(.trailing)
      if chevron { Icon("chevron", size: 16).foregroundStyle(Theme.muted) }
    }
    .padding(.vertical, 12)
    .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    .contentShape(Rectangle())
    if let action {
      Button(action: action) { face }.buttonStyle(.plain)
    } else {
      face
    }
  }
}

extension Row where Key == Text {
  public init(_ k: String, sub: String? = nil, chevron: Bool = false, action: (() -> Void)? = nil,
              @ViewBuilder trailing: () -> Trailing) {
    self.init(sub: sub, chevron: chevron, action: action, key: { Text(k) }, trailing: trailing)
  }
}

extension Row where Key == Text, Trailing == EmptyView {
  public init(_ k: String, sub: String? = nil, chevron: Bool = false, action: (() -> Void)? = nil) {
    self.init(sub: sub, chevron: chevron, action: action, key: { Text(k) }, trailing: { EmptyView() })
  }
}
