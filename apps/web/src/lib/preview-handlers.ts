import { SKILL_CATALOG } from "@orbis/contracts";
import {
  GUEST_COOKIE,
  OPEN_JOBS,
  defaultGuestState,
  jobById,
  readGuest,
  writeGuest,
  xpToNext,
  type GuestState,
} from "./preview-guest";

type HandlerResult = {
  status?: number;
  body: unknown;
  clearGuest?: boolean;
};

function ok(body: unknown, status = 200): HandlerResult {
  return { status, body };
}

function err(message: string, status = 400): HandlerResult {
  return { status, body: { message } };
}

function skillRows(state: GuestState) {
  return SKILL_CATALOG.map((skill) => {
    const row = state.skills[skill.key] ?? { level: 0, experience: 0 };
    const toNext = xpToNext(row.level);
    return {
      key: skill.key,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      level: row.level,
      experience: row.experience,
      xpToNext: toNext,
      progressPct: Math.min(100, Math.round((row.experience / toNext) * 100)),
      isFocus: state.focusSkillKey === skill.key,
    };
  });
}

function moneyPeriod() {
  return { day: 100, week: 500, month: 1800, year: 18000 };
}

async function mutate(update: (state: GuestState) => HandlerResult | Promise<HandlerResult>) {
  const state = await readGuest();
  const result = await update(state);
  if (!result.clearGuest && (result.status ?? 200) < 400) {
    await writeGuest(state);
  }
  return result;
}

export async function handlePreviewApi(
  method: string,
  path: string,
  body: unknown,
  searchParams: URLSearchParams,
): Promise<HandlerResult> {
  const m = method.toUpperCase();
  const segments = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const [root, a, b] = segments;

  if (root === "health" && m === "GET") {
    return ok({ ok: true, service: "orbis-preview-guest" });
  }

  if (root === "auth") {
    if (a === "me" && m === "GET") {
      const state = await readGuest();
      await writeGuest(state);
      return ok({
        id: state.id,
        email: state.email,
        username: state.username,
        emailVerified: true,
        previewGuest: true,
      });
    }
    if (a === "logout" && m === "POST") {
      return { status: 200, body: { ok: true }, clearGuest: true };
    }
    if ((a === "login" || a === "register") && m === "POST") {
      const state = defaultGuestState();
      if (a === "register" && body && typeof body === "object") {
        const input = body as Record<string, unknown>;
        if (typeof input.firstName === "string" && typeof input.lastName === "string") {
          state.name = `${input.firstName} ${input.lastName}`.trim() || state.name;
        }
        if (typeof input.username === "string" && input.username.trim()) {
          state.username = input.username.trim();
        }
      }
      await writeGuest(state);
      return ok({ ok: true, previewGuest: true });
    }
    if (a === "verify-email" && m === "POST") return ok({ ok: true });
    if (a === "password-reset" && m === "POST") return ok({ ok: true });
    if (a === "revoke-sessions" && m === "POST") return ok({ ok: true });
  }

  if (root === "character" && a === "me" && m === "GET") {
    const state = await readGuest();
    const job = jobById(state.jobId);
    return ok({
      id: state.characterId,
      name: state.name,
      status: "alive",
      locationDistrictId: state.locationDistrictId,
      balanceCents: state.balanceCents,
      currency: "ORB",
      location: {
        districtName: state.districtName,
        cityName: state.cityName,
        countryName: state.countryName,
        countryCode: state.countryCode,
      },
      employment: job
        ? {
            title: job.title,
            employerName: job.employerName,
            salaryCentsPerDay: job.salaryCentsPerDay,
          }
        : null,
      travel: state.travel,
    });
  }

  if (root === "economy" && a === "wallet" && m === "GET") {
    const state = await readGuest();
    return ok({
      balanceCents: state.balanceCents,
      currency: "ORB",
      recent: [
        {
          id: "tx-1",
          amountCents: 500,
          reason: "Preview starting balance",
          direction: "credit",
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  if (root === "jobs") {
    if (!a && m === "GET") {
      const state = await readGuest();
      return ok({
        characterId: state.characterId,
        locationDistrictId: state.locationDistrictId,
        jobs: OPEN_JOBS.map((job) => {
          const have = job.requiredSkillKey
            ? (state.skills[job.requiredSkillKey]?.level ?? 0)
            : 0;
          const skillOk = !job.requiredSkillKey || have >= job.requiredSkillLevel;
          const locationOk =
            job.districtName === state.districtName || Boolean(job.isWorldGovernment);
          return {
            ...job,
            eligible: skillOk && locationOk && state.jobId !== job.id,
            skillOk,
            locationOk,
            yourSkillLevel: have,
          };
        }),
      });
    }
    if (a === "mine" && m === "GET") {
      const state = await readGuest();
      const job = jobById(state.jobId);
      return ok({
        current: job
          ? {
              id: job.id,
              title: job.title,
              salaryCentsPerDay: job.salaryCentsPerDay,
              employerName: job.employerName,
              districtName: job.districtName,
              startedAt: state.jobStartedAt ?? new Date().toISOString(),
            }
          : null,
        history: [],
      });
    }
    if (a === "apply" && m === "POST") {
      return mutate((state) => {
        const jobId = (body as { jobPostingId?: string })?.jobPostingId;
        const job = jobById(jobId ?? null);
        if (!job) return err("Job not found", 404);
        if (state.jobId) return err("Resign before taking another job");
        const have = job.requiredSkillKey
          ? (state.skills[job.requiredSkillKey]?.level ?? 0)
          : 0;
        if (job.requiredSkillKey && have < job.requiredSkillLevel) {
          return err("Skill requirement not met");
        }
        state.jobId = job.id;
        state.jobStartedAt = new Date().toISOString();
        return ok({ ok: true, title: job.title });
      });
    }
    if (a === "resign" && m === "POST") {
      return mutate((state) => {
        state.jobId = null;
        state.jobStartedAt = null;
        return ok({ ok: true });
      });
    }
  }

  if (root === "skills") {
    if (!a && m === "GET") {
      const state = await readGuest();
      return ok({
        study: {
          focusSkillKey: state.focusSkillKey,
          buffMode: state.buffMode,
          buffPeriod: null,
          nextBillingAt: null,
          xpPerHour: state.buffMode === "university" ? 40 : state.buffMode === "tutoring" ? 25 : 10,
          rates: { self_study: 10, tutoring: 25, university: 40 },
          subscriptionPrices: {
            tutoring: moneyPeriod(),
            university: moneyPeriod(),
          },
        },
        skills: skillRows(state),
      });
    }
    if (a === "catalog" && m === "GET") {
      return ok({
        categories: [...new Set(SKILL_CATALOG.map((s) => s.category))],
        available: SKILL_CATALOG.map((skill) => ({
          key: skill.key,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          xpToLevel1: 100,
          buffs: {
            self_study: { xpPerHour: 10 },
            tutoring: { xpPerHour: 25, ...moneyPeriod() },
            university: { xpPerHour: 40, ...moneyPeriod() },
          },
        })),
      });
    }
    if (a === "focus" && m === "POST") {
      return mutate((state) => {
        const key = (body as { skillKey?: string })?.skillKey ?? null;
        state.focusSkillKey = key;
        if (key && !state.skills[key]) state.skills[key] = { level: 0, experience: 0 };
        return ok({ ok: true });
      });
    }
    if (a === "buff" && m === "POST") {
      return mutate((state) => {
        const mode = (body as { mode?: string })?.mode ?? "self_study";
        state.buffMode = mode;
        if (mode !== "self_study") state.balanceCents = Math.max(0, state.balanceCents - 100);
        return ok({ ok: true });
      });
    }
    if (a === "buff" && b === "clear" && m === "POST") {
      return mutate((state) => {
        state.buffMode = "self_study";
        return ok({ ok: true });
      });
    }
  }

  if (root === "healthcare") {
    if (a === "me" && m === "GET") {
      const state = await readGuest();
      return ok({
        hp: state.hp,
        maxHp: 100,
        hunger: state.hunger,
        maxHunger: 100,
        thirst: state.thirst,
        maxThirst: 100,
        energy: state.energy,
        maxEnergy: 100,
        supplies: { food: state.food, water: state.water },
        infection: null,
        environment: { biome: "temperate coast", note: "Mild sea air." },
      });
    }
    if (a === "consume" && m === "POST") {
      return mutate((state) => {
        const kind = (body as { kind?: string })?.kind;
        if (kind === "food") {
          if (state.food <= 0) return err("No food");
          state.food -= 1;
          state.hunger = Math.min(100, state.hunger + 25);
        } else {
          if (state.water <= 0) return err("No water");
          state.water -= 1;
          state.thirst = Math.min(100, state.thirst + 25);
        }
        return ok({ ok: true });
      });
    }
    if (a === "buy-supplies" && m === "POST") {
      return mutate((state) => {
        const kind = (body as { kind?: string })?.kind;
        const cost = 200;
        if (state.balanceCents < cost) return err("Not enough money");
        state.balanceCents -= cost;
        if (kind === "food") state.food += 1;
        else state.water += 1;
        return ok({ ok: true });
      });
    }
    if (a === "forage" && m === "POST") {
      return mutate((state) => {
        const kind = (body as { kind?: string })?.kind;
        state.energy = Math.max(0, state.energy - 10);
        if (kind === "food") state.food += 1;
        else state.water += 1;
        return ok({ ok: true });
      });
    }
    if (a === "treat" && m === "POST") {
      return mutate((state) => {
        if (state.balanceCents < 500) return err("Not enough money");
        state.balanceCents -= 500;
        state.hp = Math.min(100, state.hp + 20);
        return ok({ ok: true });
      });
    }
  }

  if (root === "identity" && a === "me" && m === "GET") {
    const state = await readGuest();
    return ok({
      passport: { passportNumber: "WG-GUEST00001" },
      nationalIds: state.nationalIds,
      presence: {
        districtName: state.districtName,
        cityName: state.cityName,
        countryName: state.countryName,
      },
    });
  }

  if (root === "identity" && a === "citizenship" && b === "apply" && m === "POST") {
    return mutate((state) => {
      if (state.balanceCents < 1000) return err("Application fee is 10 ORB");
      state.balanceCents -= 1000;
      if (!state.nationalIds.some((n) => n.countryCode === state.countryCode)) {
        state.nationalIds.push({
          nationality: state.countryName,
          countryCode: state.countryCode,
        });
      }
      return ok({ ok: true });
    });
  }

  if (root === "travel") {
    if (a === "status" && m === "GET") {
      const state = await readGuest();
      return ok({
        hasVehicle: false,
        position: { lat: 45.4642, lng: 9.19 },
        location: {
          districtId: state.locationDistrictId,
          districtName: state.districtName,
          cityName: state.cityName,
        },
        trip: state.travel
          ? {
              id: "trip-1",
              arrivesAt: state.travel.arrivesAt,
              costCents: 0,
              status: state.travel.status,
              mode: "walk",
              distanceM: 1200,
              destinationLabel: state.travel.destinationLabel,
              durationLabel: "20 min",
              toLat: 45.47,
              toLng: 9.2,
            }
          : null,
      });
    }
    if (a === "destinations" && m === "GET") {
      return ok({
        destinations: [
          {
            districtId: "district-fields",
            districtName: "River Fields",
            cityName: "Port Orbis",
            cityLat: 45.48,
            cityLng: 9.21,
            costCents: 0,
            durationLabel: "25 min walk",
            label: "River Fields",
            mode: "walk",
            distanceM: 1800,
          },
          {
            districtId: "district-harbor",
            districtName: "Harbor Ward",
            cityName: "Port Orbis",
            cityLat: 45.4642,
            cityLng: 9.19,
            costCents: 0,
            durationLabel: "15 min walk",
            label: "Harbor Ward",
            mode: "walk",
            distanceM: 900,
          },
        ],
      });
    }
    if (a === "addresses" && m === "GET") {
      return ok({
        results: [
          {
            id: "addr-1",
            name: "Civic Hall",
            address: "1 Forum Way",
            latitude: 45.465,
            longitude: 9.191,
            districtName: "Harbor Ward",
            cityName: "Port Orbis",
          },
        ],
      });
    }
    if (a === "quote" && m === "POST") {
      return ok({
        mode: "walk",
        distanceM: 1500,
        durationMs: 18 * 60_000,
        durationLabel: "18 min",
        costCents: 0,
        speedKmh: 5,
        hasVehicle: false,
        note: "Preview travel — arrives instantly on confirm.",
        to: { lat: 45.48, lng: 9.21, label: "River Fields" },
      });
    }
    if (!a && m === "POST") {
      return mutate((state) => {
        const destId = (body as { toDistrictId?: string })?.toDistrictId;
        if (destId === "district-fields") {
          state.locationDistrictId = "district-fields";
          state.districtName = "River Fields";
        } else {
          state.locationDistrictId = "district-harbor";
          state.districtName = "Harbor Ward";
        }
        state.travel = null;
        return ok({ ok: true });
      });
    }
  }

  if (root === "property") {
    if (a === "listings" && m === "GET") {
      return ok({
        listings: [
          {
            id: "prop-list-1",
            label: "River plot",
            districtName: "River Fields",
            cityName: "Port Orbis",
            areaM2: 400,
            priceCents: 5000,
          },
        ],
      });
    }
    if (a === "mine" && m === "GET") {
      const state = await readGuest();
      return ok({
        parcels: state.properties.map((p) => ({
          parcelId: p.id,
          label: p.label,
          districtName: p.districtName,
          cityName: p.cityName,
          areaM2: p.areaM2,
          latitude: 45.48,
          longitude: 9.21,
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [9.209, 45.479],
                [9.211, 45.479],
                [9.211, 45.481],
                [9.209, 45.481],
                [9.209, 45.479],
              ],
            ],
          },
        })),
      });
    }
    if (a === "building-types" && m === "GET") {
      return ok({
        types: [{ key: "shed", name: "Shed", costCents: 1500 }],
      });
    }
    if (a === "buy" && m === "POST") {
      return mutate((state) => {
        if (state.balanceCents < 5000) return err("Not enough money");
        state.balanceCents -= 5000;
        state.properties.push({
          id: `parcel-${state.properties.length + 1}`,
          label: "River plot",
          districtName: "River Fields",
          cityName: "Port Orbis",
          areaM2: 400,
        });
        return ok({ ok: true });
      });
    }
    if (a === "buy-cell" && m === "POST") {
      return mutate((state) => {
        const price = 2500;
        if (state.balanceCents < price) return err("Not enough money");
        state.balanceCents -= price;
        const id = `cell-${state.properties.length + 1}`;
        state.properties.push({
          id,
          label: "Claimed cell",
          districtName: state.districtName,
          cityName: state.cityName,
          areaM2: 100,
        });
        return ok({ ok: true, parcelId: id });
      });
    }
    if (a === "preview-cell" && m === "POST") {
      const input = (body as { ix?: number; iy?: number }) ?? {};
      return ok({
        ix: input.ix ?? 0,
        iy: input.iy ?? 0,
        areaM2: 100,
        cellSizeM: 10,
        latitude: 45.48,
        longitude: 9.21,
        status: "available",
        priceCents: 2500,
        seller: "World Government",
        terrain: "grass",
        elevationM: 12,
        resources: [{ resourceKey: "soil", resourceName: "Soil", richness: 40, unit: "u", label: null }],
      });
    }
    if (a === "list" && m === "POST") return ok({ ok: true });
    if (a === "build" && m === "POST") {
      return mutate((state) => {
        if (state.balanceCents < 1500) return err("Not enough money");
        state.balanceCents -= 1500;
        return ok({ ok: true });
      });
    }
    if (a === "build-quote" && m === "POST") {
      return ok({ costCents: 1500, durationLabel: "1 game day" });
    }
  }

  if (root === "companies") {
    if (!a && m === "GET") {
      const state = await readGuest();
      return ok({
        companies: state.companies.map((c) => ({
          id: c.id,
          name: c.name,
          description: "Preview guest company",
          industry: c.industryKey,
          primarySkillKey: c.industryKey === "workshop" ? "manufacturing" : "agriculture",
          treasuryCents: c.treasuryCents,
          districtName: state.districtName,
          cityName: state.cityName,
          founderCharacterId: state.characterId,
        })),
        industries: [
          {
            key: "farm",
            name: "Farming",
            description: "Grow food; agriculture skill raises yield.",
            primarySkillKey: "agriculture",
          },
          {
            key: "workshop",
            name: "Workshop",
            description: "Craft goods; manufacturing skill raises yield.",
            primarySkillKey: "manufacturing",
          },
        ],
      });
    }
    if (a === "mine" && m === "GET") {
      const state = await readGuest();
      return ok({
        characterId: state.characterId,
        founded: state.companies.map((c) => ({
          id: c.id,
          name: c.name,
          treasuryCents: c.treasuryCents,
          industry: c.industryKey,
          primarySkillKey: c.industryKey === "workshop" ? "manufacturing" : "agriculture",
        })),
        shares: [],
        employment: [],
      });
    }
    if (!a && m === "POST") {
      return mutate((state) => {
        const input = body as {
          name?: string;
          industryKey?: string;
          industry?: string;
          seedCapitalCents?: number;
        };
        const seed = Number(input.seedCapitalCents ?? 0);
        if (seed < 10000) return err("Seed capital must be at least 100 ORB");
        if (state.balanceCents < seed) return err("Not enough money");
        state.balanceCents -= seed;
        const company = {
          id: `co-${state.companies.length + 1}`,
          name: input.name?.trim() || "Guest Co",
          industryKey: input.industryKey || input.industry || "farm",
          treasuryCents: seed,
          inventory: [] as Array<{ itemKey: string; quantity: number }>,
        };
        state.companies.push(company);
        return ok({ ok: true, company });
      });
    }
    if (a === "produce" && m === "POST") {
      return mutate((state) => {
        const company = state.companies[0];
        if (!company) return err("No company");
        company.inventory.push({ itemKey: "grain", quantity: 5 });
        return ok({
          ok: true,
          produced: { itemKey: "grain", quantity: 5 },
          note: "Workforce skill multiplied yield in preview.",
        });
      });
    }
    if (a === "withdraw" && m === "POST") {
      return mutate((state) => {
        const company = state.companies[0];
        if (!company) return err("No company");
        const item = company.inventory.shift();
        if (!item) return err("Nothing to withdraw");
        const existing = state.inventory.find((i) => i.itemKey === item.itemKey);
        if (existing) existing.quantity += item.quantity;
        else state.inventory.push(item);
        return ok({ ok: true });
      });
    }
    if (a === "hire" && m === "POST") {
      return ok({ note: "Preview hire recorded — payroll runs on the live sim tick." });
    }
    if (a && m === "GET" && b === "talent") {
      return ok({
        primarySkillKey: "agriculture",
        note: "Preview talent pool.",
        candidates: [{ characterId: "npc-1", name: "Asha Reed", skillLevel: 2 }],
      });
    }
    if (a && m === "GET") {
      const state = await readGuest();
      const company = state.companies.find((c) => c.id === a) ?? state.companies[0];
      if (!company) return err("Company not found", 404);
      return ok({
        id: company.id,
        name: company.name,
        yieldMultiplier: 1.2,
        inventory: company.inventory,
        note: "Preview company detail.",
        workforce: {
          skillKey: company.industryKey === "workshop" ? "manufacturing" : "agriculture",
          avgSkillLevel: 1,
          workerCount: 1,
          members: [
            {
              characterName: state.name,
              skillLevel: 1,
              isFounder: true,
            },
          ],
        },
      });
    }
  }

  if (root === "markets") {
    if (a === "listings" && m === "GET") {
      const state = await readGuest();
      return ok({ listings: state.marketListings });
    }
    if (a === "listings" && m === "POST") {
      return mutate((state) => {
        const input = body as { itemKey?: string; quantity?: number; priceCents?: number };
        const qty = Number(input.quantity ?? 0);
        const price = Number(input.priceCents ?? 0);
        const inv = state.inventory.find((i) => i.itemKey === input.itemKey);
        if (!inv || inv.quantity < qty) return err("Not enough inventory");
        inv.quantity -= qty;
        state.marketListings.push({
          id: `listing-${Date.now()}`,
          itemKey: String(input.itemKey),
          quantity: qty,
          priceCents: price,
          sellerName: state.name,
        });
        return ok({ ok: true });
      });
    }
    if (a === "buy" && m === "POST") {
      return mutate((state) => {
        const input = body as { listingId?: string; quantity?: number };
        const listing = state.marketListings.find((l) => l.id === input.listingId);
        const qty = Number(input.quantity ?? 1);
        if (!listing) return err("Listing not found", 404);
        const cost = listing.priceCents * qty;
        if (state.balanceCents < cost) return err("Not enough money");
        state.balanceCents -= cost;
        listing.quantity -= qty;
        if (listing.quantity <= 0) {
          state.marketListings = state.marketListings.filter((l) => l.id !== listing.id);
        }
        const inv = state.inventory.find((i) => i.itemKey === listing.itemKey);
        if (inv) inv.quantity += qty;
        else state.inventory.push({ itemKey: listing.itemKey, quantity: qty });
        return ok({ ok: true });
      });
    }
    if (a === "loans" && b === "mine" && m === "GET") {
      const state = await readGuest();
      return ok({ loans: state.loans });
    }
    if (a === "loans" && m === "POST") {
      return mutate((state) => {
        const amount = Number((body as { amountCents?: number })?.amountCents ?? 0);
        if (amount < 1000) return err("Minimum loan is 10 ORB");
        state.balanceCents += amount;
        state.loans.push({
          id: `loan-${Date.now()}`,
          principalCents: amount,
          balanceCents: Math.round(amount * 1.05),
          interestBps: 500,
          status: "active",
        });
        return ok({ ok: true });
      });
    }
  }

  if (root === "politics") {
    if (a === "parties" && m === "GET") {
      const state = await readGuest();
      return ok({
        parties: [
          {
            id: "party-1",
            name: "Harbor League",
            platform: "Trade and open ports",
            memberCount: 3,
            joined: state.partyId === "party-1",
          },
        ],
      });
    }
    if (a === "parties" && m === "POST") {
      return mutate((state) => {
        const name = (body as { name?: string })?.name?.trim() || "Guest Party";
        state.partyId = "party-guest";
        state.partyName = name;
        return ok({ ok: true });
      });
    }
    if (a === "parties" && b === "join" && m === "POST") {
      return mutate((state) => {
        state.partyId = "party-1";
        state.partyName = "Harbor League";
        return ok({ ok: true });
      });
    }
    if (a === "elections" && m === "GET") {
      return ok({
        franchiseNote: "National ID required to vote or run in this country.",
        elections: [
          {
            id: "elect-1",
            office: "Harbor Warden",
            status: "open",
            closesAt: new Date(Date.now() + 86_400_000).toISOString(),
            candidates: [
              { characterId: "npc-cand-1", name: "Mira Sol" },
              { characterId: "guest-character", name: "Guest Traveler" },
            ],
          },
        ],
      });
    }
    if (a === "elections" && b === "open" && m === "POST") {
      return ok({ office: "Harbor Warden", closesAt: new Date(Date.now() + 86_400_000).toISOString() });
    }
    if (a === "offices" && m === "GET") {
      return ok({
        offices: [{ id: "office-1", title: "Harbor Warden", holderName: "Mira Sol" }],
      });
    }
    if (a === "laws" && m === "GET") {
      const state = await readGuest();
      return ok({
        laws: state.laws,
        effectCatalog: [
          {
            key: "property_tax_cents_per_day",
            label: "Property tax (cents/day)",
            description: "Collected from parcel owners on the world tick.",
          },
        ],
      });
    }
    if (a === "laws" && m === "POST") {
      return mutate((state) => {
        const input = body as { title?: string; body?: string; effectKey?: string; effectValue?: string };
        state.laws.unshift({
          id: `law-${Date.now()}`,
          title: input.title || "New law",
          body: input.body || "",
          effectKey: input.effectKey ?? null,
          effectValue: input.effectValue ?? null,
        });
        return ok({ ok: true });
      });
    }
    if (a === "vote" && m === "POST") {
      return mutate((state) => {
        if (!state.nationalIds.length) {
          return err("Citizenship (national ID) required to vote in this country");
        }
        return ok({ ok: true });
      });
    }
    if (a === "candidacy" && m === "POST") {
      return mutate((state) => {
        if (!state.nationalIds.length) {
          return err("Citizenship (national ID) required to run");
        }
        return ok({ ok: true });
      });
    }
  }

  if (root === "world") {
    if (a === "treaties" && m === "GET") {
      return ok({
        treaties: [
          {
            id: "t-1",
            title: "Coastal Trade Compact",
            body: "Bulletin only — no player diplomacy actions yet.",
            signedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
          },
        ],
      });
    }
    if (a === "sanctions" && m === "GET") return ok({ sanctions: [] });
    if (a === "military" && m === "GET") {
      return ok({
        units: [
          {
            id: "mil-1",
            countryName: "Orbis Free State",
            name: "Harbor Guard",
            districtName: "Harbor Ward",
            strength: 40,
          },
        ],
      });
    }
    if (a === "wars" && m === "GET") return ok({ wars: [] });
    if (a === "environment" && m === "GET") {
      return ok({
        metrics: [
          {
            districtName: "Harbor Ward",
            cityName: "Port Orbis",
            pollution: 12,
            measuredAt: new Date().toISOString(),
          },
        ],
      });
    }
    if (a === "crimes" && m === "GET") {
      const state = await readGuest();
      return ok({ crimes: state.crimes });
    }
    if (a === "crimes" && m === "POST") {
      return mutate((state) => {
        const input = body as { accusedCharacterId?: string; kind?: string };
        const kind = input.kind?.trim() || "theft";
        const crime = {
          id: `crime-${Date.now()}`,
          accusedName: "Accused",
          kind,
          districtName: state.districtName,
          status: "reported",
          createdAt: new Date().toISOString(),
        };
        state.crimes.unshift(crime);
        state.courts.unshift({
          id: `court-${Date.now()}`,
          crimeKind: kind,
          accusedName: "Accused",
          status: "fined",
          verdict: "summary fine",
          fineCents: 500,
        });
        return ok({
          ok: true,
          crime,
          note: "Court case opened; summary fine attempted.",
        });
      });
    }
    if (a === "courts" && m === "GET") {
      const state = await readGuest();
      return ok({ cases: state.courts });
    }
    if (a === "npcs" && m === "GET") {
      return ok({
        npcs: [
          {
            id: "npc-1",
            name: "Asha Reed",
            role: "Farmhand",
            districtName: "River Fields",
          },
          {
            id: "npc-cand-1",
            name: "Mira Sol",
            role: "Harbor Warden",
            districtName: "Harbor Ward",
          },
        ],
      });
    }
    if (a === "pathogens" && m === "GET") {
      return ok({
        pathogens: [{ id: "path-1", name: "Harbor Fever", severity: 2 }],
      });
    }
  }

  if (root === "assets") {
    if (a === "portfolio" && m === "GET") {
      return ok({
        vehicles: [],
        vessels: [],
        aircraft: [],
        note: "Vessel/aircraft assets do not unlock travel modes yet.",
      });
    }
    if (a === "market" && m === "GET") {
      return ok({
        listings: [
          {
            id: "asset-1",
            kind: "vehicle",
            name: "Utility cart",
            priceCents: 8000,
            sellerName: "Yard Sales",
          },
        ],
      });
    }
    if (a === "buy" && m === "POST") {
      return mutate((state) => {
        if (state.balanceCents < 8000) return err("Not enough money");
        state.balanceCents -= 8000;
        return ok({ ok: true });
      });
    }
  }

  if (root === "social") {
    if (a === "profile" && m === "GET") {
      const state = await readGuest();
      return ok({
        username: state.username,
        displayName: state.name,
        bio: state.profileBio,
      });
    }
    if (a === "profile" && m === "PATCH") {
      return mutate((state) => {
        const bio = (body as { bio?: string })?.bio;
        if (typeof bio === "string") state.profileBio = bio;
        return ok({ ok: true });
      });
    }
    if (a === "inbox" && m === "GET") return ok({ messages: [] });
    if (a === "notifications" && m === "GET") {
      return ok({
        notifications: [
          {
            id: "n-1",
            body: "Preview guest session ready — no login required.",
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }
    if (a === "notifications" && b === "read" && m === "POST") return ok({ ok: true });
    if (a === "dm" && m === "POST") return ok({ ok: true });
    if (a === "block" && m === "POST") return ok({ ok: true });
    if (a === "channels" && m === "GET") return ok({ messages: [] });
  }

  if (root === "organizations") {
    if (!a && m === "GET") {
      return ok({
        organizations: [
          { id: "org-1", name: "Harbor Guild", kind: "civic", memberCount: 4 },
        ],
      });
    }
    if (!a && m === "POST") return ok({ ok: true });
    if (a === "join" && m === "POST") return ok({ ok: true });
    if (a === "leave" && m === "POST") return ok({ ok: true });
  }

  if (root === "map") {
    if (a === "resources" && b === "types" && m === "GET") {
      return ok([
        { key: "soil", name: "Soil", unit: "u", heatmapColor: "#8b5a2b" },
        { key: "timber", name: "Timber", unit: "u", heatmapColor: "#2f6b3a" },
      ]);
    }
    if (a === "search" && m === "GET") {
      const q = (searchParams.get("q") || "").toLowerCase();
      const hits = [
        {
          type: "district",
          id: "district-harbor",
          name: "Harbor Ward",
          latitude: 45.4642,
          longitude: 9.19,
        },
        {
          type: "district",
          id: "district-fields",
          name: "River Fields",
          latitude: 45.48,
          longitude: 9.21,
        },
      ].filter((h) => !q || h.name.toLowerCase().includes(q));
      return ok(hits);
    }
    if (a === "parcels" && m === "GET") {
      return ok([]);
    }
    if (a === "parcels" && b && m === "GET") {
      return ok({
        id: b,
        label: "Parcel",
        districtName: "Harbor Ward",
        cityName: "Port Orbis",
      });
    }
    if (a === "resources" && m === "GET") {
      return ok([]);
    }
    if (a === "grid" && m === "GET") {
      return ok({ features: [], areaM2: 100, cellSizeM: 10 });
    }
    if (a === "countries" && m === "GET") {
      return ok({
        countries: [{ id: "c-1", name: "Orbis Free State", code: "OFS" }],
      });
    }
    if (a === "places" && m === "GET") return ok({ places: [] });
  }

  if (root === "admin" && m === "POST") {
    return mutate((state) => {
      state.balanceCents += 10_000;
      return ok({ ok: true, balanceCents: state.balanceCents });
    });
  }

  return err(`Preview guest API has no handler for ${m} /${path}`, 404);
}

export { GUEST_COOKIE };
