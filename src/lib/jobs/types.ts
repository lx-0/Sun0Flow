export interface DigestRecipient {
  id: string;
  email: string | null;
  unsubscribeToken: string | null;
  _count: { songs: number };
}

export interface TrendingCandidate {
  id: string;
  title: string | null;
  tags: string | null;
  userId: string;
}

export interface UserHighlights {
  topSongs: Array<{ id: string; title: string | null; playCount: number }>;
  weekGenerations: number;
  totalPlaysReceived: number;
  newFollowers: number;
}