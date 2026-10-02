# Orbis

You control one person in a persistent multiplayer world — decisions about work, skills,
travel, land, companies, markets, health, and politics change real state. Phases 1–10 plus
consequential politics/economy wiring are playable; geopolitics/military remain read-only
bulletin data until player actions exist.

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

## What exists (consequential)

Auth/character · map · money/skills/jobs/travel · property · companies (payroll + inventory withdraw) · markets/loans (repayment) · parties/elections/laws (tax effects) · citizenship franchise · health/disease (can kill) · crime→court fines · world-clock sim

## Bulletin / not playable yet

Treaties · sanctions · military · wars · NPC flavor · pollution drift (no rule consumers)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PHASES.md](docs/PHASES.md).
