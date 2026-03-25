import { ShellSkeleton } from "@/components/ShellSkeleton";
import { LibrarySkeleton } from "@/components/Skeleton";

export default function FavoritesLoading() {
  return (
    <ShellSkeleton>
      <LibrarySkeleton />
    </ShellSkeleton>
  );
}
