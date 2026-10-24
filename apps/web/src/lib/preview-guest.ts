import { SKILL_CATALOG } from "@orbis/contracts";
import { cookies } from "next/headers";

export const GUEST_COOKIE = "orbis_guest_v2";

export type SimLedger = {
  id: string;
  amountCents: number;
  reason: string;
  direction: "credit" | "debit";
  createdAt: string;
};

export type GuestJob = {
  id: string;
  title: string;
  description: string;
  requiredSkillKey: string | null;
  requiredSkillLevel: number;
  salaryCentsPerDay: number;
  employerName: string;
  districtName: string;
  cityName: string;
  isWorldGovernment?: boolean;
};

export type GuestCompanyEmployee = {
  characterId: string;
  name: string;
  salaryCentsPerDay: number;
  hiredAt: string;
  endedAt: string | null;
};

export type GuestState = {
  id: string;
  email: string;
  username: string;
  characterId: string;
  name: string;
  status: "alive" | "dead";
  causeOfDeath: string | null;
  diedAt: string | null;
  balanceCents: number;
  locationDistrictId: string;
  districtName: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  jobId: string | null;
  jobStartedAt: string | null;
  focusSkillKey: string | null;
  buffMode: string;
  skills: Record<string, { level: number; experience: number }>;
  hp: number;
  hunger: number;
  thirst: number;
  energy: number;
  /** Mirrored from inventory food/water for older UI. */
  food: number;
  water: number;
  infectedPathogenKey: string | null;
  vaccinatedPathogenKey: string | null;
  infectedAt: string | null;
  inventory: Array<{ itemKey: string; quantity: number }>;
  marketListings: Array<{
    id: string;
    itemKey: string;
    quantity: number;
    priceCents: number;
    sellerName: string;
  }>;
  loans: Array<{
    id: string;
    principalCents: number;
    balanceCents: number;
    interestBps: number;
    status: string;
  }>;
  companies: Array<{
    id: string;
    name: string;
    industryKey: string;
    treasuryCents: number;
    inventory: Array<{ itemKey: string; quantity: number }>;
    employees: GuestCompanyEmployee[];
  }>;
  properties: Array<{
    id: string;
    label: string;
    districtName: string;
    cityName: string;
    areaM2: number;
    buildings: Array<{ type: string; name: string }>;
  }>;
  partyId: string | null;
  partyName: string | null;
  nationalIds: Array<{ nationality: string; countryCode: string }>;
  travel: null | {
    arrivesAt: string;
    toDistrictId: string;
    toDistrictName: string;
    toCityName: string;
    status: string;
    destinationLabel: string;
    mode: string;
    costCents: number;
    durationMs: number;
    arrivedAt?: string;
  };
  crimes: Array<{
    id: string;
    accusedName: string;
    kind: string;
    districtName: string | null;
    status: string;
    createdAt: string;
  }>;
  courts: Array<{
    id: string;
    crimeKind: string;
    accusedName: string;
    status: string;
    verdict: string | null;
    fineCents: number | null;
  }>;
  laws: Array<{
    id: string;
    title: string;
    body: string;
    effectKey: string | null;
    effectValue: string | null;
  }>;
  profileBio: string;
  hasVehicle: boolean;
  createdAt: string;
  presenceStartedAt: string;
  lastSimAt: string;
  simTimeMs: number;
  ledger: SimLedger[];
  office: {
    id: string;
    title: string;
    holderCharacterId: string | null;
    holderName: string;
  };
  election: {
    id: string;
    office: string;
    status: "open" | "closed";
    closesAt: string;
    candidates: Array<{ characterId: string; name: string }>;
    votes: Array<{ voterId: string; candidateCharacterId: string }>;
    winnerCharacterId: string | null;
  };
};

export const OPEN_JOBS: GuestJob[] = [
  {
    id: "job-settler",
    title: "Settler",
    description: "Safe World Government starter role. You choose it — nothing auto-hires you.",
    requiredSkillKey: null,
    requiredSkillLevel: 0,
    salaryCentsPerDay: 2500,
    employerName: "World Government",
    districtName: "Harbor Ward",
    cityName: "Port Orbis",
    isWorldGovernment: true,
  },
  {
    id: "job-farmhand",
    title: "Farmhand",
    description: "Field work. Agriculture skill gates hire and boosts company yield.",
    requiredSkillKey: "agriculture",
    requiredSkillLevel: 1,
    salaryCentsPerDay: 3200,
    employerName: "Greenfield Co-op",
    districtName: "River Fields",
    cityName: "Port Orbis",
  },
  {
    id: "job-clerk",
    title: "Records Clerk",
    description: "Office work that pays modestly and trains administration.",
    requiredSkillKey: "administration",
    requiredSkillLevel: 0,
    salaryCentsPerDay: 2800,
    employerName: "Civic Bureau",
    districtName: "Harbor Ward",
    cityName: "Port Orbis",
  },
];

export function xpToNext(level: number) {
  return 100 + level * 50;
}

export function defaultGuestState(): GuestState {
  const skills: GuestState["skills"] = {};
  for (const skill of SKILL_CATALOG.slice(0, 12)) {
    skills[skill.key] = { level: skill.key === "administration" ? 1 : 0, experience: 0 };
  }
  const now = new Date().toISOString();
  return {
    id: "guest-account",
    email: "guest@orbis.preview",
    username: "guest",
    characterId: "guest-character",
    name: "Guest Traveler",
    status: "alive",
    causeOfDeath: null,
    diedAt: null,
    balanceCents: 12_500,
    locationDistrictId: "district-harbor",
    districtName: "Harbor Ward",
    cityName: "Port Orbis",
    countryName: "Orbis Free State",
    countryCode: "OFS",
    jobId: null,
    jobStartedAt: null,
    focusSkillKey: "administration",
    buffMode: "self_study",
    skills,
    hp: 100,
    hunger: 70,
    thirst: 75,
    energy: 80,
    food: 3,
    water: 3,
    infectedPathogenKey: null,
    vaccinatedPathogenKey: null,
    infectedAt: null,
    inventory: [
      { itemKey: "food", quantity: 3 },
      { itemKey: "water", quantity: 3 },
    ],
    marketListings: [
      {
        id: "listing-1",
        itemKey: "bread",
        quantity: 8,
        priceCents: 150,
        sellerName: "Harbor Bakery",
      },
      {
        id: "listing-2",
        itemKey: "tools",
        quantity: 3,
        priceCents: 900,
        sellerName: "Workshop Row",
      },
    ],
    loans: [],
    companies: [],
    properties: [],
    partyId: null,
    partyName: null,
    nationalIds: [],
    travel: null,
    crimes: [
      {
        id: "crime-1",
        accusedName: "Unknown",
        kind: "theft",
        districtName: "Harbor Ward",
        status: "reported",
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
    courts: [],
    laws: [
      {
        id: "law-1",
        title: "Harbor Property Levy",
        body: "Modest daily tax on owned parcels.",
        effectKey: "property_tax_cents_per_day",
        effectValue: "25",
      },
    ],
    profileBio: "Preview guest — no login required.",
    hasVehicle: false,
    createdAt: now,
    presenceStartedAt: now,
    lastSimAt: now,
    simTimeMs: 0,
    ledger: [
      {
        id: "tx-start",
        amountCents: 12_500,
        reason: "Starting balance",
        direction: "credit",
        createdAt: now,
      },
    ],
    office: {
      id: "office-1",
      title: "Harbor Warden",
      holderCharacterId: "npc-cand-1",
      holderName: "Mira Sol",
    },
    election: {
      id: "elect-1",
      office: "Harbor Warden",
      status: "open",
      closesAt: new Date(Date.now() + 86_400_000).toISOString(),
      candidates: [
        { characterId: "npc-cand-1", name: "Mira Sol" },
        { characterId: "guest-character", name: "Guest Traveler" },
      ],
      votes: [],
      winnerCharacterId: null,
    },
  };
}

export function encodeGuest(state: GuestState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeGuest(raw: string | undefined): GuestState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GuestState;
    if (!parsed?.characterId || typeof parsed.balanceCents !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readGuest(): Promise<GuestState> {
  const jar = await cookies();
  return decodeGuest(jar.get(GUEST_COOKIE)?.value) ?? defaultGuestState();
}

export async function writeGuest(state: GuestState) {
  const jar = await cookies();
  jar.set(GUEST_COOKIE, encodeGuest(state), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function jobById(id: string | null) {
  if (!id) return null;
  return OPEN_JOBS.find((j) => j.id === id) ?? null;
}

export function publicApiOrigin() {
  const origin = process.env.API_ORIGIN?.trim();
  if (!origin) return null;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(origin)) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}
