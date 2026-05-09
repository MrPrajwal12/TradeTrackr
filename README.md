# TradeTrackr

TradeTrackr is a **Personal Finance + Trading Performance Tracker** built with **Vite + React** and **Supabase**.  
It’s designed to feel **fast and smooth** while staying **secure by default** (RLS + safe auth).

## Features

- **Google sign-in** (OAuth)
- **Email OTP sign-in** (one-time code; avoids fake-email “logins”)
- **Email + password** sign-in
- **Trading journal** (daily P&L, cumulative P&L, running capital, loss guard)
- **Expenses & income tracking**
- **Broker connect** (manual + future API/CSV flows)
- **AI assistant** (floating support-style widget via Supabase Edge Function)

## Tech stack

- **Frontend**: Vite + React 19 + TypeScript
- **Routing**: React Router (SPA)
- **UI**: Tailwind CSS + shadcn/ui (Radix primitives)
- **State**: Zustand
- **Forms/Validation**: react-hook-form + Zod
- **Backend**: Supabase (Auth + Postgres + Row Level Security)
- **AI**: Supabase Edge Function (`ai`) → Groq (server-side key)

## Why it’s fast & smooth

- **Vite** gives fast local dev and optimized production builds
- **SPA navigation** (React Router) avoids full page reloads
- **Zustand** keeps global state lightweight (less re-render churn)
- **Supabase RLS** simplifies backend logic and reduces extra service layers
- **Mobile-first layouts** for table-heavy screens:
  - `Trading` and `Expenses` use card layouts on small screens

## Authentication approach (safe + modern)

Auth is powered by **Supabase Auth**:

- **Google OAuth** (recommended): identity verified by Google
- **Email OTP sign-in**: code is emailed; sign-in only works for existing accounts (`shouldCreateUser: false`)
- **Email + Password**: supported for users who prefer passwords

### Profile creation (no race conditions)

The app ensures there’s always a `profiles` row for each signed-in user using **upsert** on `profiles.id`.  
This prevents issues like `duplicate key value violates unique constraint "profiles_pkey"`.

## Database approach (secure by default)

Supabase Postgres is the source of truth.

### Tables

- `profiles`
- `trade_entries`
- `expenses`
- `brokers`
- `categories`
- `broker_sync_logs`
- `monthly_summaries`
- `ai_summaries`

### Security model

- **RLS enabled on all tables**
- Policies isolate data by user using `auth.uid()`
- The `authenticated` role has table privileges (GRANTs), and **RLS does the real protection**

### Schema/migrations

- `supabase/migrations/20260508051040_create_tradetrackr_schema.sql`

## AI approach (secure, no API key in browser)

AI runs through a **Supabase Edge Function** so the Groq key is never shipped to the client:

- Function: [supabase/functions/ai/index.ts](supabase/functions/ai/index.ts)
- Client helper: [src/lib/ai.ts](src/lib/ai.ts)
- UI widget: [src/components/ai/AiAssistantWidget.tsx](src/components/ai/AiAssistantWidget.tsx) (mounted globally in layout)

### Security

- Edge Function is deployed with **`verify_jwt: true`**
- Set Groq key as a **Supabase secret**:
  - `GROQ_API_KEY`

### CORS

The Edge Function supports `OPTIONS` preflight and sets CORS headers for browser requests.

## Local development

1) Install dependencies

```bash
npm install
```

2) Create `.env` (do **not** commit it)

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your_anon_key>
```

3) Run

```bash
npm run dev
```

## Deployment (Vercel recommended)

### SPA routing

This is a React Router SPA, so deep links like `/dashboard` must rewrite to `/`.
The repo includes `vercel.json` rewrites.

### Environment variables (Vercel/Netlify)

Set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Supabase production settings

In Supabase:

- **Auth → URL Configuration**
  - Add redirect URLs like `https://<your-domain>/dashboard`
- **Google provider**
  - Google Cloud Console redirect URI:
    - `https://<your-project-ref>.supabase.co/auth/v1/callback`

### Supabase Edge Function secret

In Supabase **Edge Functions → Secrets**:

- `GROQ_API_KEY`

