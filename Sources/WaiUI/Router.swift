import SwiftUI
import WaiKit

// Stands in for Next.js routes. Each tab keeps its own stack, like the web keeps scroll per page.
public enum Route: Hashable {
  case probe(String) // /app/probe/[id]
  case alert(String) // /app/alerts/[id]  (probe~kind, or a bare probe id)
  case report        // /app/report
}

@MainActor @Observable
public final class Router {
  public var tab: Tab = .home
  public var home: [Route] = []
  public var alerts: [Route] = []
  public var insights: [Route] = []
  public var mapProbe: String? // sheet to open on the Live tab (/app/map?probe=)

  public init() {}

  public func push(_ r: Route) {
    switch tab {
    case .home: home.append(r)
    case .alerts: alerts.append(r)
    case .insights: insights.append(r)
    case .map: tab = .home; home.append(r)
    }
  }
  public func openProbe(_ id: String) { push(.probe(id)) }
  public func openAlert(_ id: String) { push(.alert(id)) }
  public func openReport() { push(.report) }
  public func openMap(probe: String? = nil) { mapProbe = probe; tab = .map }
  public func openAlerts() { alerts = []; tab = .alerts }
  public func openInsights() { insights = []; tab = .insights }
  public func openHome() { home = []; tab = .home }
  /// Back: pop the current stack
  public func back() {
    switch tab {
    case .home: _ = home.popLast()
    case .alerts: _ = alerts.popLast()
    case .insights: _ = insights.popLast()
    case .map: tab = .home
    }
  }
}
