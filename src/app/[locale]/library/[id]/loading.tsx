import { ShellSkeleton } from "@/components/ShellSkeleton";
import { SongDetailSkeleton } from "@/components/Skeleton";

export default function SongDetailLoading() {
  return (
    <ShellSkeleton>
      <SongDetailSkeleton />
    </ShellSkeleton>
  );
}
