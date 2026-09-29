import Foundation
import Supabase
import WaiKit

// Loads the farm from the real Supabase project and prints what the store sees: `swift run WaiLiveCheck`
@MainActor func run() async -> Int32 {
  let farm = FarmStore()
  farm.start()
  let deadline = Date().addingTimeInterval(30)
  while farm.loading {
    if Date() > deadline { print("FAIL: farm still loading after 30 s"); return 1 }
    try? await Task.sleep(for: .milliseconds(100))
  }
  guard !farm.probes.isEmpty else { print("FAIL: no probes loaded"); return 1 }
  print("probes:", farm.probes.map(\.name).joined(separator: ", "))
  print("rows:", farm.rows.count)
  for p in farm.probes {
    let mine = farm.rows.filter { $0.probeId == p.id }
    print("  \(p.name): \(mine.count) rows, latest \(mine.first?.createdAt ?? "none")")
  }
  let s = farm.snapshot
  print("farmScore:", s.farmScore, "alerts:", s.alerts.count, "views:", s.views.count)
  while supabase.channels.first(where: { $0.topic.hasSuffix("readings") })?.status != .subscribed {
    if Date() > deadline { print("FAIL: readings realtime not subscribed"); return 1 }
    try? await Task.sleep(for: .milliseconds(100))
  }
  print("realtime: readings subscribed")
  farm.stop()

  let session = SessionStore()
  session.start()
  while case .loading = session.state {
    if Date() > deadline.addingTimeInterval(10) { print("FAIL: session still loading"); return 1 }
    try? await Task.sleep(for: .milliseconds(100))
  }
  switch session.state {
  case .signedOut: print("session: signedOut")
  case .signedIn(let s): print("session: signedIn", s.user.email ?? "")
  case .loading: break
  }
  return 0
}

exit(await run())
