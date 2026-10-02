import Foundation
import Observation
import Supabase

@MainActor @Observable
public final class SessionStore {
  public enum State { case loading, signedOut, signedIn(Session) }
  public private(set) var state: State = .loading
  @ObservationIgnored private var task: Task<Void, Never>?

  public init() {}

  public func start() {
    guard task == nil else { return }
    task = Task { [weak self] in
      // the first event is the stored session (.initialSession)
      for await (_, session) in supabase.auth.authStateChanges {
        guard let self else { return }
        self.state = session.map { .signedIn($0) } ?? .signedOut
      }
    }
  }

  /// Returns nil on success, else the message to show.
  public func signIn(email: String, password: String) async -> String? {
    do {
      try await supabase.auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
      return nil
    } catch {
      let message = (error as? AuthError)?.message ?? error.localizedDescription
      return message == "Invalid login credentials" ? "Wrong email or password." : message
    }
  }

  public func signOut() async {
    try? await supabase.auth.signOut()
  }
}
