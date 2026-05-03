import { describe, it, expect } from "vitest";
import { calculateListeningTime } from "./listening-time";
import { buildPeakHoursHeatmap } from "./peak-hours";
import { calculateActivityStreaks } from "./streaks";
import { breakdownGenres } from "./genres";
import { buildCreditChart } from "./credits";

describe("calculateListeningTime", () => {
  it("aggregates total and daily listening from play history", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const playHistory = [
      { playedAt: new Date("2024-06-15T10:00:00Z"), song: { duration: 180 } },
      { playedAt: new Date("2024-06-15T11:00:00Z"), song: { duration: 240 } },
      { playedAt: new Date("2024-06-14T09:00:00Z"), song: { duration: 120 } },
    ];

    const result = calculateListeningTime(playHistory, now);

    expect(result.totalListeningTimeSec).toBe(540);
    expect(result.dailyListeningTime).toHaveLength(30);
    const today = result.dailyListeningTime.find((d) => d.date === "2024-06-15");
    expect(today?.seconds).toBe(420);
    expect(today?.minutes).toBe(7);
    const yesterday = result.dailyListeningTime.find((d) => d.date === "2024-06-14");
    expect(yesterday?.seconds).toBe(120);
  });

  it("handles null durations gracefully", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const playHistory = [
      { playedAt: new Date("2024-06-15T10:00:00Z"), song: { duration: null } },
    ];

    const result = calculateListeningTime(playHistory, now);
    expect(result.totalListeningTimeSec).toBe(0);
  });
});

describe("buildPeakHoursHeatmap", () => {
  it("returns all 24 hours with zero-fills", () => {
    const raw = [
      { hour: 10, count: BigInt(5) },
      { hour: 14, count: BigInt(12) },
    ];

    const result = buildPeakHoursHeatmap(raw);

    expect(result).toHaveLength(24);
    expect(result[10]).toEqual({ hour: 10, count: 5 });
    expect(result[14]).toEqual({ hour: 14, count: 12 });
    expect(result[0]).toEqual({ hour: 0, count: 0 });
  });
});

describe("calculateActivityStreaks", () => {
  it("calculates current streak from consecutive days", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const activeDays = [
      { day: "2024-06-15" },
      { day: "2024-06-14" },
      { day: "2024-06-13" },
      { day: "2024-06-10" },
    ];

    const result = calculateActivityStreaks(activeDays, now);
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
  });

  it("returns zero streak when no recent activity", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const activeDays = [{ day: "2024-06-10" }];

    const result = calculateActivityStreaks(activeDays, now);
    expect(result.currentStreak).toBe(0);
  });

  it("counts yesterday as current if today has no activity", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const activeDays = [
      { day: "2024-06-14" },
      { day: "2024-06-13" },
    ];

    const result = calculateActivityStreaks(activeDays, now);
    expect(result.currentStreak).toBe(2);
  });
});

describe("breakdownGenres", () => {
  it("counts genres from comma-separated tags", () => {
    const songs = [
      { tags: "Pop, Rock, Jazz" },
      { tags: "rock, electronic" },
      { tags: "pop" },
      { tags: null },
    ];

    const result = breakdownGenres(songs);

    expect(result[0]).toEqual({ genre: "pop", count: 2 });
    expect(result[1]).toEqual({ genre: "rock", count: 2 });
    expect(result).toHaveLength(4);
  });

  it("limits to top 10", () => {
    const songs = Array.from({ length: 20 }, (_, i) => ({
      tags: `genre${i}`,
    }));

    const result = breakdownGenres(songs);
    expect(result).toHaveLength(10);
  });
});

describe("buildCreditChart", () => {
  it("fills 30-day chart with gaps as zero", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const stats = [
      { date: "2024-06-15", credits: BigInt(10), count: BigInt(2) },
      { date: "2024-06-13", credits: BigInt(5), count: BigInt(1) },
    ];

    const result = buildCreditChart(stats, now);

    expect(result).toHaveLength(30);
    const today = result.find((d) => d.date === "2024-06-15");
    expect(today).toEqual({ date: "2024-06-15", credits: 10, count: 2 });
    const gap = result.find((d) => d.date === "2024-06-14");
    expect(gap).toEqual({ date: "2024-06-14", credits: 0, count: 0 });
  });
});
