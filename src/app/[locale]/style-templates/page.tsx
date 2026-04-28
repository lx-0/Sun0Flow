import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { StyleTemplateManager } from "@/components/StyleTemplateManager";
import { SkeletonText } from "@/components/Skeleton";

export const metadata: Metadata = {
  title: "Style Templates",
  description: "Manage your saved style templates for quick music generation.",
  robots: { index: false },
};

export default function StyleTemplatesPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="px-4 py-6"><SkeletonText lines={8} /></div>}>
        <StyleTemplateManager />
      </Suspense>
    </AppShell>
  );
}
