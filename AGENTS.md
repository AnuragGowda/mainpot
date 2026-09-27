<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local container runtime

- Use a Docker-compatible runtime for the local Supabase stack. OrbStack is
  supported on macOS; contributors on other platforms may use an equivalent
  Docker-compatible runtime.
- Verify that the Docker-compatible CLI is connected to the intended runtime
  before starting containers.

## Production release safety

- Routine production releases must use `npm run release:production`. It requires
  a clean `main` checkout, the exact pushed commit, and every required CI job
  passing for that commit. Git pushes to `main` intentionally do not auto-deploy.
- Do not bypass the gate with direct Vercel production deployments or promotions
  for routine changes. Direct deployment is reserved for restoring a live outage
  explicitly requested in the current session; document any unrun checks.
- Realtime is optional acceleration. Subscription setup and cleanup must not
  crash the room or disable authoritative polling.
- When claiming a live incident is resolved, separate deployed code, browser
  verification, and recovery on the affected user's existing app. A fresh browser
  or mocked snapshot alone does not prove the affected device has recovered.
