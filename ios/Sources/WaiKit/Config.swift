import Foundation
import Supabase

// Both values are public by design: the publishable key ships in every app and access is limited by RLS.
public enum Config {
  public static let supabaseURL = URL(string: "https://anrgrgtgxfmzfbbfjodf.supabase.co")!
  public static let supabaseKey = "sb_publishable_SHQJ47S7FUEQSTO0HgUynw_SJxAjKZM"
  public static let aiBase = URL(string: "https://wai-olive.vercel.app")!
}

// The default PostgREST decoder only customises Date decoding, so `created_at` (String) and `raw`
// ([String: AnyJSON]) decode as the models declare them.
public let supabase = SupabaseClient(
  supabaseURL: Config.supabaseURL,
  supabaseKey: Config.supabaseKey,
  options: SupabaseClientOptions(auth: .init(emitLocalSessionAsInitialSession: true))
)
