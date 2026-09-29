import Foundation
import Observation
import Supabase

private let handledKey = "wai-handled-alerts"
private let snoozedKey = "wai-snoozed-alerts" // alert key -> time it wakes up
private let demoKey = "wai-demo"
private let page = 1000 // PostgREST row cap per request
private let pages = 3 // per probe: ~4 h of a 5 s hardware probe, weeks of a 30 min one
private let rowCap = 10_000 // bounded: the 5 s probe adds ~17k rows a day

public func nowMs() -> Millis { Date().timeIntervalSince1970 * 1000 }

@MainActor @Observable
public final class FarmStore {
  public private(set) var loading = true
  public private(set) var probes: [Probe] = [] { didSet { version += 1 } }
  public private(set) var rows: [Reading] = [] { didSet { version += 1 } } // newest first, as stored
  public private(set) var now = nowMs() { didSet { version += 1 } }
  public private(set) var here: Coord? { didSet { version += 1 } }
  public private(set) var demo: Bool { didSet { version += 1 } }
  public private(set) var handled: Set<String> { didSet { version += 1 } }
  public private(set) var snoozed: [String: Millis] { didSet { version += 1 } }

  public let location = Location()
  private var version = 0
  @ObservationIgnored private var cache: (version: Int, snapshot: FarmSnapshot)?
  @ObservationIgnored private var started = false
  @ObservationIgnored private var tasks: [Task<Void, Never>] = []
  @ObservationIgnored private var ticker: Task<Void, Never>?
  @ObservationIgnored private var channel: RealtimeChannelV2?

  public init() {
    let d = UserDefaults.standard
    demo = d.bool(forKey: demoKey)
    handled = Set(d.stringArray(forKey: handledKey) ?? [])
    snoozed = d.dictionary(forKey: snoozedKey) as? [String: Millis] ?? [:]
  }

  public var snapshot: FarmSnapshot {
    if let cache, cache.version == version { return cache.snapshot }
    let s = computeFarm(probes: probes, rows: rows, now: now, here: here, demo: demo, handled: handled, snoozed: snoozed)
    cache = (version, s)
    return s
  }

  public var views: [ProbeView] { snapshot.views }
  public var alerts: [Alert] { snapshot.alerts }
  public var readings: [Reading] { snapshot.readings }
  public var farmScore: Int { snapshot.farmScore }
  public var subScores: FarmSubScores { snapshot.subScores }

  public func start() {
    guard !started else { return }
    started = true
    location.onChange = { [weak self] in self?.here = $0 }
    location.start()
    tasks.append(Task { await load() })
    tasks.append(Task { await listen() })
    tick()
  }

  public func stop() {
    guard started else { return }
    started = false
    location.stop()
    tasks.forEach { $0.cancel() }
    tasks = []
    ticker?.cancel()
    if let channel { Task { await supabase.removeChannel(channel) } }
    channel = nil
  }

  public func handle(_ key: String) {
    handled.insert(key)
    UserDefaults.standard.set(Array(handled), forKey: handledKey)
  }

  public func snooze(_ key: String, ms: Millis) {
    snoozed[key] = nowMs() + ms
    UserDefaults.standard.set(snoozed, forKey: snoozedKey)
  }

  /// Returns the error message, or nil on success.
  public func setHome(_ probeId: String, at: Coord) async -> String? {
    do {
      try await supabase.from("probes").update(["home_lat": at.lat, "home_lng": at.lng]).eq("id", value: probeId).execute()
    } catch {
      return error.localizedDescription
    }
    if let i = probes.firstIndex(where: { $0.id == probeId }) {
      probes[i].homeLat = at.lat
      probes[i].homeLng = at.lng
    }
    return nil
  }

  public func setDemo(_ on: Bool) {
    UserDefaults.standard.set(on, forKey: demoKey)
    demo = on
    if started { tick() }
  }

  // per probe, so a 5 s hardware probe can't push the others out of the row cap
  private func load() async {
    defer { loading = false }
    guard let ps: [Probe] = try? await supabase.from("probes").select().order("name").execute().value else { return }
    let all = await withTaskGroup(of: [Reading].self) { group in
      for p in ps { group.addTask { await Self.probeReadings(p.id) } }
      return await group.reduce(into: []) { $0 += $1 }
    }
    probes = ps
    rows = all.sorted { $0.createdAt > $1.createdAt }
  }

  private nonisolated static func probeReadings(_ id: String) async -> [Reading] {
    var out: [Reading] = []
    for p in 0..<pages {
      let data: [Reading] = (try? await supabase.from("readings").select().eq("probe_id", value: id)
        .order("created_at", ascending: false).range(from: p * page, to: p * page + page - 1).execute().value) ?? []
      out += data
      if data.count < page { break }
    }
    return out
  }

  private func listen() async {
    let ch = supabase.channel("readings")
    channel = ch
    let inserts = ch.postgresChange(InsertAction.self, schema: "public", table: "readings")
    do { try await ch.subscribeWithError() } catch { print("readings realtime:", error) }
    for await insert in inserts {
      do {
        let r = try insert.decodeRecord(as: Reading.self, decoder: AnyJSON.decoder)
        rows = Array(([r] + rows).prefix(rowCap))
      } catch {
        print("readings realtime: skipped a row:", error)
      }
    }
  }

  // re-render so "last seen", online state and snoozes stay fresh; demo mode every 5 s so the probe looks live
  private func tick() {
    ticker?.cancel()
    ticker = Task { [weak self] in
      while let self, !Task.isCancelled {
        try? await Task.sleep(for: .seconds(self.demo ? 5 : 30))
        if Task.isCancelled { return }
        self.now = nowMs()
      }
    }
  }
}
