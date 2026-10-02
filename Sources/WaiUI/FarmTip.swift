import SwiftUI
import WaiKit

// The AI's one suggestion for today, shared by Home and Insights (same cache key, one call)
@MainActor @Observable
public final class FarmTip {
  public private(set) var tip: AITip?
  public private(set) var key: String?
  public init() {}

  public static func key(_ f: FarmStore) -> String? {
    if f.loading { return nil }
    return "\(Int(jsRound(Double(f.farmScore) / 10))):\(f.views.map(\.status.rawValue).joined(separator: ",")):\(f.alerts.map(\.id).joined(separator: ","))"
  }

  public func load(_ f: FarmStore) async {
    guard let k = FarmTip.key(f), k != key else { return }
    key = k
    struct ProbeCtx: Encodable {
      var name: String; var online: Bool; var level_cm: Double?; var pct_full: Int?; var empty_in_h: Int?; var soil_pct: Double?; var alerts: [String]
    }
    struct Ctx: Encodable { var farmScore: Int; var subScores: Sub; var probes: [ProbeCtx] }
    struct Sub: Encodable { var level: Int; var soil: Int; var quality: Double?; var devices: Int }
    let s = f.subScores
    let ctx = Ctx(
      farmScore: f.farmScore,
      subScores: Sub(level: s.level, soil: s.soil, quality: s.quality.isNaN ? nil : s.quality, devices: s.devices),
      probes: f.views.map { v in
        ProbeCtx(name: v.probe.name, online: v.online, level_cm: v.latest?.levelCm,
                 pct_full: v.latest?.pctFull.map { Int(jsRound($0)) }, empty_in_h: v.emptyIn.map { Int(jsRound($0)) },
                 soil_pct: v.latest?.soilPct, alerts: f.alerts.filter { $0.probe.id == v.probe.id }.map(\.title))
      })
    let t: AITip? = await AIClient.shared.ask(kind: .tip, context: ctx, key: k)
    if key == k { tip = t }
  }
}
