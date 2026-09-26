"use client";

import { Header } from "@/components/ui";
import { AlertList } from "@/components/AlertList";

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Header title="Alerts" />
      <div className="-mt-4"><AlertList /></div>
    </div>
  );
}
