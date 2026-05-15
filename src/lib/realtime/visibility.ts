"use client";

import { useEffect, useState } from "react";

type Listener = (visible: boolean) => void;

const listeners = new Set<Listener>();
let docListenerBound = false;

function hasDocument(): boolean {
  return typeof document !== "undefined";
}

function ensureDocListener() {
  if (docListenerBound || !hasDocument()) return;
  document.addEventListener("visibilitychange", () => {
    const v = getIsVisible();
    for (const l of listeners) l(v);
  });
  docListenerBound = true;
}

export function getIsVisible(): boolean {
  if (!hasDocument()) return true;
  return document.visibilityState === "visible";
}

export function subscribeVisibility(listener: Listener): () => void {
  ensureDocListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(() => getIsVisible());
  useEffect(() => subscribeVisibility(setVisible), []);
  return visible;
}

/** Test-only: drop all listeners. */
export function __resetVisibilityForTests(): void {
  listeners.clear();
}
