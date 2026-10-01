import SwiftUI
import WaiUI

@main
struct WaiApp: App {
  var body: some Scene {
    WindowGroup { RootView(skipLogin: ProcessInfo.processInfo.environment["WAI_SKIP_LOGIN"] == "1") }
  }
}
