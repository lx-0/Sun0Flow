import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { PersonaManager } from "@/components/PersonaManager";
import { SkeletonText } from "@/components/Skeleton";

export const metadata: Metadata = {
  title: "Personas",
  description: "Create and manage AI music personas to guide your generation style.",
  robots: { index: false },
};

export default function PersonasPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="px-4 py-6"><SkeletonText lines={8} /></div>}>
        <PersonaManager />
      </Suspense>
    </AppShell>
  );
}
