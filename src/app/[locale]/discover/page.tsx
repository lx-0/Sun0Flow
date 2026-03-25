import type { Metadata } from "next";
import { DiscoverView } from "./DiscoverView";

export const metadata: Metadata = {
  title: "Discover Songs — SunoFlow",
  description:
    "Explore and listen to publicly shared AI-generated songs on SunoFlow.",
  openGraph: {
    title: "Discover Songs — SunoFlow",
    description:
      "Explore and listen to publicly shared AI-generated songs on SunoFlow.",
    type: "website",
  },
};

export default function DiscoverPage() {
  return <DiscoverView />;
}
