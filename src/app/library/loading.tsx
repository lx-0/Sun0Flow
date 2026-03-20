import { ShellSkeleton } from "@/components/ShellSkeleton";
import { LibrarySkeleton } from "@/components/Skeleton";

export default function LibraryLoading() {
  return (
    <ShellSkeleton>
      <LibrarySkeleton />
    </ShellSkeleton>
  );
}
