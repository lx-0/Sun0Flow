export const MOOD_TEMPLATES: Record<string, string[]> = {
  energetic: [
    "An energetic anthem capturing the thrill of {theme}. {texture}",
    "A high-energy track fueled by {theme}. {texture}",
  ],
  chill: [
    "A laid-back groove reflecting on {theme}. {texture}",
    "A mellow, drifting piece inspired by {theme}. {texture}",
  ],
  melancholic: [
    "A bittersweet ballad about {theme}. {texture}",
    "A hauntingly beautiful song dwelling on {theme}. {texture}",
  ],
  romantic: [
    "A tender love song woven around {theme}. {texture}",
    "An intimate, heartfelt piece about {theme}. {texture}",
  ],
  uplifting: [
    "An uplifting anthem celebrating {theme}. {texture}",
    "A soaring, hopeful track inspired by {theme}. {texture}",
  ],
  dark: [
    "A brooding, atmospheric piece exploring {theme}. {texture}",
    "A shadowy soundscape immersed in {theme}. {texture}",
  ],
  dreamy: [
    "An ethereal, floating track drifting through {theme}. {texture}",
    "A dreamlike piece painting visions of {theme}. {texture}",
  ],
  intense: [
    "An epic, powerful track channeling {theme}. {texture}",
    "A relentless, storming piece driven by {theme}. {texture}",
  ],
};

export const FALLBACK_TEMPLATES = [
  "A song inspired by {theme}. {texture}",
  "A track exploring the world of {theme}. {texture}",
];
