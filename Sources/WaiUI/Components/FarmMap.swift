import MapKit
import SwiftUI
import WaiKit

// Apple imagery stands in for the Esri World Imagery tiles.
enum MapLayer { case satellite, map }

// "Bore 1" -> "B1", "Trough A" -> "TA", "Dam" -> "DA"
func initials(_ name: String) -> String {
  let w = name.split(omittingEmptySubsequences: false, whereSeparator: \.isWhitespace)
  let s = w.count > 1 ? w.map { $0.first.map(String.init) ?? "" }.joined() : String(name.prefix(2))
  return String(s.prefix(2)).uppercased()
}

// Halter-style round badge pin
private struct Pin: View {
  let v: ProbeView, selected: Bool
  var body: some View {
    Text(initials(v.probe.name))
      .font(WaiFont.mono(11, .medium))
      .foregroundStyle(Theme.paper)
      .frame(width: 34, height: 34)
      .background(Circle().fill(Color.status(v.status)))
      .overlay(Circle().strokeBorder(selected ? Theme.ink : Theme.paper, lineWidth: selected ? 3 : 2))
      .contentShape(Circle())
  }
}

struct FarmMap: View {
  let views: [ProbeView]
  var selected: String?
  let onSelect: (String) -> Void
  var layer: MapLayer = .satellite
  var fit = 0

  @State private var position: MapCameraPosition = .automatic
  @State private var placed = false // MapContainer created with its start view
  @State private var followed = false // FollowLive done

  private var live: ProbeView? { views.first { $0.located != nil } }
  private var lat: Double { live?.probe.lat ?? views.reduce(0) { $0 + $1.probe.lat } / Double(views.count) }
  private var lng: Double { live?.probe.lng ?? views.reduce(0) { $0 + $1.probe.lng } / Double(views.count) }

  /// Leaflet `setView([lat, lng], zoom)`: 256 px tiles, so the view spans size × metres per pixel at that zoom
  private func view(_ lat: Double, _ lng: Double, _ zoom: Double, _ size: CGSize) -> MapCameraPosition {
    let mpp = 156_543.033_92 * cos(lat * .pi / 180) / pow(2, zoom)
    return .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                                      latitudinalMeters: mpp * size.height, longitudinalMeters: mpp * size.width))
  }

  private func sync(_ size: CGSize) {
    guard !views.isEmpty, size.width > 0 else { return }
    if !placed { placed = true; position = view(lat, lng, 15, size) }
    // Jump to the live probe once, when the phone's position first arrives
    if !followed, let live { followed = true; position = view(live.probe.lat, live.probe.lng, 17, size) }
  }

  var body: some View {
    GeometryReader { g in map(g.size) }
  }

  private func map(_ size: CGSize) -> some View {
    Map(position: $position, interactionModes: [.pan, .zoom]) {
      // geofence ring at each probe's home; red once the probe has left it
      ForEach(views) { v in
        if let hl = v.probe.homeLat, let hg = v.probe.homeLng {
          let moved = v.geo?.moved == true
          let color = moved ? Color.status(.bad) : Theme.paper
          MapCircle(center: CLLocationCoordinate2D(latitude: hl, longitude: hg), radius: v.probe.geofenceM)
            .foregroundStyle(color.opacity(moved ? 0.15 : 0.08))
            .stroke(color, style: StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
        }
      }
      ForEach(views) { v in
        Annotation(coordinate: CLLocationCoordinate2D(latitude: v.probe.lat, longitude: v.probe.lng), anchor: .center) {
          Pin(v: v, selected: v.probe.id == selected).onTapGesture { onSelect(v.probe.id) }
        } label: { EmptyView() }
      }
    }
    .mapStyle(layer == .satellite ? .imagery : .standard)
    .mapControls {}
    .onChange(of: "\(views.count)|\(live?.id ?? "")|\(size.width > 0)", initial: true) { sync(size) }
    // Go back to the start view each time `fit` changes ("Show whole farm")
    .onChange(of: fit) { position = view(lat, lng, live != nil ? 17 : 15, size) }
  }
}
