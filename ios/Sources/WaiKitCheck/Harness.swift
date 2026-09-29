import Foundation

// Minimal check harness: `swift run WaiKitCheck` exits 1 if any check fails.
nonisolated(unsafe) var failures = 0
nonisolated(unsafe) var checks = 0

func check(_ name: String, _ ok: Bool, _ detail: @autoclosure () -> String = "") {
  checks += 1
  if !ok {
    failures += 1
    print("FAIL \(name) \(detail())")
  }
}

func checkEqual<T: Equatable>(_ name: String, _ a: T, _ b: T) {
  check(name, a == b, "got \(a) expected \(b)")
}

func checkClose(_ name: String, _ a: Double, _ b: Double, tol: Double = 1e-6) {
  if a.isNaN && b.isNaN { checks += 1; return }
  check(name, abs(a - b) <= tol * max(1, abs(b)), "got \(a) expected \(b)")
}

/// Fixtures live in ios/Fixtures, found relative to this source file so no bundle is needed.
let fixturesDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
  .deletingLastPathComponent().appendingPathComponent("Fixtures")

func fixture<T: Decodable>(_ name: String, as: T.Type) throws -> T {
  let data = try Data(contentsOf: fixturesDir.appendingPathComponent(name))
  return try JSONDecoder().decode(T.self, from: data)
}

func finish() -> Never {
  print(failures == 0 ? "OK \(checks) checks" : "FAILED \(failures) of \(checks) checks")
  exit(failures == 0 ? 0 : 1)
}
