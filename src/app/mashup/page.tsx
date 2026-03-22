import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { MashupStudio } from "@/components/MashupStudio";

export default function MashupPage() {
  return (
    <AppShell>
      <Suspense>
        <MashupStudio />
      </Suspense>
    </AppShell>
  );
}
