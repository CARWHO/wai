"use client";

import { useFarm } from "./farm";
import { useAI } from "./ai";

// The AI's one suggestion for today, shared by Home and Insights (same cache key, one call)
export function useFarmTip() {
  const { loading, views, farmScore, subScores, alerts } = useFarm();
  const key = loading ? null : `${Math.round(farmScore / 10)}:${views.map((v) => v.status).join(",")}:${alerts.map((a) => a.id).join(",")}`;
  return useAI<{ title: string; body: string }>(
    "tip",
    {
      farmScore,
      subScores,
      probes: views.map((v) => ({
        name: v.probe.name,
        online: v.online,
        level_cm: v.latest?.level_cm,
        pct_full: v.latest?.pct_full != null ? Math.round(v.latest.pct_full) : null,
        empty_in_h: v.emptyIn != null ? Math.round(v.emptyIn) : null,
        soil_pct: v.latest?.soil_pct,
        alerts: alerts.filter((a) => a.probe.id === v.probe.id).map((a) => a.title),
      })),
    },
    key,
  );
}
