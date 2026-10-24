/**
 * In-process world clock for the Vercel guest preview.
 * Mirrors Nest worker causality (payroll, loans, tax, needs, infection, travel, elections)
 * so Miles’s preview is not a consequence-free façade.
 */
import {
  CRITICAL_HUNGER,
  CRITICAL_THIRST,
  DEHYDRATION_HP_PER_HOUR,
  ENERGY_DRAIN_PER_HOUR,
  FOOD_ENERGY_BONUS,
  FOOD_RESTORE,
  HUNGER_DRAIN_PER_HOUR,
  SIM_TIME_RATIO,
  STARVATION_HP_PER_HOUR,
  THIRST_DRAIN_PER_HOUR,
  WATER_RESTORE,
} from "@orbis/contracts";
import { jobById, xpToNext, type GuestState, type SimLedger } from "./preview-guest";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Cap one catch-up so extreme AFK doesn’t explode math; still long enough to starve. */
const MAX_WALL_MS = 48 * HOUR_MS;
const DEFAULT_PROPERTY_TAX_CENTS_PER_DAY = 200;
const CITIZENSHIP_RESIDENCY_GAME_DAYS = 1;
const WORK_MIN_HP = 30;
const WORK_MIN_ENERGY = 15;
const TRAVEL_MIN_HP = 25;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function xpPerHour(mode: string) {
  if (mode === "tutoring") return 35;
  if (mode === "university") return 100;
  if (mode === "job") return 5;
  return 10;
}

export function fineForCrimeKind(kind: string) {
  const key = kind.toLowerCase();
  if (key.includes("theft") || key.includes("fraud")) return 15_000;
  if (key.includes("assault") || key.includes("violence")) return 25_000;
  return 8_000;
}

/** Market/produce keys that count as edible/drinkable rations. */
export function toSupplyKey(itemKey: string): "food" | "water" | null {
  const k = itemKey.toLowerCase();
  if (k === "food" || k === "bread" || k === "grain" || k === "rations") return "food";
  if (k === "water" || k === "water_ration") return "water";
  return null;
}

export function invQty(state: GuestState, itemKey: string) {
  return state.inventory.find((i) => i.itemKey === itemKey)?.quantity ?? 0;
}

export function addInv(state: GuestState, itemKey: string, quantity: number) {
  if (quantity === 0) return;
  const supply = toSupplyKey(itemKey);
  const key = supply ?? itemKey;
  const row = state.inventory.find((i) => i.itemKey === key);
  if (row) row.quantity = Math.max(0, row.quantity + quantity);
  else if (quantity > 0) state.inventory.push({ itemKey: key, quantity });
  state.inventory = state.inventory.filter((i) => i.quantity > 0);
  syncSupplyCounters(state);
}

export function takeInv(state: GuestState, itemKey: string, quantity: number): boolean {
  const supply = toSupplyKey(itemKey);
  const key = supply ?? itemKey;
  const row = state.inventory.find((i) => i.itemKey === key);
  if (!row || row.quantity < quantity) return false;
  row.quantity -= quantity;
  state.inventory = state.inventory.filter((i) => i.quantity > 0);
  syncSupplyCounters(state);
  return true;
}

export function syncSupplyCounters(state: GuestState) {
  state.food = invQty(state, "food");
  state.water = invQty(state, "water");
}

export function pushLedger(
  state: GuestState,
  amountCents: number,
  reason: string,
  direction: "credit" | "debit",
) {
  if (!state.ledger) state.ledger = [];
  state.ledger.unshift({
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    amountCents,
    reason,
    direction,
    createdAt: new Date().toISOString(),
  });
  state.ledger = state.ledger.slice(0, 6);
}

export function activeLawValue(state: GuestState, effectKey: string): number | null {
  for (const law of state.laws) {
    if (law.effectKey === effectKey && law.effectValue != null && law.effectValue !== "") {
      const n = Number(law.effectValue);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function hasShelter(state: GuestState) {
  return state.properties.some((p) => (p.buildings?.length ?? 0) > 0);
}

export function fitnessBlock(
  state: GuestState,
  activity: "work" | "travel" | "forage",
): string | null {
  if (state.status === "dead") {
    return `You are dead (${state.causeOfDeath ?? "unknown"}). Preview session ends consequences here.`;
  }
  if (state.travel?.status === "in_transit") {
    return "Finish traveling first";
  }
  if (activity === "travel") {
    if (state.hp < TRAVEL_MIN_HP) return `Too injured to travel (HP ${state.hp} < ${TRAVEL_MIN_HP})`;
    if (state.infectedPathogenKey) return "Infected — seek treatment before travel";
    return null;
  }
  if (state.hp < WORK_MIN_HP) return `Too injured to work (HP ${state.hp} < ${WORK_MIN_HP})`;
  if (state.energy < WORK_MIN_ENERGY) {
    return `Exhausted (energy ${Math.round(state.energy)} < ${WORK_MIN_ENERGY}) — rest or eat`;
  }
  if (state.infectedPathogenKey && activity !== "forage") {
    return "Infected — clinic treatment required before working";
  }
  return null;
}

export function presenceGameDays(state: GuestState, nowMs: number) {
  const started = Date.parse(state.presenceStartedAt || state.createdAt || new Date(nowMs).toISOString());
  const wallMs = Math.max(0, nowMs - started);
  const simMs = wallMs * SIM_TIME_RATIO;
  return simMs / DAY_MS;
}

export function citizenshipEligible(state: GuestState, nowMs = Date.now()) {
  return presenceGameDays(state, nowMs) >= CITIZENSHIP_RESIDENCY_GAME_DAYS;
}

function applySkillXp(state: GuestState, skillKey: string, gain: number) {
  if (!skillKey || gain <= 0) return;
  if (!state.skills[skillKey]) state.skills[skillKey] = { level: 0, experience: 0 };
  const row = state.skills[skillKey]!;
  row.experience += gain;
  let guard = 0;
  while (row.experience >= xpToNext(row.level) && guard < 20) {
    row.experience -= xpToNext(row.level);
    row.level += 1;
    guard += 1;
  }
}

function completeTravel(state: GuestState, nowIso: string) {
  const trip = state.travel;
  if (!trip || trip.status !== "in_transit") return;
  if (Date.parse(trip.arrivesAt) > Date.now()) return;
  state.locationDistrictId = trip.toDistrictId;
  state.districtName = trip.toDistrictName;
  state.cityName = trip.toCityName;
  state.travel = {
    ...trip,
    status: "arrived",
    arrivedAt: nowIso,
  };
  // Presence continues in same country; refresh start only if we tracked leave — single-country preview keeps accrual.
}

function processNeeds(state: GuestState, simDeltaMs: number) {
  if (state.status === "dead" || simDeltaMs <= 0) return;
  const hours = simDeltaMs / HOUR_MS;
  const shelter = hasShelter(state);
  const hungerDrain = HUNGER_DRAIN_PER_HOUR * (shelter ? 0.75 : 1);
  const energyDrain = ENERGY_DRAIN_PER_HOUR * (shelter ? 0.5 : 1);
  let hunger = state.hunger - hungerDrain * hours;
  let thirst = state.thirst - THIRST_DRAIN_PER_HOUR * hours;
  let energy = state.energy - energyDrain * hours;
  let hp = state.hp;

  if (hunger < 55 && takeInv(state, "food", 1)) {
    hunger += FOOD_RESTORE;
    energy += FOOD_ENERGY_BONUS;
  }
  if (thirst < 55 && takeInv(state, "water", 1)) {
    thirst += WATER_RESTORE;
  }

  hunger = clamp(hunger, 0, 100);
  thirst = clamp(thirst, 0, 100);
  energy = clamp(energy, 0, 100);

  if (hunger < CRITICAL_HUNGER) {
    hp -= STARVATION_HP_PER_HOUR * hours * (hunger <= 0 ? 1.5 : 1);
  }
  if (thirst < CRITICAL_THIRST) {
    hp -= DEHYDRATION_HP_PER_HOUR * hours * (thirst <= 0 ? 1.5 : 1);
  }
  hp = clamp(hp, 0, 100);

  state.hunger = hunger;
  state.thirst = thirst;
  state.energy = energy;
  state.hp = hp;

  if (hp <= 0) {
    state.status = "dead";
    state.diedAt = new Date().toISOString();
    state.causeOfDeath = thirst <= 0 ? "dehydration" : hunger <= 0 ? "starvation" : "exposure";
    state.jobId = null;
    state.jobStartedAt = null;
  }
}

function processInfection(state: GuestState, simDeltaMs: number) {
  if (state.status === "dead" || simDeltaMs <= 0) return;
  const ticks = Math.max(1, Math.floor(simDeltaMs / (HOUR_MS / 2)));
  for (let i = 0; i < ticks; i++) {
    if (state.infectedPathogenKey) {
      const dmg = 2;
      state.hp = clamp(state.hp - dmg, 0, 100);
      if (state.hp <= 0) {
        state.status = "dead";
        state.diedAt = new Date().toISOString();
        state.causeOfDeath = `disease:${state.infectedPathogenKey}`;
        state.jobId = null;
        return;
      }
      // chance to recover without clinic if vaccinated mismatch already blocked; mild recovery
      if (Math.random() < 0.02) state.infectedPathogenKey = null;
      continue;
    }
    if (state.vaccinatedPathogenKey === "harbor_fever") continue;
    // Low seed chance of Harbor Fever outbreak while alive in dense harbor / fields
    if (Math.random() < 0.015) {
      state.infectedPathogenKey = "harbor_fever";
      state.infectedAt = new Date().toISOString();
    }
  }
}

function processPayroll(state: GuestState, simDeltaMs: number) {
  if (state.status === "dead" || !state.jobId || simDeltaMs <= 0) return;
  const job = jobById(state.jobId);
  if (!job) return;
  const amount = Math.floor((job.salaryCentsPerDay * simDeltaMs) / DAY_MS);
  if (amount > 0) {
    state.balanceCents += amount;
    pushLedger(state, amount, `Salary: ${job.title}`, "credit");
  }
  if (job.requiredSkillKey) {
    applySkillXp(state, job.requiredSkillKey, (xpPerHour("job") * simDeltaMs) / HOUR_MS);
  }
}

function processCompanyPayroll(state: GuestState, simDeltaMs: number) {
  if (simDeltaMs <= 0) return;
  for (const company of state.companies) {
    const employees = company.employees ?? [];
    for (const emp of employees) {
      if (emp.endedAt) continue;
      const amount = Math.floor((emp.salaryCentsPerDay * simDeltaMs) / DAY_MS);
      if (amount <= 0) continue;
      if (company.treasuryCents < amount) {
        emp.endedAt = new Date().toISOString();
        continue;
      }
      company.treasuryCents -= amount;
      if (emp.characterId === state.characterId && state.status === "alive") {
        state.balanceCents += amount;
        pushLedger(state, amount, `Company pay: ${company.name}`, "credit");
        const skill =
          company.industryKey === "workshop" ? "manufacturing" : "agriculture";
        applySkillXp(state, skill, (xpPerHour("job") * simDeltaMs) / HOUR_MS);
      }
    }
  }
}

function processLoans(state: GuestState, simDeltaMs: number) {
  if (state.status === "dead" || simDeltaMs <= 0) return;
  for (const loan of state.loans) {
    if (loan.status !== "active") continue;
    const interest = Math.floor(
      (loan.balanceCents * loan.interestBps * simDeltaMs) / (10_000 * DAY_MS),
    );
    const principalBite = Math.max(
      1,
      Math.floor((loan.balanceCents * simDeltaMs) / (30 * DAY_MS)),
    );
    const due = interest + principalBite;
    if (due <= 0) continue;
    if (state.balanceCents < due) {
      loan.status = "defaulted";
      pushLedger(state, 0, `Loan defaulted (${loan.id})`, "debit");
      continue;
    }
    state.balanceCents -= due;
    loan.balanceCents = Math.max(0, loan.balanceCents - principalBite);
    pushLedger(state, due, "Loan payment", "debit");
    if (loan.balanceCents <= 0) {
      loan.balanceCents = 0;
      loan.status = "paid";
    }
  }
}

function processPropertyTax(state: GuestState, simDeltaMs: number) {
  if (state.status === "dead" || state.properties.length === 0 || simDeltaMs <= 0) return;
  if (simDeltaMs < DAY_MS / 24) return;
  const taxPerDay =
    activeLawValue(state, "property_tax_cents_per_day") ?? DEFAULT_PROPERTY_TAX_CENTS_PER_DAY;
  const amount = Math.floor((taxPerDay * state.properties.length * simDeltaMs) / DAY_MS);
  if (amount <= 0) return;
  if (state.balanceCents < amount) {
    // Unpaid tax: seize nothing in preview — mark debt via ledger and zero wallet
    pushLedger(state, state.balanceCents, "Property tax (partial — insolvent)", "debit");
    state.balanceCents = 0;
    return;
  }
  state.balanceCents -= amount;
  pushLedger(state, amount, "Property tax", "debit");
}

function processLandResources(state: GuestState, simDeltaMs: number) {
  if (state.status === "dead" || simDeltaMs <= 0) return;
  const hours = simDeltaMs / HOUR_MS;
  for (const parcel of state.properties) {
    // Soil yield → grain (later converted when withdrawn to food via market/consume map)
    const units = Math.floor(hours * 0.25);
    if (units > 0) addInv(state, "grain", units);
  }
}

function processStudy(state: GuestState, simDeltaMs: number) {
  if (state.status === "dead" || !state.focusSkillKey || simDeltaMs <= 0) return;
  const mode = state.buffMode || "self_study";
  if (mode !== "self_study") {
    // Subscription: ~100¢ per game day while buffed
    const fee = Math.floor((100 * simDeltaMs) / DAY_MS);
    if (fee > 0) {
      if (state.balanceCents < fee) {
        state.buffMode = "self_study";
      } else {
        state.balanceCents -= fee;
        pushLedger(state, fee, `Study ${mode}`, "debit");
      }
    }
  }
  const rate = xpPerHour(state.buffMode || "self_study");
  applySkillXp(state, state.focusSkillKey, (rate * simDeltaMs) / HOUR_MS);
}

function closeElections(state: GuestState) {
  const election = state.election;
  if (!election || election.status !== "open") return;
  if (Date.parse(election.closesAt) > Date.now()) return;
  const tally = new Map<string, number>();
  for (const v of election.votes) {
    tally.set(v.candidateCharacterId, (tally.get(v.candidateCharacterId) ?? 0) + 1);
  }
  let winnerId = election.candidates[0]?.characterId ?? null;
  let best = -1;
  for (const [id, count] of tally) {
    if (count > best) {
      best = count;
      winnerId = id;
    }
  }
  election.status = "closed";
  election.winnerCharacterId = winnerId;
  const winner = election.candidates.find((c) => c.characterId === winnerId);
  state.office = {
    id: "office-1",
    title: election.office,
    holderCharacterId: winnerId,
    holderName: winner?.name ?? "Vacant",
  };
}

/**
 * Advance guest world state by wall-clock elapsed × sim ratio.
 * Call on every consequential read/mutate.
 */
export function advanceGuestSim(state: GuestState, nowMs = Date.now()): GuestState {
  ensureGuestShape(state);
  if (state.status === "dead") {
    state.lastSimAt = new Date(nowMs).toISOString();
    syncSupplyCounters(state);
    return state;
  }

  const last = Date.parse(state.lastSimAt || state.createdAt || new Date(nowMs).toISOString());
  const wallDelta = Math.min(MAX_WALL_MS, Math.max(0, nowMs - last));
  const simDeltaMs = Math.floor(wallDelta * SIM_TIME_RATIO);
  const nowIso = new Date(nowMs).toISOString();

  completeTravel(state, nowIso);

  // Substep by sim-hour so auto-eat/drink and wages apply realistically on catch-up
  // (a single multi-day lump would starve past inventory and skip payroll).
  let remaining = simDeltaMs;
  const stepMs = HOUR_MS;
  while (remaining > 0) {
    if (state.status !== "alive") break;
    const step = Math.min(stepMs, remaining);
    processNeeds(state, step);
    processInfection(state, step);
    processPayroll(state, step);
    processCompanyPayroll(state, step);
    processLoans(state, step);
    processPropertyTax(state, step);
    processLandResources(state, step);
    processStudy(state, step);
    remaining -= step;
  }

  closeElections(state);

  state.lastSimAt = nowIso;
  state.simTimeMs = (state.simTimeMs ?? 0) + simDeltaMs;
  syncSupplyCounters(state);
  return state;
}

export function ensureGuestShape(state: GuestState) {
  if (!state.status) state.status = "alive";
  if (!state.ledger) state.ledger = [];
  if (!state.infectedPathogenKey) state.infectedPathogenKey = null;
  if (!state.vaccinatedPathogenKey) state.vaccinatedPathogenKey = null;
  if (typeof state.hasVehicle !== "boolean") state.hasVehicle = false;
  if (!state.createdAt) state.createdAt = new Date().toISOString();
  if (!state.presenceStartedAt) state.presenceStartedAt = state.createdAt;
  if (!state.lastSimAt) state.lastSimAt = state.createdAt;
  if (typeof state.simTimeMs !== "number") state.simTimeMs = 0;
  if (!state.office) {
    state.office = {
      id: "office-1",
      title: "Harbor Warden",
      holderCharacterId: "npc-cand-1",
      holderName: "Mira Sol",
    };
  }
  if (!state.election) {
    state.election = {
      id: "elect-1",
      office: "Harbor Warden",
      status: "open",
      closesAt: new Date(Date.parse(state.createdAt) + 24 * HOUR_MS).toISOString(),
      candidates: [
        { characterId: "npc-cand-1", name: "Mira Sol" },
        { characterId: "guest-character", name: state.name },
      ],
      votes: [],
      winnerCharacterId: null,
    };
  }
  for (const c of state.companies) {
    if (!c.employees) c.employees = [];
  }
  for (const p of state.properties) {
    if (!p.buildings) p.buildings = [];
  }
  // Migrate legacy food/water counters into inventory once
  if (state.food > 0 && invQty(state, "food") === 0) addInv(state, "food", state.food);
  if (state.water > 0 && invQty(state, "water") === 0) addInv(state, "water", state.water);
  // Convert edible stock keys
  for (const row of [...state.inventory]) {
    const supply = toSupplyKey(row.itemKey);
    if (supply && row.itemKey !== supply) {
      const q = row.quantity;
      row.quantity = 0;
      addInv(state, supply, q);
    }
  }
  syncSupplyCounters(state);
}

export function productionQuantity(skillLevel: number) {
  return Math.max(1, 3 + skillLevel * 2);
}

export { CITIZENSHIP_RESIDENCY_GAME_DAYS, WORK_MIN_HP, WORK_MIN_ENERGY, TRAVEL_MIN_HP };
