import SwiftUI
import WaiKit

// Remote control over LoRa. Commands queue in Supabase; the bridge sends one
// after each uplink, so they land within one report interval.
struct ProbeControls: View {
  @Environment(FarmStore.self) private var farm
  @State private var cmds: CommandsStore
  @State private var secs = "60"

  init(probeId: String) { _cmds = State(initialValue: CommandsStore(probeId: probeId)) }

  var body: some View {
    let n = jsRound(Double(secs.trimmingCharacters(in: .whitespaces)) ?? .nan)
    Section("Controls") {
      // flex-wrap: the interval group drops to its own line, right-aligned, when the row is too narrow
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8) { commands; Spacer(minLength: 0); intervalGroup(n) }
        VStack(alignment: .trailing, spacing: 8) {
          HStack(spacing: 8) { commands }.frame(maxWidth: .infinity, alignment: .leading)
          intervalGroup(n)
        }
      }
      if let error = cmds.error {
        Text(error).font(WaiFont.mono(12)).foregroundStyle(Color.status(.bad))
      }
      if !cmds.cmds.isEmpty {
        VStack(spacing: 0) {
          ForEach(cmds.cmds) { c in
            Row(c.label, sub: ago(c.createdAt, now: farm.now)) { Text(c.status.name).foregroundStyle(color(c.status)) }
          }
        }
        .padding(.top, -4)
      }
      Text("Sent over LoRa after the probe's next report.").font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
    }
    .task { cmds.start() }
    .onDisappear { cmds.stop() }
  }

  @ViewBuilder private var commands: some View {
    pill("Ping", disabled: cmds.busy) { Task { await cmds.send(.ping) } }
    pill("Read now", disabled: cmds.busy) { Task { await cmds.send(.read) } }
  }

  private func intervalGroup(_ n: Double) -> some View {
    HStack(spacing: 8) {
      TextField("", text: $secs)
        .textFieldStyle(.plain)
        .multilineTextAlignment(.trailing)
        .font(WaiFont.mono(13))
        #if os(iOS)
        .keyboardType(.numberPad)
        #endif
        .accessibilityLabel("Interval in seconds")
        .padding(.horizontal, 12).padding(.vertical, 6)
        .frame(width: 80)
        .background(Capsule().fill(Theme.card))
        .overlay(Capsule().strokeBorder(Theme.line, lineWidth: 1))
      Text("s").font(WaiFont.mono(12)).foregroundStyle(Theme.muted)
      pill("Set interval", primary: true, disabled: cmds.busy || !(n >= 5 && n <= 3600)) {
        Task { await cmds.send(.interval, arg: Int(n)) }
      }
    }
  }

  private func color(_ s: Command.State) -> Color {
    switch s {
    case .pending: Theme.muted
    case .sent: .status(.watch)
    case .done: .status(.good)
    case .failed: .status(.bad)
    }
  }

  private func pill(_ title: String, primary: Bool = false, disabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title).font(WaiFont.sans(13)).lineLimit(1).fixedSize()
        .padding(.horizontal, 14).padding(.vertical, 6)
        .foregroundStyle(primary ? Theme.paper : Theme.ink)
        .background(Capsule().fill(primary ? Theme.ink : Theme.card))
        .overlay { if !primary { Capsule().strokeBorder(Theme.line, lineWidth: 1) } }
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .disabled(disabled).opacity(disabled ? 0.5 : 1)
  }
}
