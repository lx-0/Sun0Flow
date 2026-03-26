"use client";

import Image from "next/image";

interface CoverArtImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
}

/**
 * Renders a song cover art image.
 *
 * Next.js `Image` does not support `data:` URIs; generated covers (SVG data
 * URIs) are rendered with a regular `<img>` element while CDN-hosted images
 * continue to use the optimized `Image` component.
 */
export function CoverArtImage({
  src,
  alt,
  fill = false,
  sizes,
  className = "",
  priority = false,
  loading,
}: CoverArtImageProps) {
  if (src.startsWith("data:")) {
    // Inline SVG data URI — use a regular img tag; fill behaviour requires
    // the parent to have position:relative and explicit dimensions.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={fill ? `absolute inset-0 w-full h-full ${className}` : className}
        loading={priority ? "eager" : (loading ?? "lazy")}
        style={fill ? { objectFit: "cover" } : undefined}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      priority={priority}
      loading={loading}
    />
  );
}
