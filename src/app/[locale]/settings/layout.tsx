import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your SunoFlow account preferences, API keys, and notification settings.",
  robots: { index: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
