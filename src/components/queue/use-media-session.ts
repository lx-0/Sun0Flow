"use client";

import { useEffect } from "react";
import type { QueueSong } from "@/components/queue/queue-context-types";

interface UseMediaSessionParams {
  isPlaying: boolean;
  queue: QueueSong[];
  currentIndex: number;
  activeVersion: QueueSong | null;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  skipNextRef: React.MutableRefObject<() => void>;
  skipPrevRef: React.MutableRefObject<() => void>;
}

export function useMediaSession({
  isPlaying,
  queue,
  currentIndex,
  activeVersion,
  audioRef,
  skipNextRef,
  skipPrevRef,
}: UseMediaSessionParams) {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      skipNextRef.current();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      skipPrevRef.current();
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      const audio = audioRef.current;
      if (audio && details.seekTime != null) {
        audio.currentTime = details.seekTime;
      }
    });
  }, [audioRef, skipNextRef, skipPrevRef]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const song = currentIndex >= 0 ? queue[currentIndex] : null;
    const displaySong = activeVersion ?? song;
    if (!displaySong) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displaySong.title ?? "Untitled",
      artist: "SunoFlow",
      artwork: displaySong.imageUrl
        ? [{ src: displaySong.imageUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
  }, [queue, currentIndex, activeVersion]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);
}
