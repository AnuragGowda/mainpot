export interface AuditVulnerability {
  name: string;
  severity: string;
  nodes: string[];
  via: (string | { name: string; dependency: string; severity: string; url: string })[];
}

export const reviewedBracesAdvisory = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
export const bracesReviewExpires = "2026-10-17T00:00:00Z";

// A reviewed, unpatched lint-only dependency chain. Changed versions/placement,
// runtime dependencies, different advisories and critical severity fail closed.
const reviewedVersions: Record<string, string> = {
  braces: "3.0.3",
  micromatch: "4.0.8",
  "fast-glob": "3.3.1",
  "@next/eslint-plugin-next": "16.3.8",
  "eslint-config-next": "16.3.8",
};

export function evaluateDependencyAudit(
  vulnerabilities: Record<string, AuditVulnerability>,
  packages: Record<string, { version?: string; dev?: boolean }>,
  now: Date,
) {
  const reviewed: string[] = [];
  const blocked: string[] = [];
  const withinReview = Number.isFinite(now.getTime()) && now.getTime() < Date.parse(bracesReviewExpires);
  const isReviewed = (name: string, visiting: Set<string>): boolean => {
    if (!withinReview || visiting.has(name)) return false;
    const vulnerability = vulnerabilities[name];
    const node = `node_modules/${name}`;
    if (!Object.hasOwn(reviewedVersions, name) || !vulnerability
      || vulnerability.name !== name || vulnerability.severity !== "high"
      || vulnerability.nodes.length !== 1 || vulnerability.nodes[0] !== node
      || packages[node]?.dev !== true || packages[node]?.version !== reviewedVersions[name]
      || !vulnerability.via.length) return false;
    const next = new Set(visiting).add(name);
    return vulnerability.via.every(via => typeof via === "string"
      ? isReviewed(via, next)
      : name === "braces" && via.name === "braces" && via.dependency === "braces"
        && via.severity === "high" && via.url === reviewedBracesAdvisory);
  };
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (!["info", "low", "moderate", "high", "critical"].includes(vulnerability.severity)) throw new Error("Unknown audit severity");
    if (!["high", "critical"].includes(vulnerability.severity)) continue;
    (isReviewed(name, new Set()) ? reviewed : blocked).push(name);
  }
  return { reviewed, blocked };
}
