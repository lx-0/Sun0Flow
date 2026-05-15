import type { MutableRefObject } from "react";
import type {
  QueueSong as PlaybackQueueSong,
  RepeatMode as PersistedRepeatMode,
} from "@/components/queue/playback-state";

export type QueueSong = PlaybackQueueSong;
export type RepeatMode = PersistedRepeatMode;

export interface RadioParams {
  mood: string | null;
  genre: string | null;
  tempoMin?: number | null;
  tempoMax?: number | null;
  seedSongId?: string | null;
}

export interface QueueState {
  queue: QueueSong[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  playlistSource: string | null;
  radioState: RadioParams | null;
  isRadioLoading: boolean;
  shuffleVersions: boolean;
  activeVersion: QueueSong | null;
}

export interface QueueActions {
  playQueue: (songs: QueueSong[], startIndex?: number, source?: string) => void;
  togglePlay: (song?: QueueSong) => void;
  playNext: (song: QueueSong) => void;
  addToQueue: (song: QueueSong) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  seek: (fraction: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  clearQueue: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  getAudioElement: () => HTMLAudioElement | null;
  startRadio: (params: RadioParams) => Promise<void>;
  stopRadio: () => void;
  radioThumbsDown: (songId: string) => void;
  toggleShuffleVersions: () => void;
  eqSettingsRef: MutableRefObject<{ gains: number[]; speed: number; pitch: number }>;
  restoredEQ: { gains: number[]; speed: number; pitch: number } | null;
}

export type QueueContextValue = QueueState & QueueActions;
