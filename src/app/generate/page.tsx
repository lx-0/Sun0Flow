import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { GenerateForm } from "@/components/GenerateForm";

export default function GeneratePage() {
  return (
    <SessionProvider>
      <AppShell>
        <GenerateForm />
      </AppShell>
    </SessionProvider>
  );
}
