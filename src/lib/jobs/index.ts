import { registerJob } from "@/lib/scheduler";
import { JOB_DEFINITIONS } from "@/lib/jobs/job-definitions";
import { registerJobs } from "@/lib/jobs/job-runner";

export function registerAllJobs() {
  registerJobs(registerJob, JOB_DEFINITIONS);
}
