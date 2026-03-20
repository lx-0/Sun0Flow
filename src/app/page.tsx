import { auth } from "@/lib/auth";
import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";

export default async function HomePage() {
  const session = await auth();

  return (
    <SessionProvider>
      <AppShell>
        <DashboardView userName={session?.user?.name} />
      </AppShell>
    </SessionProvider>
  );
}
