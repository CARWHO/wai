"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { statusColor, type Reading, type Status } from "@/lib/supabase";

export function Ring({ value, size = 160, stroke = 12, color, track = "#e3e1da", children }: {
  value: number; size?: number; stroke?: number; color: string; track?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, value)) / 100)}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

export function Dot({ s }: { s: Status }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor[s] }} />;
}

export function Spark({ data, k, color = "#141412", height = 64 }: {
  data: Reading[]; k: keyof Reading; color?: string; height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area type="monotone" dataKey={k as string} stroke={color} strokeWidth={1.5} fill="none" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Page header: big title, optional back chevron, right slot
export function Header({ title, back, right }: { title: React.ReactNode; back?: string; right?: React.ReactNode }) {
  return (
    <div className="flex min-h-[64px] items-center justify-between gap-3 pt-4">
      <div className="flex items-center gap-2">
        {back && (
          <Link href={back} aria-label="Back" className="-ml-2 grid h-9 w-9 place-items-center">
            <Icon name="back" />
          </Link>
        )}
        <h1 className={back ? "text-[20px] font-medium" : "text-[32px] font-medium tracking-tight"}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

// Round outlined icon button (Halter ⋯ / ×)
export function RoundButton({ icon, label, onClick, href }: { icon: string; label: string; onClick?: () => void; href?: string }) {
  const cls = "grid h-10 w-10 place-items-center rounded-full border border-line bg-white";
  return href ? (
    <Link href={href} aria-label={label} className={cls}><Icon name={icon} /></Link>
  ) : (
    <button onClick={onClick} aria-label={label} className={cls}><Icon name={icon} /></button>
  );
}

// White card with a hairline border on the paper background, as on the landing page
export function Card({ children, className = "", href }: { children: React.ReactNode; className?: string; href?: string }) {
  const cls = `block rounded-2xl border border-line bg-white p-4 ${className}`;
  return href ? <Link href={href} className={cls}>{children}</Link> : <div className={cls}>{children}</div>;
}

// Garmin section title: "In Focus", "At a Glance · See All"
export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-medium tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Small mono caption: units, eyebrows, table headers
export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-mono text-xs uppercase tracking-wider text-muted ${className}`}>{children}</div>;
}

// Label / value row with a hairline divider
export function Row({ k, sub, children, href, onClick }: { k: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[16px]">{k}</div>
        {sub && <div className="font-mono text-xs text-muted">{sub}</div>}
      </div>
      <div className="text-right font-mono text-[15px]">{children}</div>
      {(href || onClick) && <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted" />}
    </>
  );
  const cls = "flex w-full items-center gap-3 border-b border-line py-3 text-left";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

// Pill chips for picking one option. Active is the primary button, the rest are secondary.
export function Chips<T extends string>({ options, value, onChange }: { options: readonly { k: T; name: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.k} onClick={() => onChange(o.k)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] ${o.k === value ? "bg-ink text-paper" : "border border-line bg-white text-ink"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

// Bottom sheet: title, round close button, content
export function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[600] flex items-end bg-ink/40" onClick={onClose}>
      <div className="mx-auto w-full max-w-md rounded-t-2xl border-t border-line bg-paper px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[24px] font-medium leading-tight tracking-tight">{title}</div>
            {sub && <div className="text-[15px] text-muted">{sub}</div>}
          </div>
          <RoundButton icon="close" label="Close" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

// 1d / 7d / 4w segmented control
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { k: T; name: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="flex rounded-full border border-line bg-white p-1">
      {options.map((o) => (
        <button
          key={o.k} onClick={() => onChange(o.k)}
          className={`flex-1 rounded-full py-1.5 font-mono text-[13px] ${value === o.k ? "bg-ink text-paper" : "text-muted"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

// Tab strip with underline
export function Tabs<T extends string>({ options, value, onChange }: { options: readonly { k: T; name: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="flex gap-6 border-b border-line">
      {options.map((o) => (
        <button
          key={o.k} onClick={() => onChange(o.k)}
          className={`-mb-px border-b-2 pb-2.5 text-[16px] ${value === o.k ? "border-ink font-medium text-ink" : "border-transparent text-muted"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

const TABS = [
  { href: "/app", label: "Home", icon: "home" },
  { href: "/app/map", label: "Live", icon: "pin" },
  { href: "/app/alerts", label: "Alerts", icon: "bell" },
  { href: "/app/insights", label: "Insights", icon: "chart" },
] as const;

export function TabBar({ alerts }: { alerts: number }) {
  const path = usePathname();
  const active = (h: string) => (h === "/app" ? path === "/app" : path.startsWith(h));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[500] border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] print:hidden">
      <div className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <Link
            key={t.href} href={t.href}
            className={`relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 font-mono text-[10px] uppercase tracking-wider ${active(t.href) ? "text-ink" : "text-muted"}`}
          >
            <Icon name={t.icon} className="h-6 w-6" />
            {t.label}
            {t.icon === "bell" && alerts > 0 && (
              <span className="absolute left-1/2 top-1.5 ml-1 grid h-4 min-w-4 place-items-center rounded-full bg-alert px-1 text-[10px] text-paper">{alerts}</span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}

const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4.3 13a2 2 0 0 0 3.4 0",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  back: "M15 18l-6-6 6-6",
  chevron: "M9 18l6-6-6-6",
  close: "M6 6l12 12M18 6 6 18",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  locate: "M12 2v3m0 14v3M2 12h3m14 0h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3-5-5",
  check: "M5 12l5 5L20 7",
  doc: "M14 3H6v18h12V7zM14 3v4h4M9 13h6m-6 4h6",
  share: "M12 3v12M7 8l5-5 5 5M5 13v7h14v-7",
  download: "M12 3v12m-5-5 5 5 5-5M5 21h14",
};

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

// Small status pill, e.g. "Moved"
export function Badge({ children, color = statusColor.bad }: { children: React.ReactNode; color?: string }) {
  return <span className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-paper" style={{ background: color }}>{children}</span>;
}

// Row of day bars with counts, e.g. trough visits per day
export function Bars({ data, height = 64 }: { data: { k: string; label: string; n: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="flex items-end gap-1.5">
      {data.map((d, i) => (
        <div key={d.k} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-mono text-[11px] tabular-nums">{d.n}</span>
          <div className="flex w-full items-end" style={{ height }}>
            <div className={`w-full rounded-t ${i === data.length - 1 ? "bg-ink" : "bg-line"}`} style={{ height: `${Math.max(3, (d.n / max) * 100)}%` }} />
          </div>
          <span className="font-mono text-[10px] uppercase text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
