import { auth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";

export default async function HomePage() {
  const session = await auth();

  return (
    <AppShell>
      <DashboardView userName={session?.user?.name} />
    </AppShell>
  );
}
