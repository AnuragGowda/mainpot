export const REQUIRED_RELEASE_JOBS = [
  "Lint, unit tests, and browser smoke tests",
  "Realtime browser tests",
  "Database migrations and RLS assurance",
  "Mobile browser smoke tests",
  "Confirmed-email authentication and recovery",
];

export interface ReleaseRun {
  headSha: string;
  status: string;
  conclusion: string;
  jobs: Array<{ name: string; status: string; conclusion: string }>;
}

export function assertReleaseReady(state: {
  branch: string;
  dirty: boolean;
  head: string;
  remoteHead: string;
  run: ReleaseRun;
}): void {
  if (state.branch !== "main") throw new Error("Production releases require the main branch.");
  if (state.dirty) throw new Error("Commit or set aside all local changes before releasing.");
  if (state.head !== state.remoteHead) throw new Error("Local HEAD must match origin/main exactly.");
  if (state.run.headSha !== state.head) throw new Error("CI must cover the exact commit being released.");
  if (state.run.status !== "completed" || state.run.conclusion !== "success") {
    throw new Error("The latest CI run for this commit must complete successfully before production release.");
  }
  for (const name of REQUIRED_RELEASE_JOBS) {
    const job = state.run.jobs.find(job => job.name === name);
    if (!job || job.status !== "completed" || job.conclusion !== "success") {
      throw new Error(`Required release check did not pass: ${name}`);
    }
  }
  if (state.run.jobs.some(job => job.status !== "completed" || job.conclusion !== "success")) {
    throw new Error("Every job in the release CI run must pass.");
  }
}
