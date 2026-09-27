import { describe, expect, it } from "vitest";
import { assertReleaseReady, REQUIRED_RELEASE_JOBS } from "./release-gate";

function ready() {
  return { branch: "main", dirty: false, head: "same-commit", remoteHead: "same-commit", run: {
    headSha: "same-commit", status: "completed", conclusion: "success",
    jobs: REQUIRED_RELEASE_JOBS.map(name => ({ name, status: "completed", conclusion: "success" })),
  } };
}

describe("production release gate", () => {
  it("accepts only the clean, pushed commit with all required checks green", () => {
    expect(() => assertReleaseReady(ready())).not.toThrow();
  });
  it.each([
    { branch: "feature" }, { dirty: true }, { remoteHead: "different-commit" },
  ])("rejects an unreviewed working tree or commit: %j", change => {
    expect(() => assertReleaseReady({ ...ready(), ...change })).toThrow();
  });
  it.each([
    { headSha: "old-commit" }, { status: "in_progress" }, { conclusion: "failure" },
  ])("rejects incomplete, failed, or stale CI: %j", change => {
    const state = ready();
    state.run = { ...state.run, ...change };
    expect(() => assertReleaseReady(state)).toThrow();
  });
  it.each(["skipped", "cancelled", "failure"])("rejects a %s required check even if the workflow reports success", conclusion => {
    const state = ready();
    state.run.jobs[0].conclusion = conclusion;
    expect(() => assertReleaseReady(state)).toThrow();
  });
  it("rejects a missing required check", () => {
    const state = ready();
    state.run.jobs.pop();
    expect(() => assertReleaseReady(state)).toThrow();
  });
});
