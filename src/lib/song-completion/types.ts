export interface CompletionSong {
  audioUrl?: string;
  imageUrl?: string;
  duration?: number;
  lyrics?: string;
  title?: string;
  tags?: string;
  model?: string;
  id?: string;
}

export interface SongRecord {
  id: string;
  userId: string;
  prompt: string | null;
  tags: string | null;
  audioUrl: string | null;
  audioUrlExpiresAt: Date | null;
  imageUrl: string | null;
  imageUrlExpiresAt: Date | null;
  duration: number | null;
  lyrics: string | null;
  title: string | null;
  sunoModel: string | null;
  isInstrumental: boolean;
  pollCount: number;
}

export interface PersistedSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
}

export interface AlternateSong {
  id: string;
  parentSongId: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  audioSource: CompletionSong;
}
