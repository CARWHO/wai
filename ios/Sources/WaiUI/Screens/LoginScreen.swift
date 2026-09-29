import SwiftUI
import WaiKit

// src/app/login/page.tsx. On success SessionStore switches RootView to the app.
struct LoginScreen: View {
  let session: SessionStore
  @State private var email = ""
  @State private var password = ""
  @State private var error = ""
  @State private var busy = false
  @FocusState private var focus: Field?

  private enum Field { case email, password }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Wordmark()
      Text("Know your soil and water without the walk.").foregroundStyle(Theme.muted).padding(.top, 12)
      VStack(alignment: .leading, spacing: 12) {
        Label("Email")
        input(.email) {
          TextField("", text: $email)
          #if os(iOS)
            .keyboardType(.emailAddress)
            .textContentType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          #endif
        }
        Label("Password").padding(.top, 8)
        input(.password) {
          SecureField("", text: $password)
          #if os(iOS)
            .textContentType(.password)
          #endif
        }
        if !error.isEmpty { Text(error).font(WaiFont.sans(14)).foregroundStyle(Theme.alert) }
        Button(action: submit) {
          Text(busy ? "Signing in…" : "Sign in")
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24).padding(.vertical, 12)
            .foregroundStyle(Theme.paper)
            .background(Capsule().fill(Theme.ink))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy ? 0.5 : 1)
        .padding(.top, 16)
      }
      .padding(.top, 40)
    }
    .frame(maxWidth: 448, maxHeight: .infinity, alignment: .leading)
    .padding(.horizontal, 24)
    .frame(maxWidth: .infinity)
  }

  private func input(_ f: Field, @ViewBuilder field: () -> some View) -> some View {
    field()
      .textFieldStyle(.plain)
      .font(WaiFont.sans(16))
      .focused($focus, equals: f)
      .onSubmit(submit)
      .padding(.horizontal, 16).padding(.vertical, 12)
      .background(RoundedRectangle(cornerRadius: Theme.Radius.card).fill(Theme.card))
      .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card).strokeBorder(focus == f ? Theme.ink : Theme.line, lineWidth: 1))
  }

  private func submit() {
    // `required` on both inputs
    guard !busy, !email.isEmpty, !password.isEmpty else { return }
    busy = true
    error = ""
    Task {
      error = await session.signIn(email: email, password: password) ?? ""
      busy = false
    }
  }
}
