import SwiftUI
import WaiKit

private struct AIColorKey: EnvironmentKey { static let defaultValue = Theme.healthy }

extension EnvironmentValues {
  /// The CSS `--ai` variable: the enclosing AICard's status colour.
  var aiColor: Color {
    get { self[AIColorKey.self] }
    set { self[AIColorKey.self] = newValue }
  }
}

// "Wai AI" card: the landing page's koru and label on a white card with a soft light,
// coloured by status (green, amber, red)
public struct AICard<Content: View>: View {
  var s: Status, note: String?
  var content: Content
  @State private var glow = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  public init(s: Status = .good, note: String? = nil, @ViewBuilder content: () -> Content) {
    self.s = s; self.note = note; self.content = content()
  }

  public var body: some View {
    let c = Color.status(s)
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        Koru().frame(width: 20, height: 20)
        Text("Wai AI").monoCaps()
        if let note {
          Spacer(minLength: 0)
          Text(note).font(WaiFont.mono(11)).foregroundStyle(Theme.muted).lineLimit(1)
        }
      }
      .foregroundStyle(c)
      VStack(alignment: .leading, spacing: 0) { content }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(alignment: .topLeading) {
      // ai-glow: 128 pt disc at -24/-24, blur-3xl, opacity 0.5 ↔ 1 over 4 s
      Circle().fill(c.opacity(38.0 / 255))
        .frame(width: 128, height: 128)
        .blur(radius: 32)
        .offset(x: -24, y: -24)
        .opacity(reduceMotion || glow ? 1 : 0.5)
        .allowsHitTesting(false)
    }
    .overlay(alignment: .topLeading) {
      Rectangle().fill(c).frame(width: 24, height: 2).padding(.leading, 16)
    }
    .background(Theme.card)
    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card).strokeBorder(Theme.line, lineWidth: 1))
    .environment(\.aiColor, c)
    .onAppear {
      guard !reduceMotion else { return }
      withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) { glow = true }
    }
  }
}

// "Next" action line, as on the landing page's alert cells, in the AICard's status colour
public struct AINext: View {
  var text: String
  @Environment(\.aiColor) private var color
  public init(_ text: String) { self.text = text }

  public var body: some View {
    (Text("NEXT").font(WaiFont.mono(12)).tracking(12 * Theme.Tracking.wider) + Text(" ") + Text(text))
      .font(WaiFont.sans(15, .medium))
      .lineSpacing(15 * 0.625 - 3)
      .foregroundStyle(color)
      .fixedSize(horizontal: false, vertical: true)
  }
}

// Shown on an AICard while the model answers
public struct AIThinking: View {
  var text: String
  @State private var dim = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  public init(_ text: String) { self.text = text }

  public var body: some View {
    // animate-pulse: opacity 1 → 0.5 → 1 over 2 s
    Text(text).font(WaiFont.sans(15)).foregroundStyle(Theme.muted)
      .opacity(dim ? 0.5 : 1)
      .onAppear {
        guard !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { dim = true }
      }
  }
}
