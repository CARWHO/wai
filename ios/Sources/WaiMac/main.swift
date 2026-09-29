import SwiftUI
import WaiUI

// macOS dev runner: the same RootView the iOS app shows, so the port can be built and run without Xcode.
@main
struct WaiMacApp: App {
  var body: some Scene {
    WindowGroup("Wai") { RootView().frame(minWidth: 390, idealWidth: 390, minHeight: 844, idealHeight: 844) }
  }
}
