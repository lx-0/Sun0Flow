import dynamic from "next/dynamic";
import { AppShell } from "@/components/AppShell";
import { SkeletonText } from "@/components/Skeleton";

const MashupStudio = dynamic(
  () => import("@/components/MashupStudio").then((mod) => mod.MashupStudio),
  {
    loading: () => (
      <div className="px-4 py-6">
        <SkeletonText lines={8} />
      </div>
    ),
    ssr: false,
  }
);

export default function MashupPage() {
  return (
    <AppShell>
      <MashupStudio />
    </AppShell>
  );
}
