# Orbis Architecture

Working product name: **Orbis**. Website on Vercel; authoritative API, WebSockets, and simulation workers on Fly.io. Postgres + PostGIS is the source of truth; Redis accelerates cache, rate limits, and queues.

## Hosting

| Piece | Role | Where |
| --- | --- | --- |
| Website | Pages, map UI, dashboards | Vercel |
| Game server | Authoritative state | Fly.io (`orbis-api`) |
| Workers | Ticks, offline sim, outbox | Fly.io (`orbis-worker`) |
| Database | Persistent world | Neon Postgres + PostGIS |
| Redis | Cache, queue, pub/sub | Upstash or Fly Redis |
| Email | Verify / reset | Resend |
| Files | Avatars later | Vercel Blob |

## Authority

The client sends intentions. The server validates, commits, and emits events. Never trust the browser for money, ownership, skills, elections, disease, or permissions.

## Sync

- REST for commands and scoped queries
- WebSockets for messaging/notifications (Phase 5+)
- Never broadcast the full world state

## Event model

Domain services write `world_events` and an `outbox` row in the same transaction. Workers publish outbox entries and advance `world_clock`.

## Security (Phase 1)

- Argon2id passwords
- Email verification before full access
- Server sessions (hashed tokens), revoke support
- IP observations and shared-IP signals (evidence, not auto-ban)
- Rate limiting on auth endpoints
- Append-only audit log

## Communication (Phase 5)

Designed as entity-bound channels (company/org/gov/military) with server ACL — not a Discord clone.

## Facts over reputation

No global reputation/trust score. Store observable history; players interpret meaning.
