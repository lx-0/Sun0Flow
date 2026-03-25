import { ShellSkeleton } from "@/components/ShellSkeleton";
import { PlaylistDetailSkeleton } from "@/components/Skeleton";

export default function PlaylistDetailLoading() {
  return (
    <ShellSkeleton>
      <PlaylistDetailSkeleton />
    </ShellSkeleton>
  );
}
