import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { GenerateTabs } from "@/components/GenerateTabs";
import { GenerateFormSkeleton } from "@/components/Skeleton";

export const metadata: Metadata = {
  title: "Create Music",
  description: "Generate AI-powered music with custom lyrics, style, and mood using SunoFlow.",
  robots: { index: false },
};

export default function GeneratePage() {
  return (
    <AppShell>
      <Suspense fallback={<GenerateFormSkeleton />}>
        <GenerateTabs />
      </Suspense>
    </AppShell>
  );
}
