import { ShellSkeleton } from "@/components/ShellSkeleton";
import { ProfileSkeleton } from "@/components/Skeleton";

export default function ProfileLoading() {
  return (
    <ShellSkeleton>
      <ProfileSkeleton />
    </ShellSkeleton>
  );
}
