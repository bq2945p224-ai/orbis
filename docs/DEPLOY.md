# Free public deploy (no custom domain)

Stack (all free tiers):

| Piece | Where | Public URL |
|--------|--------|------------|
| Web (Next.js) | Vercel Hobby | `https://orbis-….vercel.app` |
| API + worker | Render free Docker | `https://orbis-api.onrender.com` |
| Postgres+PostGIS | Neon free | (private) |
| Redis | Upstash free | (private) |

> Render free services **sleep after ~15 minutes** of idle traffic. First request after sleep can take ~30–60s; the simulation pauses while asleep.

## 0. Fix GitHub auth (required)

```bash
gh auth refresh -h github.com
```

Then create/push the repo (or let the agent do it after auth works).

## 1. Neon (database)

1. https://console.neon.tech → create project (free)
2. Copy the connection string (`DATABASE_URL`)
3. In Neon SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

## 2. Upstash (Redis)

1. https://console.upstash.com → create Redis (free)
2. Copy the **Redis URL** (`rediss://…`) as `REDIS_URL`

## 3. Render (API + worker)

1. https://dashboard.render.com → New → Blueprint → connect this GitHub repo
2. It reads `render.yaml`
3. Set env vars when prompted:
   - `DATABASE_URL` = Neon URL
   - `REDIS_URL` = Upstash URL
   - `WEB_ORIGIN` = your Vercel URL (step 4) — you can temporarily use `*` then update
4. Deploy. Note the service URL, e.g. `https://orbis-api.onrender.com`

Health check: `GET https://orbis-api.onrender.com/api/health`

## 4. Vercel (web)

1. https://vercel.com/new → import the same GitHub repo
2. Framework: Next.js (root `vercel.json`)
3. Root directory: leave empty (repo root)
4. Environment variables (Production):
   - `API_ORIGIN` = `https://orbis-api.onrender.com` (no trailing slash)
5. Deploy → you get `https://orbis-….vercel.app`

## 5. Wire origins

On **Render**, set:

```text
WEB_ORIGIN=https://orbis-….vercel.app
COOKIE_SECURE=true
```

Redeploy Render once. Then open the Vercel URL — signup/login should work.

## Local vs prod

| Var | Local | Prod |
|-----|--------|------|
| `DATABASE_URL` | docker PostGIS | Neon |
| `REDIS_URL` | localhost | Upstash `rediss://` |
| `WEB_ORIGIN` | `http://localhost:3000` | Vercel URL |
| `API_ORIGIN` | `http://localhost:4000` | Render URL (web only) |
| `COOKIE_SECURE` | `false` | `true` |
