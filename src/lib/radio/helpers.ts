export interface RadioSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  lyrics: string | null;
  tags: string | null;
}

export function curateResults(
  userSongs: RadioSong[],
  publicSongs: RadioSong[],
  limit: number,
): RadioSong[] {
  const seen = new Set<string>();
  const merged: RadioSong[] = [];
  for (const s of [...userSongs, ...publicSongs]) {
    if (!seen.has(s.id) && s.audioUrl) {
      seen.add(s.id);
      merged.push(s);
    }
  }

  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]];
  }

  return merged.slice(0, limit);
}
