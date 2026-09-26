"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FarmProvider, useFarm } from "@/lib/farm";
import { useSession } from "@/lib/auth";
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
  const session = useSession();
  const router = useRouter();
  const path = usePathname();
  // Signed-out visitors go to the login page, then come back here
  useEffect(() => {
    if (session === null) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [session, router, path]);
  if (!session) return <main className="min-h-dvh bg-paper" />;
  return (
    <FarmProvider>
      <LiveMapProvider>
        <Shell>{children}</Shell>
      </LiveMapProvider>
    </FarmProvider>
  );
}
