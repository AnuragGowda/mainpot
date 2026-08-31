<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local container runtime

- On this Mac, use OrbStack as the container runtime. Never launch or use
  Docker Desktop.
- Docker-compatible CLI commands are acceptable only when the active Docker
  context points to OrbStack. Verify the context before starting containers.
- If OrbStack is unavailable or its context is not configured, stop and ask the
  user instead of falling back to Docker Desktop.
