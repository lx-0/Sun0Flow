import { proxiedAudioUrl } from "@/lib/audio-cdn";

export type RepeatMode = "off" | "repeat-all" | "repeat-one";

export interface QueueSong {
  id: string;
  title: string | null;
  audioUrl: string;
  imageUrl: string | null;
  duration: number | null;
  lyrics?: string | null;
}

export interface EqSettings {
  gains: number[];
  speed: number;
  pitch: number;
}

interface PlaybackStateSavePayload {
  songId: string;
  position: number;
  queue: QueueSong[];
  volume: number;
  shuffleVersions: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  muted: boolean;
  eqSettings?: EqSettings;
}

interface PersistedSong {
  id: string;
  title: string | null;
  audioUrl: string;
  imageUrl: string | null;
  duration: number | null;
  lyrics?: string | null;
}

interface PersistedPlaybackState {
  song?: PersistedSong;
  position?: number;
  queue?: QueueSong[];
  volume?: number;
  shuffleVersions?: boolean;
  shuffle?: boolean;
  repeat?: string;
  muted?: boolean;
  eqGains?: number[];
  eqSpeed?: number;
  eqPitch?: number;
}

interface PlaybackStateResponse {
  state?: PersistedPlaybackState;
}

export interface RestoredPlaybackState {
  queue: QueueSong[];
  currentIndex: number;
  duration: number;
  initialSrc: string;
  position: number;
  volume: number;
  shuffleVersions: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  muted: boolean;
  eqSettings: EqSettings | null;
}

export function savePlaybackState(payload: PlaybackStateSavePayload): void {
  fetch("/api/user/playback-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      songId: payload.songId,
      position: payload.position,
      queue: payload.queue,
      volume: payload.volume,
      shuffleVersions: payload.shuffleVersions,
      shuffle: payload.shuffle,
      repeat: payload.repeat,
      muted: payload.muted,
      eqGains: payload.eqSettings?.gains,
      eqSpeed: payload.eqSettings?.speed,
      eqPitch: payload.eqSettings?.pitch,
    }),
  }).catch(() => {});
}

function normalizeQueue(state: PersistedPlaybackState): QueueSong[] {
  if (Array.isArray(state.queue) && state.queue.length > 0) {
    return state.queue;
  }

  if (!state.song?.audioUrl) {
    return [];
  }

  return [
    {
      id: state.song.id,
      title: state.song.title,
      audioUrl: state.song.audioUrl,
      imageUrl: state.song.imageUrl,
      duration: state.song.duration,
      lyrics: state.song.lyrics,
    },
  ];
}

function normalizeRepeat(value: string | undefined): RepeatMode {
  if (value === "repeat-all" || value === "repeat-one") {
    return value;
  }
  return "off";
}

function normalizeEqSettings(state: PersistedPlaybackState): EqSettings | null {
  if (!Array.isArray(state.eqGains) || state.eqGains.length !== 5) {
    return null;
  }

  return {
    gains: state.eqGains,
    speed: typeof state.eqSpeed === "number" ? state.eqSpeed : 1,
    pitch: typeof state.eqPitch === "number" ? state.eqPitch : 0,
  };
}

export async function loadPlaybackState(): Promise<RestoredPlaybackState | null> {
  const response = await fetch("/api/user/playback-state");
  const data = (await response.json()) as PlaybackStateResponse;
  const state = data.state;

  if (!state?.song?.id) {
    return null;
  }

  const queue = normalizeQueue(state);
  if (queue.length === 0) {
    return null;
  }

  const queueIndex = queue.findIndex((song) => song.id === state.song?.id);
  const currentIndex = queueIndex >= 0 ? queueIndex : 0;
  const currentSong = queue[currentIndex];

  return {
    queue,
    currentIndex,
    duration: currentSong.duration ?? 0,
    initialSrc: proxiedAudioUrl(currentSong.id),
    position: typeof state.position === "number" ? state.position : 0,
    volume: typeof state.volume === "number" ? state.volume : 1,
    shuffleVersions: state.shuffleVersions === true,
    shuffle: state.shuffle === true,
    repeat: normalizeRepeat(state.repeat),
    muted: state.muted === true,
    eqSettings: normalizeEqSettings(state),
  };
}
