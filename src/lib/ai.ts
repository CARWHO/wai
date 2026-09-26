"use client";

import { useEffect, useState } from "react";

function readCache<T>(k: string): T | null {
  try {
    const hit = sessionStorage.getItem(k);
    return hit ? JSON.parse(hit) : null;
  } catch {
    return null;
  }
}

// Calls /api/ai once per cache key; results are kept for the browser session.
// cacheKey is null until the data is loaded, so server and first client render match.
export function useAI<T>(kind: "alert" | "tip" | "fertiliser", context: unknown, cacheKey: string | null) {
  const [res, setRes] = useState<{ k: string; d: T } | null>(null);
  const k = cacheKey && `wai-ai:${kind}:${cacheKey}`;
  const cached = k ? readCache<T>(k) : null;

  useEffect(() => {
    if (!k || cached) return;
    let live = true;
    fetch("/api/ai", { method: "POST", body: JSON.stringify({ kind, context }) })
      .then((r) => r.json())
      .then((d) => {
        try {
          sessionStorage.setItem(k, JSON.stringify(d));
        } catch {}
        if (live) setRes({ k, d });
      });
    return () => {
      live = false;
    };
    // context is described by cacheKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  return cached ?? (res?.k === k ? res.d : null);
}
