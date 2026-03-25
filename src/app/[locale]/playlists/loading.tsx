import { ShellSkeleton } from "@/components/ShellSkeleton";
import { PlaylistsSkeleton } from "@/components/Skeleton";

export default function PlaylistsLoading() {
  return (
    <ShellSkeleton>
      <PlaylistsSkeleton />
    </ShellSkeleton>
  );
}
