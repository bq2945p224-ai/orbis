# Orbis

Persistent multiplayer society simulation. Phases 1–13 are implemented as a playable server-authoritative skeleton (depth intentionally thin for feedback).

## Stack

- **Web** (Vercel): Next.js App Router — `apps/web`
- **API** (Fly.io): NestJS — `apps/api`
- **Worker** (Fly.io): BullMQ simulation ticks — `apps/worker`
- **DB**: PostgreSQL + PostGIS (Neon in prod, Docker locally)
- **Cache/queue**: Redis

## Quick start

```bash
cp .env.example .env
# Prefer Docker when available:
docker compose up -d
# Or local Homebrew: postgresql@17 (+ postgis) and redis

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- Web: http://localhost:3000 (proxies `/api` → API)
- API: http://localhost:4000

## What exists

Auth/character · map · money/skills/jobs/travel · property · companies · markets/loans · DMs/orgs · parties/elections/laws · health/disease · treaties/military · crime/courts/environment/NPCs · world-clock sim (payroll, travel, production, infection, tax, elections)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PHASES.md](docs/PHASES.md).
