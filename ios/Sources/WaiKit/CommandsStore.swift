import Foundation
import Observation
import Supabase

// Remote control over LoRa. Commands queue in Supabase; the bridge sends one after each uplink,
// so they land within one report interval.
@MainActor @Observable
public final class CommandsStore {
  public let probeId: String
  public private(set) var cmds: [Command] = [] // newest 5
  public private(set) var busy = false
  public private(set) var error: String?
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var stopping: Task<Void, Never>? // the previous task, until its channel is removed

  public init(probeId: String) { self.probeId = probeId }

  public func start() {
    guard task == nil else { return }
    let previous = stopping
    task = Task { [weak self] in
      // supabase.channel returns a channel that is still registered, and a subscribed channel takes no new listeners
      await previous?.value
      guard let self else { return }
      await self.load()
      if Task.isCancelled { return }
      let ch = supabase.channel("commands-\(self.probeId)")
      let changes = ch.postgresChange(AnyAction.self, schema: "public", table: "commands", filter: .eq("probe_id", value: self.probeId))
      do { try await ch.subscribeWithError() } catch { print("commands realtime:", error) }
      for await _ in changes { await self.load() }
      // ends on stop(); removed in a task of its own so the cancellation does not cut the unsubscribe short
      await Task { await supabase.removeChannel(ch) }.value
    }
  }

  public func stop() {
    task?.cancel()
    stopping = task
    task = nil
  }

  public func send(_ cmd: Command.Cmd, arg: Int? = nil) async {
    busy = true
    do {
      try await supabase.from("commands").insert(NewCommand(probe_id: probeId, cmd: cmd, arg: arg)).execute()
      error = nil
    } catch {
      self.error = error.localizedDescription
    }
    busy = false
  }

  private func load() async {
    if let data: [Command] = try? await supabase.from("commands").select().eq("probe_id", value: probeId)
      .order("created_at", ascending: false).limit(5).execute().value {
      cmds = data
    }
  }

  private struct NewCommand: Encodable {
    let probe_id: String, cmd: Command.Cmd, arg: Int?
  }
}

extension Command {
  /// "Ping", "Read now", "Interval 60 s"
  public var label: String {
    switch cmd {
    case .ping: "Ping"
    case .read: "Read now"
    case .interval: arg.map { "Interval \(Int($0)) s" } ?? "Interval"
    }
  }
}

extension Command.State {
  public var name: String {
    switch self { case .pending: "Pending"; case .sent: "Sent"; case .done: "Done"; case .failed: "Failed" }
  }
}
