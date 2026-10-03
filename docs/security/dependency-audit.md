# Dependency audit policy

Run `npm run audit:dependencies`. CI runs the same command. Production high/critical findings always block. The full dependency graph is also checked; every other high/critical finding blocks unless it matches the exact reviewed exception below. Network errors, malformed reports and inconsistent counts fail the gate.

## Temporary lint-only exception

Reviewed October 3, 2026; **expires October 17, 2026 at 00:00 UTC**.

[GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) describes stack exhaustion from deeply nested brace patterns. The advisory lists no patched release; npm currently publishes `braces` 3.0.3 as latest. This is an unresolved upstream vulnerability, not a patched dependency or a zero-findings full audit. One advisory propagates to five package entries in Mainpot's full audit.

The installed chain is entirely development-only:

`eslint-config-next@16.3.8 → @next/eslint-plugin-next@16.3.8 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`

Reachability review: Next's installed ESLint `get-root-dirs.js` calls fast-glob when `settings.next.rootDir` is configured; Mainpot's committed `eslint.config.ts` does not configure that setting. No application route passes user input into this chain. The independent `npm audit --omit=dev` reports zero findings at review time. npm's suggested ESLint/Next downgrade to 14.2.35 is not a compatible remediation for this Next 16 application.

The exception requires this exact advisory, high severity, all five reviewed versions, development-only lockfile flags and the reviewed top-level package placement. Production use, critical severity, another advisory on the same package, new package paths/versions, missing references, cycles and expiry are rejected. The raw full audit still reports this advisory; CI prints the reviewed exception and deadline rather than claiming the upstream issue is fixed. See [policy](../../lib/dependency-audit.ts), [runner](../../scripts/audit-dependencies.mts), and [negative-case tests](../../lib/dependency-audit.test.ts).

Before expiry, recheck the upstream advisory and npm releases. Adopt a compatible patched dependency or Next ESLint release, then remove the exception and its obsolete version constraints. Reassess reachability if lint configuration or dependency placement changes. Expiry is a review deadline, not an automatic renewal.
