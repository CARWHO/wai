import Foundation

public enum AIKind: String, Sendable { case alert, tip, fertiliser }

// Response shapes of src/app/api/ai/route.ts. `source` is "openai" or "fallback".
public struct AIAlert: Codable, Hashable, Sendable {
  public var wrong: String
  public var cause: String
  public var action: String // 2-3 lines separated by newlines
  public var risk: String
  public var source: String?
}

public struct AITip: Codable, Hashable, Sendable {
  public var title: String
  public var body: String
  public var source: String?
}

public struct AIFertiliser: Codable, Hashable, Sendable {
  public var verdict: String // "Apply now" | "Wait for rain" | "Too wet — leaching risk"
  public var reason: String
  public var rain48hMm: Double?
  public var rainChancePct: Double?
  public var soilPct: Double?
  public var source: String?

  enum CodingKeys: String, CodingKey {
    case verdict, reason, source
    case rain48hMm = "rain_48h_mm"
    case rainChancePct = "rain_chance_pct"
    case soilPct = "soil_pct"
  }
}

// Calls /api/ai once per cache key; results are kept for the process lifetime.
public actor AIClient {
  public static let shared = AIClient()
  private var cache: [String: Data] = [:]
  private var inFlight: [String: Task<Data?, Never>] = [:]

  public func ask<T: Decodable & Sendable>(kind: AIKind, context: some Encodable, key: String) async -> T? {
    let k = "wai-ai:\(kind.rawValue):\(key)"
    guard let data = await fetch(k, kind: kind, context: context) else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
  }

  private func fetch(_ k: String, kind: AIKind, context: some Encodable) async -> Data? {
    if let hit = cache[k] { return hit }
    if let running = inFlight[k] { return await running.value }
    guard let body = try? JSONEncoder().encode(Body(kind: kind.rawValue, context: context)) else { return nil }
    var req = URLRequest(url: Config.aiBase.appendingPathComponent("api/ai"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = body
    let task = Task { () -> Data? in
      guard let (data, res) = try? await URLSession.shared.data(for: req),
            (res as? HTTPURLResponse)?.statusCode == 200 else { return nil }
      return data
    }
    inFlight[k] = task
    let data = await task.value
    inFlight[k] = nil
    if let data { cache[k] = data }
    return data
  }

  private struct Body<C: Encodable>: Encodable {
    let kind: String
    let context: C
  }
}
