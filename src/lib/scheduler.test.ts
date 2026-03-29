import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Reset global scheduler state between tests
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).__scheduler;
});

afterEach(() => {
  vi.clearAllMocks();
});

// node-cron schedule() is heavy; mock it so tests run without timers
vi.mock("node-cron", () => {
  let _cb: (() => Promise<void> | void) | null = null;
  const task = {
    stop: vi.fn().mockResolvedValue(undefined),
    getNextRun: vi.fn().mockReturnValue(new Date("2030-01-01T00:00:00Z")),
    // Helper exposed on the mock so tests can fire a job manually
    _trigger: async () => { if (_cb) await _cb(); },
  };
  return {
    schedule: vi.fn((_expr: string, cb: () => Promise<void> | void) => {
      _cb = cb;
      return task;
    }),
    __esModule: true,
  };
});

import { registerJob, startScheduler, stopScheduler, getSchedulerStatus } from "@/lib/scheduler";
import { schedule } from "node-cron";

describe("registerJob", () => {
  it("adds a job to the registry", async () => {
    const handler = vi.fn();
    registerJob("test-job", "0 * * * *", handler);

    const statuses = getSchedulerStatus();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].name).toBe("test-job");
    expect(statuses[0].schedule).toBe("0 * * * *");
    expect(statuses[0].running).toBe(false);
    expect(statuses[0].lastRun).toBeUndefined();
  });

  it("ignores duplicate registration", () => {
    const handler = vi.fn();
    registerJob("dup-job", "0 * * * *", handler);
    registerJob("dup-job", "0 * * * *", handler);

    expect(getSchedulerStatus()).toHaveLength(1);
  });
});

describe("startScheduler", () => {
  it("schedules all registered jobs via node-cron", async () => {
    registerJob("job-a", "0 1 * * *", vi.fn());
    registerJob("job-b", "0 2 * * *", vi.fn());

    await startScheduler();

    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — calling start twice only schedules once", async () => {
    registerJob("idem-job", "0 1 * * *", vi.fn());
    await startScheduler();
    await startScheduler();

    expect(schedule).toHaveBeenCalledTimes(1);
  });
});

describe("job execution", () => {
  it("records successful run in lastRun", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerJob("success-job", "0 * * * *", handler);
    await startScheduler();

    // Trigger via the mock helper
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockTask = (schedule as any).mock.results[0].value;
    await mockTask._trigger();

    const [status] = getSchedulerStatus();
    expect(status.lastRun).toBeDefined();
    expect(status.lastRun!.success).toBe(true);
    expect(status.lastRun!.durationMs).toBeGreaterThanOrEqual(0);
    expect(status.lastRun!.error).toBeUndefined();
  });

  it("records failed run without rethrowing", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    registerJob("fail-job", "0 * * * *", handler);
    await startScheduler();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockTask = (schedule as any).mock.results[0].value;
    // Should NOT throw even though handler throws
    await expect(mockTask._trigger()).resolves.toBeUndefined();

    const [status] = getSchedulerStatus();
    expect(status.lastRun!.success).toBe(false);
    expect(status.lastRun!.error).toBe("boom");
  });
});

describe("getSchedulerStatus", () => {
  it("includes nextRun after start", async () => {
    registerJob("next-run-job", "0 * * * *", vi.fn());
    await startScheduler();

    const [status] = getSchedulerStatus();
    expect(status.nextRun).toBe("2030-01-01T00:00:00.000Z");
  });
});

describe("stopScheduler", () => {
  it("stops all tasks and resets started flag", async () => {
    registerJob("stop-job", "0 * * * *", vi.fn());
    await startScheduler();
    await stopScheduler(100);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockTask = (schedule as any).mock.results[0].value;
    expect(mockTask.stop).toHaveBeenCalled();
  });
});
