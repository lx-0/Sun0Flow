import type { JobDefinition, RegisterJobFn } from "@/lib/jobs/types";

function assertUniqueJobNames(jobs: JobDefinition[]): void {
  const seen = new Set<string>();

  for (const job of jobs) {
    if (seen.has(job.name)) {
      throw new Error(`Duplicate job name detected: ${job.name}`);
    }
    seen.add(job.name);
  }
}

export function registerJobs(
  registerJob: RegisterJobFn,
  jobs: JobDefinition[]
): void {
  assertUniqueJobNames(jobs);

  for (const { name, cron, run } of jobs) {
    registerJob(name, cron, run);
  }
}
