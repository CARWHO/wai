import Foundation

// Pure farm computations from src/lib/farm.tsx. The store calls these; the UI reads the results.
// STUB: bodies are filled in by the domain port. Signatures are the contract.

public struct FarmSnapshot: Sendable {
  public var views: [ProbeView]
  public var readings: [Reading] // enriched, newest first
  public var alerts: [Alert]
  public var farmScore: Int
  public var subScores: FarmSubScores
  public init(views: [ProbeView], readings: [Reading], alerts: [Alert], farmScore: Int, subScores: FarmSubScores) {
    self.views = views; self.readings = readings; self.alerts = alerts; self.farmScore = farmScore; self.subScores = subScores
  }
}

public struct FarmSubScores: Sendable {
  public var level: Int, soil: Int, quality: Double, devices: Int // quality is .nan when no probe measures it
  public init(level: Int, soil: Int, quality: Double, devices: Int) {
    self.level = level; self.soil = soil; self.quality = quality; self.devices = devices
  }
}

/// Everything the screens need, from the raw rows (newest first, as stored) and the UI state.
/// - rows: readings as stored, newest first
/// - now: ms since epoch
/// - here: the phone position, if known
/// - demo: demo mode on
/// - handled / snoozed: alert keys the farmer dismissed, and keys with the ms they wake up
public func computeFarm(probes: [Probe], rows: [Reading], now: Millis, here: Coord?, demo: Bool,
                        handled: Set<String>, snoozed: [String: Millis]) -> FarmSnapshot {
  FarmSnapshot(views: [], readings: rows, alerts: [], farmScore: 0,
               subScores: FarmSubScores(level: 0, soil: 0, quality: .nan, devices: 0))
}
