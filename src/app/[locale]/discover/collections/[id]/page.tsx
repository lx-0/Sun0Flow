import { notFound } from "next/navigation";
import { Metadata } from "next";
import { CollectionDetailView } from "./CollectionDetailView";

interface CollectionSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  user: { id: string; name: string | null; username: string | null };
}

interface CollectionDetail {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  songCount: number;
  songs: CollectionSong[];
  createdAt: string;
}

async function fetchCollection(id: string): Promise<CollectionDetail | null> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const res = await fetch(`${baseUrl}/api/collections/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.collection ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const collection = await fetchCollection(id);
  if (!collection) return { title: "Collection Not Found" };
  return {
    title: `${collection.title} — SunoFlow`,
    description: collection.description ?? `${collection.songCount} curated songs on SunoFlow`,
    openGraph: {
      title: collection.title,
      description: collection.description ?? undefined,
      images: collection.coverImage ? [collection.coverImage] : [],
    },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const collection = await fetchCollection(id);
  if (!collection) notFound();
  return <CollectionDetailView collection={collection} />;
}
