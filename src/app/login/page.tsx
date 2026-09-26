"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/auth";
import { Wordmark } from "@/components/Koru";
import { Label } from "@/components/ui";

export default function Login() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) router.replace(new URLSearchParams(location.search).get("next") || "/app");
  }, [session, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    setBusy(false);
  }

  const input = "w-full rounded-2xl border border-line bg-white px-4 py-3 text-[16px] outline-none focus:border-ink";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Wordmark />
      <p className="mt-3 text-muted">Know your soil and water without the walk.</p>
      <form onSubmit={submit} className="mt-10 flex flex-col gap-3">
        <Label>Email</Label>
        <input className={input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Label className="mt-2">Password</Label>
        <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-[14px] text-alert">{error}</p>}
        <button disabled={busy} className="mt-4 rounded-full bg-ink px-6 py-3 text-paper hover:bg-ink/85 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
