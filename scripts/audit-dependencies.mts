import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const { bracesReviewExpires, evaluateDependencyAudit, reviewedBracesAdvisory } = await import(
  new URL("../lib/dependency-audit.ts", import.meta.url).href
) as typeof import("../lib/dependency-audit");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
// Runtime vulnerabilities never receive a development-tool exception.
const production = spawnSync(npm, ["audit", "--omit=dev", "--audit-level=high"], { cwd: repositoryRoot, stdio: "inherit" });
if (production.error || production.status !== 0) throw new Error("Production dependency audit failed");
const full = spawnSync(npm, ["audit", "--json"], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (full.error || ![0, 1].includes(full.status ?? -1)) throw new Error("Full dependency audit could not run");
const report = JSON.parse(full.stdout);
if (report.error || !report.vulnerabilities || typeof report.vulnerabilities !== "object"
  || Array.isArray(report.vulnerabilities) || !report.metadata?.vulnerabilities) throw new Error("Invalid dependency audit response");
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const result = evaluateDependencyAudit(report.vulnerabilities, lock.packages, new Date());
const expected = report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical;
if (!Number.isInteger(expected) || expected !== result.reviewed.length + result.blocked.length) throw new Error("Inconsistent dependency audit response");
if (result.reviewed.length) console.log(`Reviewed lint-only advisory: ${reviewedBracesAdvisory}; affected packages: ${result.reviewed.join(", ")}; review expires ${bracesReviewExpires}. The upstream vulnerability remains unpatched.`);
if (result.blocked.length) throw new Error(`Unreviewed high/critical dependency findings: ${result.blocked.join(", ")}`);
console.log("Dependency policy passed: no production high/critical or unreviewed development high/critical findings.");
