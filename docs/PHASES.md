# Orbis Development Phases

## Phase 1 — Foundation (done)

Project setup, database, authentication, email verification, character creation, basic geography, map, dashboard, account security, world clock worker.

## Phase 2 — Personal life (done)

Location, money/banking, skills, jobs/employment, movement/travel, payroll via world clock.

## Phase 3 — Property (done, v1)

Parcel listings/ownership, buy/sell, buildings, property tax on tick, property transfer history.

## Phase 4 — Companies (done, v1)

Company founding, shares, hiring, treasury, production queues → inventory.

## Phase 5 — Communication and social (done, v1)

Profiles, DMs (channel ACL), notifications, blocks. REST first (WebSockets later).

## Phase 6 — Organizations (done, v1)

Generic orgs, memberships/roles, join/leave history facts.

## Phase 7 — Politics (done, v1)

Parties, elections, candidacies, votes, offices, law enactment by office holders.
National ID required for franchise; office-holders can open elections; laws may carry
structured effects (e.g. property tax) consumed by the world tick.

## Phase 8 — Economy (done, v1)

Market listings/trades, system loans with tick interest/repayment, player contracts table (basic).

## Phase 9 — Healthcare (done, v1)

Character health, clinic treatment, vaccination.

## Phase 10 — Pandemics (done, v1)

Pathogens, district transmission + damage on world tick.

## Phase 11 — International (data model, not playable)

Treaties and sanctions tables + read APIs only. No player diplomacy actions yet.
Shown in the World bulletin as read-only.

## Phase 12 — Military (data model, not playable)

Units, wars, operations tables + read APIs; seed guard unit. No player military actions.

## Phase 13 — Advanced (partial)

Crime reports open a summary court case and attempt a fine. Environment metrics drift
passively (not rule-consuming). NPCs are seeded flavor only.

---

**Status:** Core life loop (work, skills, travel, land, companies, markets, survival, franchise
politics) is consequential under server authority. Geopolitics/military remain bulletin data —
do not present them as player systems until actions exist.
