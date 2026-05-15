"use client";

import { getIsVisible, subscribeVisibility } from "./visibility";

export type EventsHandler = (data: Record<string, unknown>) => void;

interface Sub {
  type: string;
  handler: EventsHandler;
}

const ENDPOINT = "/api/events";
const MAX_BACKOFF_MS = 30_000;

const subs = new Set<Sub>();
const boundTypes = new Set<string>();
let connection: EventSource | null = null;
let backoff = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof EventSource !== "undefined";
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function bindType(es: EventSource, type: string) {
  if (boundTypes.has(type)) return;
  boundTypes.add(type);
  es.addEventListener(type, (e: MessageEvent) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    for (const sub of subs) {
      if (sub.type === type) sub.handler(data);
    }
  });
}

function closeConnection() {
  clearReconnect();
  if (connection) {
    connection.close();
    connection = null;
  }
  boundTypes.clear();
}

function scheduleReconnect() {
  if (reconnectTimer || !getIsVisible() || subs.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    ensureConnection();
  }, backoff);
}

function ensureConnection() {
  if (!hasWindow()) return;
  if (!getIsVisible() || subs.size === 0 || connection) return;

  const es = new EventSource(ENDPOINT);
  connection = es;

  es.onopen = () => {
    backoff = 1000;
  };

  es.onerror = () => {
    if (connection === es) {
      es.close();
      connection = null;
      boundTypes.clear();
    }
    scheduleReconnect();
  };

  const seen = new Set<string>();
  for (const sub of subs) seen.add(sub.type);
  for (const type of seen) bindType(es, type);
}

function bindVisibility() {
  if (visibilityBound || !hasWindow()) return;
  visibilityBound = true;
  subscribeVisibility((visible) => {
    if (!visible) {
      closeConnection();
    } else {
      ensureConnection();
    }
  });
}

export function subscribe(type: string, handler: EventsHandler): () => void {
  const sub: Sub = { type, handler };
  subs.add(sub);
  bindVisibility();
  ensureConnection();
  if (connection) bindType(connection, type);
  return () => {
    subs.delete(sub);
    if (subs.size === 0) closeConnection();
  };
}

export function isStreamConnected(): boolean {
  return connection !== null && connection.readyState === 1;
}

/** Test-only reset. */
export function __resetEventsStreamForTests(): void {
  subs.clear();
  closeConnection();
  backoff = 1000;
}
