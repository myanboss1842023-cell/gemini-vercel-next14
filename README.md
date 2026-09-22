# Gemini API Playground — Next.js 14 / Vercel

A minimal Next.js 14 App Router + TypeScript app that calls Gemini only through secure server routes.

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

No `.env` file is required by the project. For local development, configure `GEMINI_API_KEY` in your shell environment if you want to test the API locally. Do not commit credentials.

## Vercel

1. Import this project into Vercel.
2. Go to **Project → Settings → Environment Variables**.
3. Add `GEMINI_API_KEY` for **Production**, **Preview**, and **Development**.
4. Redeploy the project.

The browser never receives the API key. Gemini calls are made only from `app/api/gemini/route.ts` and `app/api/health/route.ts`.

## Routes

- `POST /api/gemini` — prompt + selected model
- `GET /api/health` — server-side connectivity test
