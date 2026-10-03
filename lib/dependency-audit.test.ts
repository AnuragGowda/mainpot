import { describe, expect, it } from "vitest";
import { evaluateDependencyAudit, reviewedBracesAdvisory, type AuditVulnerability } from "./dependency-audit";

function fixture() {
  const versions: Record<string, string> = { braces: "3.0.3", micromatch: "4.0.8", "fast-glob": "3.3.1", "@next/eslint-plugin-next": "16.3.8", "eslint-config-next": "16.3.8" };
  const chain = Object.keys(versions);
  const vulnerabilities: Record<string, AuditVulnerability> = {};
  const packages: Record<string, { version: string; dev: boolean }> = {};
  chain.forEach((name, index) => {
    vulnerabilities[name] = { name, severity: "high", nodes: [`node_modules/${name}`], via: index ? [chain[index - 1]] : [{ name: "braces", dependency: "braces", severity: "high", url: reviewedBracesAdvisory }] };
    packages[`node_modules/${name}`] = { version: versions[name], dev: true };
  });
  return { vulnerabilities, packages, now: new Date("2026-10-03T12:00:00Z") };
}
const run = (f: ReturnType<typeof fixture>) => evaluateDependencyAudit(f.vulnerabilities, f.packages, f.now);

describe("reviewed development dependency policy", () => {
  it("allows only the exact reviewed development chain and leaves the advisory visible", () => {
    const f = fixture();
    expect(run(f)).toEqual({ reviewed: Object.keys(f.vulnerabilities), blocked: [] });
  });
  it.each(["production", "missing dev flag", "changed version", "duplicate placement"])("blocks the chain when braces becomes %s", change => {
    const f = fixture();
    if (change === "production") f.packages["node_modules/braces"].dev = false;
    if (change === "missing dev flag") delete (f.packages["node_modules/braces"] as { dev?: boolean }).dev;
    if (change === "changed version") f.packages["node_modules/braces"].version = "3.0.2";
    if (change === "duplicate placement") f.vulnerabilities.braces.nodes.push("node_modules/other/node_modules/braces");
    expect(run(f).blocked).toEqual(Object.keys(f.vulnerabilities));
  });
  it.each(["2026-10-17T00:00:00Z", "2026-11-01T00:00:00Z", "invalid"])("expires closed at %s", now => {
    const f = fixture(); f.now = new Date(now);
    expect(run(f).blocked).toHaveLength(5);
  });
  it.each(["critical", "different advisory", "extra advisory"])("blocks a %s even in the reviewed package", change => {
    const f = fixture();
    const leaf = f.vulnerabilities.braces.via[0] as Exclude<AuditVulnerability["via"][number], string>;
    if (change === "critical") f.vulnerabilities.braces.severity = leaf.severity = "critical";
    if (change === "different advisory") leaf.url = "https://github.com/advisories/GHSA-unknown";
    if (change === "extra advisory") f.vulnerabilities.braces.via.push({ ...leaf, url: "https://github.com/advisories/GHSA-unknown" });
    expect(run(f).blocked).toHaveLength(5);
  });
  it("does not hide independent high findings", () => {
    const f = fixture();
    f.vulnerabilities.other = { ...f.vulnerabilities.braces, name: "other" };
    expect(run(f).blocked).toEqual(["other"]);
  });
  it.each(["cycle", "missing reference", "empty causes"])("fails closed on a %s", change => {
    const f = fixture();
    f.vulnerabilities.braces.via = change === "cycle" ? ["eslint-config-next"] : change === "missing reference" ? ["missing"] : [];
    expect(run(f).blocked).toHaveLength(5);
  });
  it("does not permit unknown severity values", () => {
    const f = fixture(); f.vulnerabilities.braces.severity = "unknown";
    expect(() => run(f)).toThrow("Unknown audit severity");
  });
});
