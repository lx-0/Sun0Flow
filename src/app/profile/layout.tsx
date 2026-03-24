import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "View and update your SunoFlow profile and account details.",
  robots: { index: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
