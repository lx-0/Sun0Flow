"use client";

import { useState } from "react";
import Image from "next/image";

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
}

/**
 * Renders a song cover art image.
 *
 * Next.js `Image` does not support `data:` URIs; generated covers (SVG data
 * URIs) are rendered with a regular `<img>` element while CDN-hosted images
 * continue to use the optimized `Image` component.
 *
 * When a CDN image fails to load (expired URL, DNS error, etc.) the component
 * falls back to `fallbackSrc` (if provided) and then to a hidden state so the
 * parent can display its own placeholder.
 */
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
}: CoverArtImageProps) {
  const [errored, setErrored] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  const activeSrc = useFallback && fallbackSrc ? fallbackSrc : src;

  function handleError() {
    if (!useFallback && fallbackSrc) {
      setUseFallback(true);
    } else {
      setErrored(true);
    }
  }

  if (errored) return null;

  if (activeSrc.startsWith("data:")) {
    // Inline SVG data URI — use a regular img tag; fill behaviour requires
    // the parent to have position:relative and explicit dimensions.
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
