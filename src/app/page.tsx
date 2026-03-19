import { auth } from "@/lib/auth";
import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";

export default async function HomePage() {
  const session = await auth();

  return (
    <SessionProvider>
      <AppShell>
        <div className="px-4 py-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">
              Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
            </h2>
            <p className="text-gray-400 text-sm mt-1">Your Suno music hub</p>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Songs" value="—" />
            <StatCard label="Favorites" value="—" />
            <StatCard label="Playlists" value="—" />
            <StatCard label="This week" value="—" />
          </div>

          {/* Recent activity placeholder */}
          <div>
            <h3 className="text-base font-semibold text-gray-200 mb-3">Recent songs</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <p className="text-gray-500 text-sm">
                No songs yet. Connect your Suno account to get started.
              </p>
              <button className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors">
                Connect Suno
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    </SessionProvider>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-5">
      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
