import SwiftUI
import WaiKit

// ✓ / ! / ✕ for each part of a hardware probe, from its latest reading
public struct SensorCheck: View {
  let v: ProbeView
  let now: Millis
  public init(v: ProbeView, now: Millis) { self.v = v; self.now = now }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Label("Sensor check")
      VStack(alignment: .leading, spacing: 6) {
        ForEach(health(v.latest, v.online, ago(v.latest?.createdAt, now: now)), id: \.part) { c in
          HStack(spacing: 8) {
            Text(c.s == .good ? "✓" : c.s == .watch ? "!" : "✕")
              .font(WaiFont.sans(14, .bold)).foregroundStyle(Color.status(c.s)).frame(width: 16)
            Text(c.part).font(WaiFont.sans(14, .medium)).frame(width: 112, alignment: .leading)
            Text(c.text).font(WaiFont.mono(13)).lineLimit(1).truncationMode(.tail)
              .foregroundStyle(c.s == .good ? Theme.ink : Color.status(c.s))
          }
        }
      }
      .padding(.top, 8)
    }
  }
}
