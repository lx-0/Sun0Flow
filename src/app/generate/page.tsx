import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { GenerateTabs } from "@/components/GenerateTabs";
import { GenerateFormSkeleton } from "@/components/Skeleton";

export default function GeneratePage() {
  return (
    <AppShell>
      <Suspense fallback={<GenerateFormSkeleton />}>
        <GenerateTabs />
      </Suspense>
    </AppShell>
  );
}
