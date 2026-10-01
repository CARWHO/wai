import CoreLocation
import Foundation
import Observation

// Phone position. Silently does nothing if permission is denied.
@MainActor @Observable
public final class Location: NSObject, CLLocationManagerDelegate {
  public private(set) var here: Coord?
  @ObservationIgnored var onChange: ((Coord) -> Void)?
  @ObservationIgnored private let manager = CLLocationManager()

  override public init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
  }

  public func start() {
    manager.requestWhenInUseAuthorization()
    manager.startUpdatingLocation()
  }

  public func stop() { manager.stopUpdatingLocation() }

  nonisolated public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let c = locations.last?.coordinate else { return }
    let at = Coord(lat: c.latitude, lng: c.longitude)
    Task { @MainActor in
      self.here = at
      self.onChange?(at)
    }
  }

  nonisolated public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}
