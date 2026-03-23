"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface QueueItem {
  id: string;
  prompt: string;
  title: string | null;
  tags: string | null;
  makeInstrumental: boolean;
  personaId: string | null;
  status: "pending" | "processing" | "done" | "failed" | "cancelled";
  position: number;
  songId: string | null;
  errorMessage: string | null;
}

export function useGenerationQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/generation-queue");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        const hasProcessing = data.items.some(
          (i: QueueItem) => i.status === "processing"
        );
        setIsProcessing(hasProcessing);
        processingRef.current = hasProcessing;
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const addToQueue = useCallback(
    async (params: {
      prompt: string;
      title?: string;
      tags?: string;
      makeInstrumental?: boolean;
      personaId?: string;
    }): Promise<{ item?: QueueItem; error?: string }> => {
      try {
        const res = await fetch("/api/generation-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok) return { error: data.error };
        setItems((prev) => [...prev, data.item]);
        return { item: data.item };
      } catch {
        return { error: "Failed to add to queue" };
      }
    },
    []
  );

  const removeFromQueue = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/generation-queue/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch {
      // Non-critical
    }
  }, []);

  const reorderQueue = useCallback(async (orderedIds: string[]) => {
    // Optimistic update
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      const reordered: QueueItem[] = [];
      for (const id of orderedIds) {
        const item = map.get(id);
        if (item) reordered.push({ ...item, position: reordered.length });
      }
      // Append any items not in orderedIds (e.g., processing)
      for (const item of prev) {
        if (!orderedIds.includes(item.id)) {
          reordered.push(item);
        }
      }
      return reordered;
    });

    try {
      await fetch("/api/generation-queue/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
    } catch {
      // Revert on error
      await fetchQueue();
    }
  }, [fetchQueue]);

  const processNext = useCallback(async (): Promise<{
    item?: QueueItem;
    song?: { id: string; title: string | null };
    error?: string;
  }> => {
    if (processingRef.current) return { error: "Already processing" };
    processingRef.current = true;
    setIsProcessing(true);

    try {
      const res = await fetch("/api/generation-queue/process-next", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        processingRef.current = false;
        setIsProcessing(false);
        return { error: data.error };
      }

      if (!data.item) {
        processingRef.current = false;
        setIsProcessing(false);
        return {};
      }

      // Update local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === data.item.id ? { ...i, ...data.item } : i
        )
      );

      return { item: data.item, song: data.song };
    } catch {
      processingRef.current = false;
      setIsProcessing(false);
      return { error: "Failed to process queue" };
    }
  }, []);

  const onGenerationComplete = useCallback(
    async (songId: string) => {
      // Update local item status
      setItems((prev) =>
        prev.map((i) =>
          i.songId === songId && i.status === "processing"
            ? { ...i, status: "done" as const }
            : i
        )
      );
      processingRef.current = false;
      setIsProcessing(false);

      // Auto-process next
      const pendingItems = items.filter((i) => i.status === "pending");
      if (pendingItems.length > 0) {
        return processNext();
      }
      return null;
    },
    [items, processNext]
  );

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const processingItem = items.find((i) => i.status === "processing");
  const totalActive = items.filter(
    (i) => i.status === "pending" || i.status === "processing"
  ).length;

  return {
    items,
    pendingCount,
    processingItem,
    totalActive,
    isProcessing,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    processNext,
    onGenerationComplete,
    fetchQueue,
  };
}
