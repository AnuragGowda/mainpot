import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReleaseRun } from "../lib/release-gate";

// Node's native TypeScript runner needs the explicit extension at runtime.
const { assertReleaseReady } = await import(new URL("../lib/release-gate.ts", import.meta.url).href) as typeof import("../lib/release-gate");

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const command = (bin: string, args: string[]) => execFileSync(bin, args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
let releaseDirectory: string | undefined;

try {
  if (process.argv.slice(2).some(argument => argument !== "--check")) throw new Error("Supported option: --check");
  const branch = command("git", ["branch", "--show-current"]);
  const dirty = Boolean(command("git", ["status", "--porcelain"]));
  if (branch !== "main" || dirty) throw new Error("Production releases require a clean main checkout.");
  command("git", ["fetch", "origin", "main"]);
  const head = command("git", ["rev-parse", "HEAD"]);
  const remoteHead = command("git", ["rev-parse", "origin/main"]);
  if (head !== remoteHead) throw new Error("Local HEAD must match origin/main exactly.");
  const runs = JSON.parse(command("gh", ["run", "list", "--workflow", "CI", "--commit", head, "--event", "push", "--limit", "1", "--json", "databaseId"])) as Array<{ databaseId: number }>;
  if (!runs[0]) throw new Error("No push CI run exists for this commit.");
  const run = JSON.parse(command("gh", ["run", "view", String(runs[0].databaseId), "--json", "headSha,status,conclusion,jobs"])) as ReleaseRun;
  assertReleaseReady({ branch, dirty, head, remoteHead, run });
  console.log(`Release checks passed for ${head}. CI run ${runs[0].databaseId}.`);
  if (!process.argv.includes("--check")) {
    const projectLink = join(repositoryRoot, ".vercel", "project.json");
    const project = JSON.parse(readFileSync(projectLink, "utf8")) as { projectId?: string; orgId?: string };
    if (!project.projectId || !project.orgId) throw new Error("Link this checkout to its Vercel project before releasing.");
    // Upload only the exact Git commit that passed CI; exclude ignored builds,
    // local env files, and other working-directory artifacts.
    releaseDirectory = mkdtempSync(join(tmpdir(), "mainpot-release-"));
    const archive = join(releaseDirectory, "source.tar");
    command("git", ["archive", "--format=tar", "--output", archive, head]);
    command("tar", ["-xf", archive, "-C", releaseDirectory]);
    rmSync(archive);
    mkdirSync(join(releaseDirectory, ".vercel"));
    copyFileSync(projectLink, join(releaseDirectory, ".vercel", "project.json"));
    execFileSync("npx", ["--yes", "vercel@60.1.3", "deploy", "--prod", "--yes", "--cwd", releaseDirectory,
      "--meta", `githubCommitSha=${head}`, "--meta", "githubCommitRef=main",
      "--build-env", `NEXT_PUBLIC_APP_VERSION=${head.slice(0, 7)}`], { cwd: repositoryRoot, stdio: "inherit" });
    console.log("Deployment completed. Verify the affected production journey before declaring the release healthy.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production release failed.");
  process.exitCode = 1;
} finally {
  if (releaseDirectory) rmSync(releaseDirectory, { recursive: true, force: true });
}
