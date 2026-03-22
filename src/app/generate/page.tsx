import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { GenerateTabs } from "@/components/GenerateTabs";

export default function GeneratePage() {
  return (
    <AppShell>
      <Suspense>
        <GenerateTabs />
      </Suspense>
    </AppShell>
  );
}
