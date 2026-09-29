import SwiftUI
import WaiKit

// src/app/app/layout.tsx + login/page.tsx: signed-out visitors see the login page, then the app.
public struct RootView: View {
  @State private var session = SessionStore()
  let skipLogin: Bool // dev runner only: RLS allows anonymous reads, so the shell works without a session
  public init(skipLogin: Bool = false) { self.skipLogin = skipLogin }
  public var body: some View {
    Group {
      switch session.state {
      case .loading: Theme.paper.ignoresSafeArea()
      case .signedOut where !skipLogin: LoginScreen(session: session)
      default: AppShell(session: session)
      }
    }
    .waiPage()
    .task { session.start() }
  }
}

struct AppShell: View {
  let session: SessionStore
  @State private var farm = FarmStore()
  @State private var router = Router()

  var body: some View {
    ZStack {
      // Like LiveMapProvider: the map stays alive behind every tab so tiles are ready when Live opens
      MapScreen(visible: router.tab == .map)
        .opacity(router.tab == .map ? 1 : 0)
        .allowsHitTesting(router.tab == .map)
      if router.tab != .map {
        Group {
          switch router.tab {
          case .home: stack($router.home) { HomeScreen() }
          case .alerts: stack($router.alerts) { AlertsScreen() }
          case .insights: stack($router.insights) { InsightsScreen() }
          case .map: EmptyView()
          }
        }
        .background(Theme.paper)
      }
    }
    .safeAreaInset(edge: .bottom) { TabBar(selection: $router.tab, alerts: farm.alerts.count) }
    .environment(farm)
    .environment(router)
    .environment(session)
    .task { farm.start() }
  }

  private func stack<Root: View>(_ path: Binding<[Route]>, @ViewBuilder root: () -> Root) -> some View {
    NavigationStack(path: path) {
      root()
        .navigationDestination(for: Route.self) { r in
          switch r {
          case .probe(let id): ProbeScreen(id: id)
          case .alert(let id): AlertDetailScreen(id: id)
          case .report: ReportScreen()
          }
        }
    }
    #if os(iOS)
    .toolbar(.hidden, for: .navigationBar) // screens draw their own Header, like the web
    #endif
  }
}
