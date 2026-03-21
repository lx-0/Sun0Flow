import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { GenerateForm } from "@/components/GenerateForm";

export default function GeneratePage() {
  return (
    <AppShell>
      <Suspense>
        <GenerateForm />
      </Suspense>
    </AppShell>
  );
}
