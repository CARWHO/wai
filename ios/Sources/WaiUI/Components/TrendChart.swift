import SwiftUI
import WaiKit

// src/components/TrendChart.tsx. STUB: filled in by the insights port; the probe screen calls it.
public struct TrendSeries {
  public var name: String
  public var readings: [Reading]
  public init(name: String, readings: [Reading]) { self.name = name; self.readings = readings }
}

public struct TrendChart: View {
  let m: Metric
  let series: [TrendSeries]
  let hours: Double
  let height: CGFloat
  public init(m: Metric, series: [TrendSeries], hours: Double, height: CGFloat = 200) {
    self.m = m; self.series = series; self.hours = hours; self.height = height
  }
  public var body: some View { Color.clear.frame(height: height) }
}
