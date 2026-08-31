# Mainpot — Hosted setup

The default contributor workflow is fully local and Docker-backed:

```sh
npm install
npm run dev
```

See `README.md` for the local service URLs, authentication behavior, and database
commands. Follow this guide only when connecting Mainpot to a hosted Supabase
project or deploying the application outside the local development stack.

## 1. Prerequisites

- **Node.js 22+** and **npm**. The included `.mise.toml` pins the runner to
  the current Node 22 release.
- A free [Supabase](https://supabase.com) account.

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**, pick an organization and a name, choose a region,
   and set a database password.
3. Once the project is created, open **Project Settings → API** (or the
   **Connect** panel) and note the **Project URL** and the **anon public**
   key — you'll need both in step 4.

## 3. Run the database schema

1. Open your project's **SQL Editor** (Dashboard → SQL Editor).
2. Open [`supabase/schema.sql`](supabase/schema.sql), copy the entire file,
   paste it into the SQL Editor, and click **Run**.
3. Run the additive files in [`supabase/migrations`](supabase/migrations) in
   filename order, starting with `20260830010000_product_roadmap.sql`. This
   adds invitations, settlement tracking, public-beta guardrails, retention,
   and the final row-level security policies. The `initial` migration mirrors
   `schema.sql` and does not need to be run twice.

## 4. Configure environment variables

1. Copy the example env file:

   ```sh
   cp .env.example .env.local
   ```

2. Edit `.env.local` and fill in:

   ```sh
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

   Replace the placeholders with the **Project URL** and **anon key** from
   step 2.

## 5. Configure authentication (optional)

Email/password and magic-link auth are configured in the Supabase dashboard.
Google OAuth also needs a public feature flag after its credentials are ready.

1. Open **Dashboard → Authentication → Providers**.
2. Open **Dashboard → Authentication → URL Configuration** and set:
   - **Site URL**: `https://mainpot.app`
   - **Redirect URLs**: `https://mainpot.app/auth/callback` and
     `http://localhost:3000/auth/callback`
3. **Email**: make sure the **Email** provider is enabled. This covers
   email/password sign-ups and (optionally) password resets.
4. **Google OAuth**:
   - Create OAuth credentials in the [Google Cloud
     Console](https://console.cloud.google.com) (Credentials → Create
     credentials → OAuth client ID, application type **Web application**).
   - Add the Supabase callback as an authorized redirect URI:
     `https://<project-ref>.supabase.co/auth/v1/callback`
     (replace `<project-ref>` with your project reference from Project
     Settings → General).
   - Paste the resulting **Client ID** and **Client secret** into
     Supabase's Google provider settings.
   - Set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` in `.env.local`. Mainpot keeps
     the Google button hidden until this flag is present, avoiding a dead
     sign-in path while the provider is unconfigured.
5. **Magic link**: enable the **Email OTP** provider. New users receive a
   one-time code / magic link they can use to sign in without a password.
6. If you are upgrading an existing installation, apply any new files in
   [`supabase/migrations`](supabase/migrations) that have not yet been run.
7. Set `NEXT_PUBLIC_SITE_URL=https://mainpot.app` in Vercel. Use
   `http://localhost:3000` in `.env.local` while developing locally.

### Apple sign-in

Do not expose an Apple button until the provider is fully configured and
tested. Apple sign-in requires an active Apple Developer membership, an App ID
with Sign in with Apple enabled, a website Services ID, and a signing key. The
Services ID return URL must be:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

After those credentials exist, enable the Apple provider in Supabase, test the
complete callback flow on `https://mainpot.app`, and only then add the button.
There is intentionally no inactive Apple button in the current UI.

When the Supabase env vars are missing entirely, the auth UI shows the
**"Connect Supabase to enable accounts"** fallback and the app keeps working
in single-device localStorage mode.

## 6. Install and run

```sh
npm install
npm run dev:app
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 7. How the app behaves without env vars

- **Without** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  the app runs in **single-device mode**, storing all data in the browser's
  `localStorage`. There is no cross-device realtime sync.
- **With** the env vars set, the app uses **Supabase realtime**: games,
  buy-ins, and cash-outs sync live across devices.
- The default `npm run dev` command starts the local Docker-backed Supabase
  stack and supplies its generated connection values automatically. Use
  `npm run dev:app` when relying on `.env.local` instead.

## 8. Optional: deploy to Vercel

1. Push the repo to GitHub and import it into [Vercel](https://vercel.com).
2. In the project's **Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://mainpot.app`
   - `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` only after Google is configured
3. Add `mainpot.app` in **Settings → Domains**, then use the DNS records Vercel
   provides. Keep the registrar nameservers unchanged unless you deliberately
   want Vercel to manage all DNS.
4. Deploy and verify `/manifest.webmanifest`, `/sw.js`, Google sign-in, email
   confirmation, and a game invite on the production domain.

## 9. PWA behavior

The production build registers a dependency-free service worker over HTTPS.
It provides install metadata and icons, caches versioned static assets, and
shows a small branded shell when a navigation happens offline. Live game
actions still require a network connection so the shared ledger cannot drift.

The service worker checks for an update hourly and whenever the browser comes
back online. A new worker takes control without forcing a mid-game page reload;
the newest app is used on the next navigation. Service-worker registration is
disabled in development to avoid stale local bundles.

## 10. Agent-runner deployment

The checked-in `deploy/ante.service` runs the production build on
`127.0.0.1:3100` as a persistent user service. After a new build:

```sh
mkdir -p ~/.config/systemd/user
cp deploy/ante.service ~/.config/systemd/user/ante.service
systemctl --user daemon-reload
systemctl --user enable --now ante.service
```

The runner exposes this private service to the tailnet on HTTPS port `8443`:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:3100
```
