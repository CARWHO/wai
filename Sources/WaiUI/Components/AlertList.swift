import SwiftUI
import WaiKit

// Open alerts as rows; each opens its page with the AI's analysis
public struct AlertList: View {
  @Environment(FarmStore.self) private var farm
  @Environment(Router.self) private var router
  public init() {}

  public var body: some View {
    if !farm.loading && farm.alerts.isEmpty {
      Text("No open alerts").font(WaiFont.sans(15)).foregroundStyle(Theme.muted)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    } else {
      VStack(spacing: 0) {
        ForEach(farm.alerts, id: \.key) { a in
          Row(sub: "\(a.detail.first ?? "") · \(ago(a.since, now: farm.now))", action: { router.openAlert(a.id) }) {
            HStack(spacing: 8) { Dot(.bad); Text("\(a.probe.name) · \(a.title)") }
          } trailing: { EmptyView() }
        }
      }
      .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
  }
}
