import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";

export default function Page() {
  return (
    <SessionProvider>
      <AppShell>
        <div className="px-4 py-6">
          <p className="text-gray-500 text-sm">Coming soon.</p>
        </div>
      </AppShell>
    </SessionProvider>
  );
}
