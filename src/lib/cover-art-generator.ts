/**
 * Cover art generator — produces mock SVG cover art variants for songs.
 *
 * In v1 this is a placeholder: it generates deterministic, visually distinct
 * SVG images based on the song metadata without calling an external AI API.
 * A future version can swap the implementation to call a real image generation
 * service while keeping the same interface.
 */

export type CoverArtStyle = "abstract" | "illustrated" | "photographic";

export interface CoverArtVariant {
  style: CoverArtStyle;
  label: string;
  prompt: string;
  dataUrl: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Deterministic hash from a string → 32-bit unsigned integer */
function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${h % 360},${s}%,${l}%)`;
}

function encodeSvg(svg: string): string {
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(svg).toString("base64")
    : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

// ---------------------------------------------------------------------------
// Style generators
// ---------------------------------------------------------------------------

function generateAbstract(seed: number, title: string): string {
  const h1 = seed % 360;
  const h2 = (seed * 137) % 360;
  const h3 = (seed * 251) % 360;
  const c1 = hsl(h1, 70, 40);
  const c2 = hsl(h2, 80, 55);
  const c3 = hsl(h3, 60, 70);

  const cx1 = 80 + (seed % 160);
  const cy1 = 80 + ((seed >> 4) % 160);
  const r1 = 100 + (seed % 80);

  const cx2 = 200 + (seed % 120);
  const cy2 = 200 + ((seed >> 8) % 120);
  const r2 = 80 + (seed % 60);

  const cx3 = 50 + ((seed >> 12) % 200);
  const cy3 = 250 + ((seed >> 6) % 100);

  const deg = seed % 45;
  const shortTitle = title.slice(0, 20);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1}"/>
      <stop offset="100%" style="stop-color:${c2}"/>
    </linearGradient>
    <radialGradient id="spot1" cx="50%" cy="50%">
      <stop offset="0%" style="stop-color:${c3};stop-opacity:0.75"/>
      <stop offset="100%" style="stop-color:${c3};stop-opacity:0"/>
    </radialGradient>
    <radialGradient id="spot2" cx="50%" cy="50%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.35"/>
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0"/>
    </radialGradient>
    <filter id="blur1"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <circle cx="${cx1}" cy="${cy1}" r="${r1}" fill="url(#spot1)" filter="url(#blur1)"/>
  <circle cx="${cx2}" cy="${cy2}" r="${r2}" fill="url(#spot2)" filter="url(#blur1)"/>
  <circle cx="${cx3}" cy="${cy3}" r="60" fill="${c2}" opacity="0.25" filter="url(#blur1)"/>
  <rect x="140" y="140" width="120" height="120" rx="24" fill="rgba(255,255,255,0.07)" transform="rotate(${deg} 200 200)"/>
  <rect x="160" y="160" width="80" height="80" rx="16" fill="rgba(255,255,255,0.05)" transform="rotate(${deg + 22} 200 200)"/>
  <text x="200" y="355" font-family="system-ui,sans-serif" font-size="14" fill="rgba(255,255,255,0.6)" text-anchor="middle" font-weight="600">${shortTitle}</text>
</svg>`;
}

function generateIllustrated(seed: number, title: string): string {
  const h1 = (seed * 13) % 360;
  const h2 = (h1 + 180) % 360;
  const bg1 = hsl(h1, 50, 20);
  const bg2 = hsl(h1, 60, 35);
  const accent = hsl(h2, 80, 65);
  const noteColor = hsl(h2, 70, 80);

  const amp = 20 + (seed % 25);
  const waveY = 200;
  const wavePoints = Array.from({ length: 9 }, (_, i) => {
    const x = i * 50;
    const y = waveY + Math.round(amp * Math.sin((i + (seed % 4)) * 0.8));
    return `${x},${y}`;
  }).join(" ");

  const shortTitle = title.slice(0, 20);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bg1}"/>
      <stop offset="100%" style="stop-color:${bg2}"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <!-- Sound wave -->
  <polyline points="${wavePoints}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="0.9"/>
  <polyline points="${wavePoints}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4" transform="translate(0,12)"/>
  <polyline points="${wavePoints}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4" transform="translate(0,-12)"/>
  <!-- Music note 1 -->
  <g transform="translate(80,130) scale(1.1)" filter="url(#glow)">
    <ellipse cx="0" cy="0" rx="12" ry="9" fill="${noteColor}" transform="rotate(-20)"/>
    <line x1="12" y1="-2" x2="12" y2="-42" stroke="${noteColor}" stroke-width="3"/>
    <line x1="12" y1="-42" x2="30" y2="-36" stroke="${noteColor}" stroke-width="3"/>
  </g>
  <!-- Music note 2 (eighth note) -->
  <g transform="translate(270,110) scale(0.9)" filter="url(#glow)">
    <ellipse cx="0" cy="0" rx="12" ry="9" fill="${noteColor}" opacity="0.85" transform="rotate(-20)"/>
    <line x1="12" y1="-2" x2="12" y2="-42" stroke="${noteColor}" stroke-width="3" opacity="0.85"/>
    <ellipse cx="30" cy="-12" rx="12" ry="9" fill="${noteColor}" opacity="0.85" transform="rotate(-20 30 -12)"/>
    <line x1="42" y1="-14" x2="42" y2="-54" stroke="${noteColor}" stroke-width="3" opacity="0.85"/>
    <line x1="12" y1="-42" x2="42" y2="-52" stroke="${noteColor}" stroke-width="3" opacity="0.85"/>
  </g>
  <!-- Decorative dots -->
  <circle cx="340" cy="290" r="4" fill="${accent}" opacity="0.5"/>
  <circle cx="355" cy="275" r="3" fill="${accent}" opacity="0.35"/>
  <circle cx="60" cy="310" r="5" fill="${accent}" opacity="0.45"/>
  <text x="200" y="355" font-family="system-ui,sans-serif" font-size="14" fill="rgba(255,255,255,0.65)" text-anchor="middle" font-weight="600">${shortTitle}</text>
</svg>`;
}

function generatePhotographic(seed: number, title: string): string {
  const h1 = (seed * 7) % 360;
  const h2 = (h1 + 60) % 360;
  const h3 = (h1 + 120) % 360;
  const c1 = hsl(h1, 75, 30);
  const c2 = hsl(h2, 80, 50);
  const c3 = hsl(h3, 70, 60);

  const cx = 100 + (seed % 200);
  const cy = 100 + ((seed >> 5) % 150);

  const shortTitle = title.slice(0, 22);
  const subtitle = title.length > 22 ? "…" : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <radialGradient id="main" cx="${cx / 400 * 100}%" cy="${cy / 400 * 100}%" r="70%">
      <stop offset="0%" style="stop-color:${c2}"/>
      <stop offset="50%" style="stop-color:${c1}"/>
      <stop offset="100%" style="stop-color:hsl(${(h1 + 200) % 360},60%,10%)"/>
    </radialGradient>
    <radialGradient id="shine" cx="30%" cy="25%" r="60%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.18"/>
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="60%" style="stop-color:rgba(0,0,0,0);stop-opacity:0"/>
      <stop offset="100%" style="stop-color:rgba(0,0,0,0.65)"/>
    </linearGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
      <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blend"/>
      <feComposite in="blend" in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>
  <rect width="400" height="400" fill="url(#main)"/>
  <!-- Noise texture overlay -->
  <rect width="400" height="400" fill="url(#main)" filter="url(#noise)" opacity="0.15"/>
  <!-- Highlight -->
  <rect width="400" height="400" fill="url(#shine)"/>
  <!-- Accent ring -->
  <circle cx="200" cy="180" r="110" fill="none" stroke="${c3}" stroke-width="1.5" opacity="0.3"/>
  <circle cx="200" cy="180" r="80" fill="none" stroke="${c3}" stroke-width="1" opacity="0.2"/>
  <!-- Center disc (vinyl-inspired) -->
  <circle cx="200" cy="180" r="50" fill="rgba(0,0,0,0.35)"/>
  <circle cx="200" cy="180" r="10" fill="${c3}" opacity="0.6"/>
  <!-- Bottom gradient for text -->
  <rect width="400" height="400" fill="url(#overlay)"/>
  <text x="200" y="358" font-family="system-ui,sans-serif" font-size="17" fill="rgba(255,255,255,0.92)" text-anchor="middle" font-weight="700">${shortTitle}${subtitle}</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  songId: string;
  title?: string | null;
  tags?: string | null;
}

/**
 * Generate 3 mock cover art variants for a song.
 * All generation is deterministic — same inputs always produce the same outputs.
 */
export function generateCoverArtVariants(opts: GenerateOptions): CoverArtVariant[] {
  const { songId, title = "Untitled", tags = "" } = opts;
  const displayTitle = title || "Untitled";
  const seed = djb2(songId);

  // Build a human-readable prompt for each variant (for display purposes)
  const genreHint = tags?.split(",")[0]?.trim() || "music";
  const titleHint = displayTitle.slice(0, 30);

  const variants: CoverArtVariant[] = [
    {
      style: "abstract",
      label: "Abstract",
      prompt: `Abstract geometric art for "${titleHint}", ${genreHint} vibes, bold gradients`,
      dataUrl: encodeSvg(generateAbstract(seed, displayTitle)),
    },
    {
      style: "illustrated",
      label: "Illustrated",
      prompt: `Illustrated music artwork for "${titleHint}", stylized sound waves and musical notes`,
      dataUrl: encodeSvg(generateIllustrated(djb2(songId + "illustrated"), displayTitle)),
    },
    {
      style: "photographic",
      label: "Photographic",
      prompt: `Cinematic cover art for "${titleHint}", ${genreHint}, rich tones, vinyl-inspired`,
      dataUrl: encodeSvg(generatePhotographic(djb2(songId + "photo"), displayTitle)),
    },
  ];

  return variants;
}
