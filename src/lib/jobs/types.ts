export type JobDefinition = {
  name: string;
  cron: string;
  run: () => Promise<unknown> | void;
};

export type RegisterJobFn = (
  name: string,
  cron: string,
  run: () => Promise<unknown> | void
) => void;
