import SwiftUI
import WaiKit

// src/app/app/alerts/page.tsx
struct AlertsScreen: View {
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        Header("Alerts")
        AlertList().padding(.top, -16)
      }
      .frame(maxWidth: 448)
      .padding(.horizontal, Theme.gutter)
      .padding(.bottom, 112)
      .frame(maxWidth: .infinity)
    }
    .background(Theme.paper)
  }
}
