import { ShellSkeleton } from "@/components/ShellSkeleton";
import { GenerateFormSkeleton } from "@/components/Skeleton";

export default function GenerateLoading() {
  return (
    <ShellSkeleton>
      <GenerateFormSkeleton />
    </ShellSkeleton>
  );
}
