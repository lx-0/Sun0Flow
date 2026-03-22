import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { MashupStudio } from "@/components/MashupStudio";
import { SkeletonText } from "@/components/Skeleton";

export default function MashupPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="px-4 py-6"><SkeletonText lines={8} /></div>}>
        <MashupStudio />
      </Suspense>
    </AppShell>
  );
}
