import type { QueueSong } from "@/components/queue/playback-state";

export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildPlayQueue(
  songs: QueueSong[],
  startIndex: number,
  shuffle: boolean,
): { playOrder: QueueSong[]; playIndex: number } {
  if (songs.length === 0) {
    return { playOrder: [], playIndex: -1 };
  }
  const normalizedStartIndex = Math.min(Math.max(startIndex, 0), songs.length - 1);

  if (!shuffle) {
    return { playOrder: songs, playIndex: normalizedStartIndex };
  }

  const startSong = songs[normalizedStartIndex];
  const rest = songs.filter((_, i) => i !== normalizedStartIndex);
  return {
    playOrder: [startSong, ...fisherYatesShuffle(rest)],
    playIndex: 0,
  };
}

export function toggleShuffleQueue(
  queue: QueueSong[],
  currentIndex: number,
  nextShuffle: boolean,
  originalQueue: QueueSong[],
): { queue: QueueSong[]; currentIndex: number } {
  if (queue.length <= 1) {
    return { queue, currentIndex };
  }

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  if (nextShuffle) {
    const rest = queue.filter((_, i) => i !== currentIndex);
    const shuffled = currentSong
      ? [currentSong, ...fisherYatesShuffle(rest)]
      : fisherYatesShuffle(queue);
    return { queue: shuffled, currentIndex: currentSong ? 0 : currentIndex };
  }

  if (originalQueue.length > 0 && currentSong) {
    const originalIndex = originalQueue.findIndex((song) => song.id === currentSong.id);
    return {
      queue: originalQueue,
      currentIndex: originalIndex >= 0 ? originalIndex : 0,
    };
  }

  return { queue, currentIndex };
}

export function insertAfterCurrent(
  queue: QueueSong[],
  currentIndex: number,
  song: QueueSong,
): QueueSong[] {
  const next = [...queue];
  next.splice(currentIndex + 1, 0, song);
  return next;
}

export function removeFromQueueState(
  queue: QueueSong[],
  currentIndex: number,
  removeIndex: number,
): { queue: QueueSong[]; currentIndex: number; removedCurrent: boolean } {
  if (removeIndex < 0 || removeIndex >= queue.length) {
    return { queue, currentIndex, removedCurrent: false };
  }

  const nextQueue = [...queue];
  nextQueue.splice(removeIndex, 1);

  if (removeIndex < currentIndex) {
    return { queue: nextQueue, currentIndex: currentIndex - 1, removedCurrent: false };
  }

  if (removeIndex === currentIndex) {
    return { queue: nextQueue, currentIndex: -1, removedCurrent: true };
  }

  return { queue: nextQueue, currentIndex, removedCurrent: false };
}

export function reorderQueueState(
  queue: QueueSong[],
  currentIndex: number,
  fromIndex: number,
  toIndex: number,
): { queue: QueueSong[]; currentIndex: number } {
  if (
    fromIndex < 0 ||
    fromIndex >= queue.length ||
    toIndex < 0 ||
    toIndex >= queue.length
  ) {
    return { queue, currentIndex };
  }

  if (fromIndex === toIndex) {
    return { queue, currentIndex };
  }

  const nextQueue = [...queue];
  const [moved] = nextQueue.splice(fromIndex, 1);
  nextQueue.splice(toIndex, 0, moved);

  if (fromIndex === currentIndex) {
    return { queue: nextQueue, currentIndex: toIndex };
  }

  if (fromIndex < currentIndex && toIndex >= currentIndex) {
    return { queue: nextQueue, currentIndex: currentIndex - 1 };
  }

  if (fromIndex > currentIndex && toIndex <= currentIndex) {
    return { queue: nextQueue, currentIndex: currentIndex + 1 };
  }

  return { queue: nextQueue, currentIndex };
}
