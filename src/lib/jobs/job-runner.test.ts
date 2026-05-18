import { describe, expect, it, vi } from "vitest";
import { registerJobs } from "@/lib/jobs/job-runner";
import type { JobDefinition } from "@/lib/jobs/types";

describe("registerJobs", () => {
  it("registers all jobs in order", () => {
    const registerJob = vi.fn();
    const jobs: JobDefinition[] = [
      { name: "job-a", cron: "0 * * * *", run: () => {} },
      { name: "job-b", cron: "30 * * * *", run: () => {} },
    ];

    registerJobs(registerJob, jobs);

    expect(registerJob).toHaveBeenCalledTimes(2);
    expect(registerJob).toHaveBeenNthCalledWith(
      1,
      "job-a",
      "0 * * * *",
      expect.any(Function)
    );
    expect(registerJob).toHaveBeenNthCalledWith(
      2,
      "job-b",
      "30 * * * *",
      expect.any(Function)
    );
  });

  it("throws when duplicate job names exist", () => {
    const registerJob = vi.fn();
    const jobs: JobDefinition[] = [
      { name: "job-a", cron: "0 * * * *", run: () => {} },
      { name: "job-a", cron: "30 * * * *", run: () => {} },
    ];

    expect(() => registerJobs(registerJob, jobs)).toThrow(
      "Duplicate job name detected: job-a"
    );
    expect(registerJob).not.toHaveBeenCalled();
  });
});
