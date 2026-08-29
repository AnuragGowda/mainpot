# Ante — Setup

Follow these steps to run Ante locally and connect it to Supabase.

## 1. Prerequisites

- **Node.js 18+** (Node 20 recommended) and **npm**.
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
   and paste it into the SQL Editor.
3. Click **Run**. This creates the `games`, `players`, `buy_ins`, and
   `cash_outs` tables, enables realtime, and opens public access.

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

## 5. Install and run

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 6. How the app behaves without env vars

- **Without** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  the app runs in **single-device mode**, storing all data in the browser's
  `localStorage`. There is no cross-device realtime sync.
- **With** the env vars set, the app uses **Supabase realtime**: games,
  buy-ins, and cash-outs sync live across devices.

## 7. Optional: deploy to Vercel

1. Push the repo to GitHub and import it into [Vercel](https://vercel.com).
2. In the project's **Settings → Environment Variables**, add the same
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values.
3. Deploy — the production build behaves like the local Supabase setup.