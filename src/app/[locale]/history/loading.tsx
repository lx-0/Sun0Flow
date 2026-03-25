import { ShellSkeleton } from "@/components/ShellSkeleton";
import { HistorySkeleton } from "@/components/Skeleton";

export default function HistoryLoading() {
  return (
    <ShellSkeleton>
      <HistorySkeleton />
    </ShellSkeleton>
  );
}
