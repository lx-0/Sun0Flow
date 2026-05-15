"use client";

import { useEffect } from "react";

interface UsePlaybackRecoveryParams {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  pendingPlayRef: React.MutableRefObject<boolean>;
  hasUserGestureRef: React.MutableRefObject<boolean>;
}

export function usePlaybackRecovery({
  audioRef,
  pendingPlayRef,
  hasUserGestureRef,
}: UsePlaybackRecoveryParams) {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && pendingPlayRef.current && hasUserGestureRef.current) {
        const audio = audioRef.current;
        if (audio && audio.src && audio.paused) {
          audio.play()
            .then(() => { pendingPlayRef.current = false; })
            .catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [audioRef, pendingPlayRef, hasUserGestureRef]);

  useEffect(() => {
    const onGesture = () => {
      hasUserGestureRef.current = true;
      if (pendingPlayRef.current) {
        const audio = audioRef.current;
        if (audio && audio.src && audio.paused) {
          audio.play()
            .then(() => { pendingPlayRef.current = false; })
            .catch(() => {});
        }
      }
      document.removeEventListener("click", onGesture);
      document.removeEventListener("touchstart", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
    document.addEventListener("click", onGesture);
    document.addEventListener("touchstart", onGesture);
    document.addEventListener("keydown", onGesture);
    return () => {
      document.removeEventListener("click", onGesture);
      document.removeEventListener("touchstart", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
  }, [audioRef, pendingPlayRef, hasUserGestureRef]);
}
