"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [isLoading, setIsLoading] = useState(false);
  const didRefresh = useRef(false);
  const didTryCache = useRef(false);
  const prevSrcRef = useRef(src);
  const prevSongIdRef = useRef(songId);

  useEffect(() => {
    if (prevSrcRef.current !== src || prevSongIdRef.current !== songId) {
      prevSrcRef.current = src;
      prevSongIdRef.current = songId;
      setErrored(false);
      setUseFallback(false);
      setRefreshedSrc(null);
      setIsLoading(false);
      didRefresh.current = false;
      didTryCache.current = false;
    }
  }, [src, songId]);

  const activeSrc = refreshedSrc ?? (useFallback && fallbackSrc ? fallbackSrc : src);

  const handleError = useCallback(() => {
    if (refreshedSrc && !didTryCache.current && songId) {
      didTryCache.current = true;
      setRefreshedSrc(`/api/images/${songId}`);
      return;
    }

    if (refreshedSrc && didTryCache.current) {
      if (!useFallback && fallbackSrc) {
        setRefreshedSrc(null);
        setUseFallback(true);
      } else {
        setErrored(true);
      }
      return;
    }

    if (songId && !didRefresh.current && !activeSrc.startsWith("data:")) {
      didRefresh.current = true;
      setIsLoading(true);
      refreshCoverUrl(songId).then((newUrl) => {
        setIsLoading(false);
        if (newUrl && newUrl !== src) {
          setRefreshedSrc(newUrl);
        } else if (songId && !didTryCache.current) {
          didTryCache.current = true;
          setRefreshedSrc(`/api/images/${songId}`);
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

  if (errored) {
    if (fallbackSrc) {
      return (
        <Image
          src={fallbackSrc}
          alt={alt}
          fill={fill}
          sizes={sizes}
          width={!fill ? width : undefined}
          height={!fill ? height : undefined}
          className={className}
          priority={priority}
          loading={loading}
        />
      );
    }
    return null;
  }

  if (isLoading) {
    return (
      <div
        className={
          fill
            ? `absolute inset-0 w-full h-full animate-pulse bg-gray-700/50 ${className}`
            : `animate-pulse bg-gray-700/50 ${className}`
        }
        style={!fill && width && height ? { width, height } : undefined}
      />
    );
  }

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
