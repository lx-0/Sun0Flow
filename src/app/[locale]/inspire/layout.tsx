import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inspire",
  description: "Discover daily AI music prompts and inspiration to spark your next creation.",
  robots: { index: false },
};

export default function InspireLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
