"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueue } from "./QueueContext";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EQBand {
  label: string;
  freq: number;
  type: BiquadFilterType;
}

export const EQ_BANDS: EQBand[] = [
  { label: "Sub", freq: 60, type: "lowshelf" },
  { label: "Bass", freq: 200, type: "peaking" },
  { label: "Mid", freq: 1000, type: "peaking" },
  { label: "Hi-Mid", freq: 3500, type: "peaking" },
  { label: "Treble", freq: 10000, type: "highshelf" },
];

export type EQPreset = "flat" | "bass_boost" | "vocal" | "treble";

export const EQ_PRESETS: Record<EQPreset, number[]> = {
  flat: [0, 0, 0, 0, 0],
  bass_boost: [5, 4, 0, -1, 0],
  vocal: [-2, 0, 3, 4, 2],
  treble: [-2, -2, 0, 3, 6],
};

export const EQ_PRESET_LABELS: Record<EQPreset, string> = {
  flat: "Flat",
  bass_boost: "Bass Boost",
  vocal: "Vocal",
  treble: "Treble",
};

export interface EQSettings {
  gains: number[]; // one per EQ_BANDS entry
  speed: number; // 0.5 – 2.0
  pitch: number; // semitones, -6 to +6
}

const DEFAULT_SETTINGS: EQSettings = {
  gains: [0, 0, 0, 0, 0],
  speed: 1.0,
  pitch: 0,
};

interface AudioEQContextValue {
  settings: EQSettings;
  setGain: (bandIndex: number, gain: number) => void;
  applyPreset: (preset: EQPreset) => void;
  setSpeed: (speed: number) => void;
  setPitch: (pitch: number) => void;
  resetAll: () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const AudioEQContext = createContext<AudioEQContextValue | null>(null);

export function useAudioEQ(): AudioEQContextValue {
  const ctx = useContext(AudioEQContext);
  if (!ctx) throw new Error("useAudioEQ must be used within AudioEQProvider");
  return ctx;
}

// ── localStorage helpers ───────────────────────────────────────────────────────

const LS_KEY = "sunoflow-eq-v1";

function loadSettings(songId: string | null): EQSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const stored = JSON.parse(raw) as Record<string, EQSettings>;
    const key = songId ?? "default";
    const found = stored[key] ?? stored["default"];
    if (!found) return { ...DEFAULT_SETTINGS };
    return {
      gains: Array.isArray(found.gains) ? found.gains : DEFAULT_SETTINGS.gains,
      speed: typeof found.speed === "number" ? found.speed : DEFAULT_SETTINGS.speed,
      pitch: typeof found.pitch === "number" ? found.pitch : DEFAULT_SETTINGS.pitch,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(songId: string | null, settings: EQSettings): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const stored: Record<string, EQSettings> = raw ? JSON.parse(raw) : {};
    stored[songId ?? "default"] = settings;
    localStorage.setItem(LS_KEY, JSON.stringify(stored));
  } catch {
    // ignore storage errors
  }
}

// ── Audio element helpers ──────────────────────────────────────────────────────

type AudioWithPitch = HTMLAudioElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
};

function applyPlaybackRate(audio: HTMLAudioElement, speed: number, pitch: number): void {
  const el = audio as AudioWithPitch;
  if (pitch === 0) {
    el.preservesPitch = true;
    el.mozPreservesPitch = true;
    audio.playbackRate = speed;
  } else {
    el.preservesPitch = false;
    el.mozPreservesPitch = false;
    audio.playbackRate = speed * Math.pow(2, pitch / 12);
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function AudioEQProvider({ children }: { children: ReactNode }) {
  const { queue, currentIndex, getAudioElement, eqSettingsRef, restoredEQ } = useQueue();
  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
  const songId = currentSong?.id ?? null;

  const [settings, setSettingsState] = useState<EQSettings>(() =>
    loadSettings(null)
  );

  // Web Audio API refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const initializedRef = useRef(false);

  // ─── Initialize Web Audio API chain ─────────────────────────────────────────
  // Called lazily; safe to call multiple times (guards with initializedRef).

  const initWebAudio = useCallback(() => {
    if (initializedRef.current) return;
    const audio = getAudioElement();
    if (!audio) return;

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audio);

      // Build 5-band filter chain
      const filters = EQ_BANDS.map((band) => {
        const f = ctx.createBiquadFilter();
        f.type = band.type;
        f.frequency.value = band.freq;
        f.Q.value = 1.4;
        f.gain.value = 0;
        return f;
      });
      filtersRef.current = filters;

      // Connect: source → filter0 → … → filter4 → destination
      let node: AudioNode = source;
      for (const f of filters) {
        node.connect(f);
        node = f;
      }
      node.connect(ctx.destination);

      initializedRef.current = true;
    } catch (err) {
      console.warn("[AudioEQ] Web Audio init failed:", err);
    }
  }, [getAudioElement]);

  // Resume AudioContext on user gesture (browser policy)
  const ensureResumed = useCallback(() => {
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  // ─── Apply settings to nodes ─────────────────────────────────────────────────

  const applySettings = useCallback(
    (s: EQSettings) => {
      // EQ filters
      const filters = filtersRef.current;
      for (let i = 0; i < filters.length; i++) {
        if (filters[i]) filters[i].gain.value = s.gains[i] ?? 0;
      }
      // Speed + pitch via audio element
      const audio = getAudioElement();
      if (audio) applyPlaybackRate(audio, s.speed, s.pitch);
    },
    [getAudioElement]
  );

  // ─── Re-apply whenever settings change ───────────────────────────────────────

  useEffect(() => {
    applySettings(settings);
    saveSettings(songId, settings);
    eqSettingsRef.current = { gains: settings.gains, speed: settings.speed, pitch: settings.pitch };
  }, [settings, songId, applySettings, eqSettingsRef]);

  // ─── Load per-song settings when song changes ────────────────────────────────

  useEffect(() => {
    setSettingsState(loadSettings(songId));
  }, [songId]);

  // ─── Restore EQ from database when available ─────────────────────────────────

  const hasRestoredEQRef = useRef(false);
  useEffect(() => {
    if (!restoredEQ || hasRestoredEQRef.current) return;
    hasRestoredEQRef.current = true;
    const restored: EQSettings = {
      gains: restoredEQ.gains,
      speed: restoredEQ.speed,
      pitch: restoredEQ.pitch,
    };
    setSettingsState(restored);
    saveSettings(null, restored);
  }, [restoredEQ]);

  // ─── Expose initWebAudio for the panel to trigger on first open ──────────────
  // Speed/pitch work without the AudioContext; EQ needs it. We expose init so
  // EqualizerPanel can call it on mount (respects the browser user-gesture rule
  // as the user explicitly opened the panel).

  const setGain = useCallback((bandIndex: number, gain: number) => {
    initWebAudio();
    ensureResumed();
    setSettingsState((prev) => {
      const gains = [...prev.gains];
      gains[bandIndex] = gain;
      return { ...prev, gains };
    });
  }, [initWebAudio, ensureResumed]);

  const applyPreset = useCallback(
    (preset: EQPreset) => {
      initWebAudio();
      ensureResumed();
      setSettingsState((prev) => ({ ...prev, gains: [...EQ_PRESETS[preset]] }));
    },
    [initWebAudio, ensureResumed]
  );

  const setSpeed = useCallback((speed: number) => {
    setSettingsState((prev) => ({ ...prev, speed }));
  }, []);

  const setPitch = useCallback((pitch: number) => {
    setSettingsState((prev) => ({ ...prev, pitch }));
  }, []);

  const resetAll = useCallback(() => {
    setSettingsState({ ...DEFAULT_SETTINGS });
  }, []);

  return (
    <AudioEQContext.Provider
      value={{ settings, setGain, applyPreset, setSpeed, setPitch, resetAll }}
    >
      {children}
    </AudioEQContext.Provider>
  );
}
