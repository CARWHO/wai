import SwiftUI
import WaiKit

// Every component once, with sample data, to eyeball the port in WaiMac.
public struct ComponentGallery: View {
  @State private var chip = "level"
  @State private var range = "7d"
  @State private var tab = "metrics"
  @State private var bar = Tab.home
  @State private var sheet = false

  public init() {}

  private let metrics = [Choice("level", "Water level"), Choice("soil", "Soil moisture"), Choice("ph", "pH"),
                         Choice("turb", "Turbidity"), Choice("tds", "TDS"), Choice("temp", "Temperature")]
  private let spark: [Double?] = [42, 44, 43, 47, 52, 51, nil, 48, 45, 46, 50, 55, 53, 49]

  public var body: some View {
    ScrollView { content }
    .safeAreaInset(edge: .bottom, spacing: 0) { TabBar(selection: $bar, alerts: 3) }
    .frame(width: 390)
    .waiPage()
    .waiSheet(isPresented: $sheet, title: "Trough 2", sub: "Paddock 4") {
      VStack(spacing: 10) { Card { Text("Show on map") }; Card { Text("Send a ping") } }
    }
    .onAppear { print("WaiFont registered:", WaiFont.registered) }
  }

  private var content: some View {
      VStack(alignment: .leading, spacing: 28) {
        Header(title: { Wordmark() }) {
          HStack(spacing: 12) { Label("UC farm"); RoundButton(icon: "logout", label: "Sign out") {} }
        }
        Header("Trough 2", back: {}) { RoundButton(icon: "more", label: "More") {} }

        HStack(spacing: 16) {
          Ring(value: 72, size: 88, stroke: 8, color: .status(.good)) {
            Text("72").font(WaiFont.sans(28, .medium)).monospacedDigit()
          }
          Ring(value: 45, size: 64, stroke: 6, color: .status(.watch))
          Ring(value: 18, size: 40, stroke: 4, color: .status(.bad), track: Color(hex: "#3f3e3a")) {
            Text("18").font(WaiFont.mono(12))
          }
          HStack(spacing: 6) { Dot(.good); Dot(.watch); Dot(.bad) }
          Badge("Moved")
        }

        AICard(s: .watch, note: "From your probes now") {
          Text("Top up trough 2 before 4 pm").font(WaiFont.sans(22, .medium)).tracking(22 * Theme.Tracking.tight)
          AINext("Open the float valve.\nIt empties in 6 h at this rate.")
        }
        AICard(s: .bad) { AIThinking("Reading every probe…") }

        Section("At a Glance", action: { Text("See all").font(WaiFont.sans(14)).foregroundStyle(Theme.muted).underline() }) {
          Card(action: {}) {
            HStack { Dot(.good); Text("Trough 2").font(WaiFont.sans(16, .medium)); Spacer(); Badge("Moved") }
            Spark(spark, height: 40).padding(.top, 12)
          }
        }

        Section("Controls") {
          Chips(options: metrics, selection: $chip)
          Segmented(options: [Choice("1d", "1d"), Choice("7d", "7d"), Choice("4w", "4w")], selection: $range)
          Tabs(options: [Choice("metrics", "Metrics"), Choice("history", "History"), Choice("device", "Device")], selection: $tab)
        }

        VStack(spacing: 0) {
          Row("Status") { Text("Healthy") }
          Row("Empty in", sub: "At the last 6 h rate") { Text("6.2 h") }
          Row(sub: "Fills gaps in the probe's data", action: {}, key: { HStack(spacing: 8) { Dot(.watch); Text("Demo mode") } }) { Text("On") }
          Row("Open sheet", action: { sheet = true })
        }

        Card {
          Label("Trough visits")
          Bars([("1", "M", 4), ("2", "T", 7), ("3", "W", 2), ("4", "T", 0), ("5", "F", 9), ("6", "S", 5), ("7", "S", 6)]
            .map { Bars.Datum(k: $0.0, label: $0.1, n: $0.2) }, height: 48)
            .padding(.top, 8)
        }

        HStack(spacing: 16) {
          Sparkles(size: 24).foregroundStyle(Theme.healthy)
          Koru().frame(width: 40, height: 40).foregroundStyle(Theme.ink)
          Koru(viewBox: CGRect(x: 0, y: 0, width: 1000, height: 1000)).frame(width: 40, height: 40).foregroundStyle(Theme.healthy)
        }
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 9), spacing: 12) {
          ForEach(Icon.symbols.keys.sorted() + ["nope"], id: \.self) { Icon($0) }
        }
        Label {
          HStack { Text("● Alert").foregroundStyle(Theme.alert); Spacer(); Text("12 min ago") }
        }
      }
      .padding(.horizontal, Theme.gutter)
      .padding(.bottom, 24)
  }

  #if os(macOS)
  /// Renders the gallery (without the scroll view, which ImageRenderer cannot draw) to a PNG at 2x.
  /// For checking the port where screen capture is not permitted.
  @MainActor public static func renderPNG(to url: URL) throws {
    let page = VStack(spacing: 0) {
      ComponentGallery().content
      TabBar(selection: .constant(.alerts), alerts: 3)
      Sheet("Trough 2", sub: "Paddock 4", onClose: {}) { Card { Text("Show on map") } }.background(Theme.paper)
    }
    .frame(width: 390).waiPage()
    let r = ImageRenderer(content: page)
    r.scale = 2
    guard let cg = r.cgImage else { return }
    let data = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:])
    try data?.write(to: url)
  }
  #endif
}
