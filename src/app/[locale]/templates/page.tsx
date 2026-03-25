import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { TemplateBrowser } from "@/components/TemplateBrowser";
import { SkeletonText } from "@/components/Skeleton";

export const metadata: Metadata = {
  title: "Templates",
  description: "Browse pre-built music generation templates to jumpstart your creativity.",
  robots: { index: false },
};

export default function TemplatesPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="px-4 py-6"><SkeletonText lines={8} /></div>}>
        <TemplateBrowser />
      </Suspense>
    </AppShell>
  );
}
