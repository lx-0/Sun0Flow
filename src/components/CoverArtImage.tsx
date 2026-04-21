"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";

const inflightRefreshes = new Map<string, Promise<string | null>>();

async function refreshCoverUrl(songId: string): Promise<string | null> {
  const existing = inflightRefreshes.get(songId);
  if (existing) return existing;

  const p = fetch(`/api/songs/${songId}/refresh`, { method: "POST" })
    .then((res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .then((data) => (data?.song?.imageUrl as string) ?? null)
    .catch(() => null)
    .finally(() => {
      inflightRefreshes.delete(songId);
    });

  inflightRefreshes.set(songId, p);
  return p;
}

interface CoverArtImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  fallbackSrc?: string;
  songId?: string;
}

export function CoverArtImage({
  src,
  alt,
  fill = false,
  sizes,
  width,
  height,
  className = "",
  priority = false,
  loading,
  fallbackSrc,
  songId,
}: CoverArtImageProps) {
  const [errored, setErrored] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [refreshedSrc, setRefreshedSrc] = useState<string | null>(null);
  const didRefresh = useRef(false);

  const activeSrc = refreshedSrc ?? (useFallback && fallbackSrc ? fallbackSrc : src);

  const handleError = useCallback(() => {
    if (refreshedSrc) {
      setErrored(true);
      return;
    }

    if (songId && !didRefresh.current && !activeSrc.startsWith("data:")) {
      didRefresh.current = true;
      refreshCoverUrl(songId).then((newUrl) => {
        if (newUrl && newUrl !== src) {
          setRefreshedSrc(newUrl);
        } else if (fallbackSrc && !useFallback) {
          setUseFallback(true);
        } else {
          setErrored(true);
        }
      });
      return;
    }

    if (!useFallback && fallbackSrc) {
      setUseFallback(true);
    } else {
      setErrored(true);
    }
  }, [songId, src, fallbackSrc, useFallback, activeSrc, refreshedSrc]);

  if (errored) return null;

  if (activeSrc.startsWith("data:")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={activeSrc}
        alt={alt}
        width={width}
        height={height}
        className={fill ? `absolute inset-0 w-full h-full ${className}` : className}
        loading={priority ? "eager" : (loading ?? "lazy")}
        style={fill ? { objectFit: "cover" } : undefined}
        onError={handleError}
      />
    );
  }

  return (
    <Image
      src={activeSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      width={!fill ? width : undefined}
      height={!fill ? height : undefined}
      className={className}
      priority={priority}
      loading={loading}
      onError={handleError}
    />
  );
}
