import Foundation
import Supabase

// Port of the web app types. Times are ISO strings as stored, plus `t` in ms since epoch
// (same unit as the TypeScript app, so fixtures compare directly).
public typealias Millis = Double

public struct Probe: Codable, Identifiable, Hashable, Sendable {
  public var id: String
  public var name: String
  public var lat: Double
  public var lng: Double
  public var depthCm: Double?
  public var homeLat: Double?
  public var homeLng: Double?
  public var geofenceM: Double

  enum CodingKeys: String, CodingKey {
    case id, name, lat, lng
    case depthCm = "depth_cm"
    case homeLat = "home_lat"
    case homeLng = "home_lng"
    case geofenceM = "geofence_m"
  }

  public init(id: String, name: String, lat: Double, lng: Double, depthCm: Double? = nil,
              homeLat: Double? = nil, homeLng: Double? = nil, geofenceM: Double = 50) {
    self.id = id; self.name = name; self.lat = lat; self.lng = lng; self.depthCm = depthCm
    self.homeLat = homeLat; self.homeLng = homeLng; self.geofenceM = geofenceM
  }
}

public struct Reading: Codable, Identifiable, Hashable, Sendable {
  public var id: Int
  public var probeId: String
  public var turbidity: Double?
  public var ph: Double?
  public var tempC: Double?
  public var tds: Double?
  public var levelCm: Double?
  public var soilPct: Double?
  public var pctFull: Double? // derived: levelCm / probe depthCm
  public var raw: [String: AnyJSON]? // every unprocessed value from the ESP32 probe
  public var createdAt: String

  enum CodingKeys: String, CodingKey {
    case id, turbidity, ph, tds, raw
    case probeId = "probe_id"
    case tempC = "temp_c"
    case levelCm = "level_cm"
    case soilPct = "soil_pct"
    case pctFull = "pct_full"
    case createdAt = "created_at"
  }

  public init(id: Int, probeId: String, turbidity: Double? = nil, ph: Double? = nil, tempC: Double? = nil,
              tds: Double? = nil, levelCm: Double? = nil, soilPct: Double? = nil, pctFull: Double? = nil,
              raw: [String: AnyJSON]? = nil, createdAt: String) {
    self.id = id; self.probeId = probeId; self.turbidity = turbidity; self.ph = ph; self.tempC = tempC
    self.tds = tds; self.levelCm = levelCm; self.soilPct = soilPct; self.pctFull = pctFull; self.raw = raw
    self.createdAt = createdAt
  }

  /// ms since epoch, like `new Date(r.created_at).getTime()`
  public var t: Millis { parseISO(createdAt) }
}

public struct Command: Codable, Identifiable, Hashable, Sendable {
  public enum Cmd: String, Codable, Sendable { case ping, read, interval }
  public enum State: String, Codable, Sendable { case pending, sent, done, failed }
  public var id: Int
  public var probeId: String
  public var cmd: Cmd
  public var arg: Double?
  public var status: State
  public var createdAt: String
  public var sentAt: String?
  public var ackedAt: String?

  enum CodingKeys: String, CodingKey {
    case id, cmd, arg, status
    case probeId = "probe_id"
    case createdAt = "created_at"
    case sentAt = "sent_at"
    case ackedAt = "acked_at"
  }
}

public enum Status: String, Codable, Sendable {
  case good, watch, bad
  public var label: String {
    switch self { case .good: "Healthy"; case .watch: "Watch"; case .bad: "Action needed" }
  }
  public var hex: String {
    switch self { case .good: "#3a9d5d"; case .watch: "#d98b2b"; case .bad: "#d9482b" }
  }
}

// Alert thresholds, all in one place
public enum Limits {
  public static let turbidity = 10.0, phMin = 6.5, phMax = 8.5, tds = 600.0
  public static let levelPct = 25.0
  public static let soilDry = 20.0, soilWet = 90.0
  public static let hdopMax = 5.0
  public static let offlineMinMs: Millis = 2 * 60_000
}

public enum MetricKey: String, Codable, CaseIterable, Sendable {
  case levelCm = "level_cm", pctFull = "pct_full", soilPct = "soil_pct", turbidity, ph, tds, tempC = "temp_c"
}

public struct Metric: Hashable, Sendable {
  public let key: MetricKey
  public let name: String
  public let unit: String
  public let digits: Int
  public let min: Double?
  public let max: Double?
  public let low: String? // alert titles, e.g. "Soil dry"
  public let high: String?
  public let wq: Bool // water quality sensor: only shown for probes that have one
}

public struct ProbeView: Identifiable, Sendable {
  public var id: String { probe.id }
  public var probe: Probe // lat/lng replaced by the GPS fix or the phone when `located` is set
  public var latest: Reading?
  public var history: [Reading] // oldest first
  public var score: Int
  public var status: Status
  public var online: Bool
  public var hardware: Bool // real ESP32 probe (fills `raw`)
  public var interval: Millis // usual ms between reports
  public var scores: SubScores // .nan when the probe has no such sensor
  public var emptyIn: Double? // hours until empty at the current rate
  public var visits: [Millis] // trough visit start times
  public var geo: Geofence?
  public var located: Located?

  public enum Located: String, Sendable { case gps, phone }
  public struct SubScores: Sendable { public var level: Double, soil: Double, quality: Double }
}

public struct Geofence: Sendable {
  public var home: Coord
  public var radius: Double
  public var distance: Double
  public var moved: Bool
}

public struct Coord: Hashable, Codable, Sendable {
  public var lat: Double
  public var lng: Double
  public init(lat: Double, lng: Double) { self.lat = lat; self.lng = lng }
}

public enum AlertKind: String, Codable, Sendable { case quality, level, soil, moved, offline }

public struct Alert: Identifiable, Sendable {
  public var id: String // probe + kind, used for navigation
  public var key: String // id + first reading of the streak, so a new streak is a new alert
  public var kind: AlertKind
  public var probe: Probe
  public var since: String
  public var reading: Reading
  public var title: String
  public var detail: [String]
}

// ISO 8601 with or without fractional seconds, as Postgres returns it
private let isoFrac: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
}()
private let isoPlain = ISO8601DateFormatter()

public func parseISO(_ s: String) -> Millis {
  // rounded: Date is a Double of seconds, so ms can come back a fraction off and break floor(ms / 1000)
  if let d = isoFrac.date(from: s) ?? isoPlain.date(from: s) { return (d.timeIntervalSince1970 * 1000).rounded() }
  // Postgres may emit more than 3 fractional digits; trim to 3
  if let dot = s.firstIndex(of: "."), let end = s[dot...].firstIndex(where: { $0 == "+" || $0 == "Z" || $0 == "-" }) {
    let frac = String(s[s.index(after: dot)..<end]).prefix(3)
    let fixed = String(s[..<dot]) + "." + frac + String(s[end...])
    if let d = isoFrac.date(from: fixed) { return (d.timeIntervalSince1970 * 1000).rounded() }
  }
  return .nan
}

public func isoString(_ ms: Millis) -> String { jsISO(ms) } // whole-ms exact, like Date.prototype.toISOString
