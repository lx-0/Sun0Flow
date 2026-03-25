import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { PlaylistInviteView } from "@/components/PlaylistInviteView";

export default function PlaylistInvitePage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex items-center justify-center p-12"><span className="text-gray-500">Loading invite…</span></div>}>
        <PlaylistInviteView token={params.token} />
      </Suspense>
    </AppShell>
  );
}
