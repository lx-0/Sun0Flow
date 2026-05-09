import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { TemplatesPageContent } from "./TemplatesPageContent";

export const metadata: Metadata = {
  title: "Templates",
  description: "Browse and manage your prompt and style templates.",
  robots: { index: false },
};

export default function TemplatesPage() {
  return (
    <AppShell>
      <TemplatesPageContent />
    </AppShell>
  );
}
