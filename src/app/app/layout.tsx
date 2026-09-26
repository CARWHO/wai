"use client";

import { FarmProvider, useFarm } from "@/lib/farm";
import { TabBar } from "@/components/ui";
import { LiveMapProvider } from "@/components/LiveMap";

function Shell({ children }: { children: React.ReactNode }) {
  const { alerts } = useFarm();
  return (
    <>
      <main className="mx-auto min-h-dvh max-w-md px-4 pb-28">{children}</main>
      <TabBar alerts={alerts.length} />
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FarmProvider>
      <LiveMapProvider>
        <Shell>{children}</Shell>
      </LiveMapProvider>
    </FarmProvider>
  );
}
