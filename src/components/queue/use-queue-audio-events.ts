"use client";

import { useEffect, type MutableRefObject } from "react";
import type { QueueSong, RadioParams, RepeatMode } from "@/components/queue/queue-context-types";

type UseQueueAudioEventsParams = {
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  queueRef: MutableRefObject<QueueSong[]>;
  currentIndexRef: MutableRefObject<number>;
  repeatRef: MutableRefObject<RepeatMode>;
  radioStateRef: MutableRefObject<RadioParams | null>;
  radioRefillRef: MutableRefObject<(() => void) | null>;
  resolveAndPlayRef: MutableRefObject<((song: QueueSong, index: number) => Promise<void>) | null>;
  retryPlay: (audio: HTMLAudioElement, retriesLeft?: number, delay?: number) => void;
  scheduleSyncRef: MutableRefObject<((songId: string, position: number, queue: QueueSong[]) => void) | null>;
  cdnFallbackRef: MutableRefObject<Set<string>>;
  loadGenerationRef: MutableRefObject<number>;
  pendingCanPlayRef: MutableRefObject<(() => void) | null>;
  retryTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pendingPlayRef: MutableRefObject<boolean>;
  setIsPlaying: (value: boolean) => void;
  setIsBuffering: (value: boolean) => void;
  setCurrentTime: (value: number) => void;
  setDuration: (value: number) => void;
};

export function useQueueAudioEvents({
  audioRef,
  queueRef,
  currentIndexRef,
  repeatRef,
  radioStateRef,
  radioRefillRef,
  resolveAndPlayRef,
  retryPlay,
  scheduleSyncRef,
  cdnFallbackRef,
  loadGenerationRef,
  pendingCanPlayRef,
  retryTimerRef,
  pendingPlayRef,
  setIsPlaying,
  setIsBuffering,
  setCurrentTime,
  setDuration,
}: UseQueueAudioEventsParams) {
  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const onPlay = () => {
      setIsPlaying(true);
      pendingPlayRef.current = false;
      audio.autoplay = false;
    };
    const onPause = () => {
      if (audio.ended) return;

      setIsPlaying(false);
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const currentSong = idx >= 0 ? q[idx] : null;
      if (currentSong) {
        scheduleSyncRef.current?.(currentSong.id, audio.currentTime, q);
      }
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onCanPlay = () => setIsBuffering(false);
    const onError = () => {
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const currentSong = idx >= 0 ? q[idx] : null;

      if (currentSong && !cdnFallbackRef.current.has(currentSong.id)) {
        cdnFallbackRef.current.add(currentSong.id);
        const generation = loadGenerationRef.current;
        fetch(`/api/songs/${currentSong.id}/play`, { method: "POST" })
          .then((res) => (res.ok ? res.json() : Promise.reject()))
          .then((data) => {
            if (loadGenerationRef.current !== generation) return;
            if (!data?.audioUrl) {
              setIsBuffering(false);
              setIsPlaying(false);
              return;
            }
            audio.src = data.audioUrl;
            audio.play().catch(() => {
              setIsBuffering(false);
              setIsPlaying(false);
            });
          })
          .catch(() => {
            if (loadGenerationRef.current !== generation) return;
            setIsBuffering(false);
            setIsPlaying(false);
          });
        return;
      }

      setIsBuffering(false);
      setIsPlaying(false);
    };
    const onEnded = () => {
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const rep = repeatRef.current;

      if (rep === "repeat-one") {
        audio.currentTime = 0;
        retryPlay(audio);
        return;
      }

      if (idx < q.length - 1) {
        const next = idx + 1;
        resolveAndPlayRef.current?.(q[next], next);

        if (radioStateRef.current && q.length - next <= 3) {
          radioRefillRef.current?.();
        }
      } else if (radioStateRef.current) {
        radioRefillRef.current?.();
      } else if (rep === "repeat-all" && q.length > 0) {
        resolveAndPlayRef.current?.(q[0], 0);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (pendingCanPlayRef.current) {
        audio.removeEventListener("canplay", pendingCanPlayRef.current);
        pendingCanPlayRef.current = null;
      }
      audio.pause();
    };
  }, [
    audioRef,
    queueRef,
    currentIndexRef,
    repeatRef,
    radioStateRef,
    radioRefillRef,
    resolveAndPlayRef,
    retryPlay,
    scheduleSyncRef,
    cdnFallbackRef,
    loadGenerationRef,
    pendingCanPlayRef,
    retryTimerRef,
    pendingPlayRef,
    setIsPlaying,
    setIsBuffering,
    setCurrentTime,
    setDuration,
  ]);
}
