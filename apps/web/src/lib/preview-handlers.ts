import { SKILL_CATALOG, SUPPLY_PRICES_CENTS } from "@orbis/contracts";
import {
  OPEN_JOBS,
  defaultGuestState,
  jobById,
  readGuest,
  writeGuest,
  xpToNext,
  type GuestState,
} from "./preview-guest";
import {
  CITIZENSHIP_RESIDENCY_GAME_DAYS,
  activeLawValue,
  addInv,
  advanceGuestSim,
  citizenshipEligible,
  fineForCrimeKind,
  fitnessBlock,
  hasShelter,
  invQty,
  presenceGameDays,
  productionQuantity,
  pushLedger,
  syncSupplyCounters,
  takeInv,
  toSupplyKey,
} from "./preview-sim";

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

async function withSim(
  update: (state: GuestState) => HandlerResult | Promise<HandlerResult>,
  opts?: { persist?: boolean },
) {
  const state = advanceGuestSim(await readGuest());
  const result = await update(state);
  const persist = opts?.persist !== false;
  if (persist && !result.clearGuest && (result.status ?? 200) < 400) {
    await writeGuest(state);
  } else if (persist && (result.status ?? 200) < 400) {
    // still persist sim advance on reads
    await writeGuest(state);
  } else if ((result.status ?? 200) < 400 || opts?.persist) {
    await writeGuest(state);
  } else {
    // Failed mutation: still persist clock advance so time doesn't freeze on errors
    await writeGuest(state);
  }
  return result;
}

async function mutate(update: (state: GuestState) => HandlerResult | Promise<HandlerResult>) {
  return withSim(update);
}

async function readSim(update: (state: GuestState) => HandlerResult | Promise<HandlerResult>) {
  return withSim(update);
}

function requireAlive(state: GuestState): HandlerResult | null {
  if (state.status === "dead") {
    return err(
      `Character is dead (${state.causeOfDeath ?? "unknown"}). Start a new guest session (logout) to retry.`,
      400,
    );
  }
  return null;
}

function destMeta(districtId: string) {
  if (districtId === "district-fields") {
    return {
      districtId: "district-fields",
      districtName: "River Fields",
      cityName: "Port Orbis",
      lat: 45.48,
      lng: 9.21,
      distanceM: 1800,
    };
  }
  return {
    districtId: "district-harbor",
    districtName: "Harbor Ward",
    cityName: "Port Orbis",
    lat: 45.4642,
    lng: 9.19,
    distanceM: 900,
  };
}

function travelQuote(state: GuestState, toDistrictId: string) {
  const dest = destMeta(toDistrictId);
  const same = toDistrictId === state.locationDistrictId;
  const distanceM = same ? 200 : dest.distanceM;
  const mode = state.hasVehicle ? "drive" : "walk";
  const speedKmh = state.hasVehicle ? 40 : 5;
  const durationMs = Math.max(60_000, Math.round((distanceM / 1000 / speedKmh) * 3_600_000));
  const costCents = state.hasVehicle ? Math.max(50, Math.round(distanceM / 20)) : 0;
  return {
    mode,
    distanceM,
    durationMs,
    durationLabel:
      durationMs >= 3_600_000
        ? `${(durationMs / 3_600_000).toFixed(1)} h`
        : `${Math.round(durationMs / 60_000)} min`,
    costCents,
    speedKmh,
    hasVehicle: state.hasVehicle,
    note: state.hasVehicle
      ? "Vehicle owned — fuel cost and driving speed apply. Arrival when travel time elapses."
      : "Walking — free but slow. Buy a utility cart under Assets to drive. Arrival when travel time elapses.",
    to: { ...dest, label: dest.districtName },
  };
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
    return ok({ ok: true, service: "orbis-preview-guest", sim: true });
  }

  if (root === "auth") {
    if (a === "me" && m === "GET") {
      return readSim((state) =>
        ok({
          id: state.id,
          email: state.email,
          username: state.username,
          emailVerified: true,
          previewGuest: true,
          characterStatus: state.status,
        }),
      );
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
          state.election.candidates = state.election.candidates.map((c) =>
            c.characterId === "guest-character" ? { ...c, name: state.name } : c,
          );
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
    return readSim((state) => {
      const job = jobById(state.jobId);
      return ok({
        id: state.characterId,
        name: state.name,
        status: state.status,
        causeOfDeath: state.causeOfDeath,
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
        hasShelter: hasShelter(state),
        simNote:
          "Preview cookie sim advances when you play (4 real hours ≈ 1 game day). Wages, tax, loans, hunger, and disease run on that clock.",
      });
    });
  }

  if (root === "economy" && a === "wallet" && m === "GET") {
    return readSim((state) =>
      ok({
        balanceCents: state.balanceCents,
        currency: "ORB",
        recent: state.ledger ?? [],
      }),
    );
  }

  if (root === "jobs") {
    if (!a && m === "GET") {
      return readSim((state) => {
        const fit = fitnessBlock(state, "work");
        return ok({
          characterId: state.characterId,
          locationDistrictId: state.locationDistrictId,
          fitnessOk: !fit,
          fitnessNote: fit,
          jobs: OPEN_JOBS.map((job) => {
            const have = job.requiredSkillKey
              ? (state.skills[job.requiredSkillKey]?.level ?? 0)
              : 0;
            const skillOk = !job.requiredSkillKey || have >= job.requiredSkillLevel;
            const locationOk =
              job.districtName === state.districtName || Boolean(job.isWorldGovernment);
            return {
              ...job,
              eligible: skillOk && locationOk && state.jobId !== job.id && !fit && state.status === "alive",
              skillOk,
              locationOk,
              yourSkillLevel: have,
            };
          }),
        });
      });
    }
    if (a === "mine" && m === "GET") {
      return readSim((state) => {
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
      });
    }
    if (a === "apply" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const fit = fitnessBlock(state, "work");
        if (fit) return err(fit);
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
        if (!job.isWorldGovernment && job.districtName !== state.districtName) {
          return err(`You must be in ${job.districtName} to take this job`);
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
      return readSim((state) =>
        ok({
          study: {
            focusSkillKey: state.focusSkillKey,
            buffMode: state.buffMode,
            buffPeriod: null,
            nextBillingAt: null,
            xpPerHour:
              state.buffMode === "university" ? 100 : state.buffMode === "tutoring" ? 35 : 10,
            rates: { self_study: 10, tutoring: 35, university: 100 },
            subscriptionPrices: {
              tutoring: moneyPeriod(),
              university: moneyPeriod(),
            },
          },
          skills: skillRows(state),
        }),
      );
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
            tutoring: { xpPerHour: 35, ...moneyPeriod() },
            university: { xpPerHour: 100, ...moneyPeriod() },
          },
        })),
      });
    }
    if (a === "focus" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const key = (body as { skillKey?: string })?.skillKey ?? null;
        state.focusSkillKey = key;
        if (key && !state.skills[key]) state.skills[key] = { level: 0, experience: 0 };
        return ok({ ok: true });
      });
    }
    if (a === "buff" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const mode = (body as { mode?: string })?.mode ?? "self_study";
        state.buffMode = mode;
        if (mode !== "self_study") {
          if (state.balanceCents < 100) return err("Need 1.00 ORB to start paid study");
          state.balanceCents -= 100;
          pushLedger(state, 100, `Enroll ${mode}`, "debit");
        }
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
      return readSim((state) => {
        const inFields = state.districtName === "River Fields";
        return ok({
          characterId: state.characterId,
          status: state.status,
          causeOfDeath: state.causeOfDeath,
          hp: state.hp,
          maxHp: 100,
          hunger: state.hunger,
          maxHunger: 100,
          thirst: state.thirst,
          maxThirst: 100,
          energy: state.energy,
          maxEnergy: 100,
          infectedPathogenKey: state.infectedPathogenKey,
          vaccinatedPathogenKey: state.vaccinatedPathogenKey,
          supplies: { food: invQty(state, "food"), water: invQty(state, "water") },
          prices: { food: SUPPLY_PRICES_CENTS.food, water: SUPPLY_PRICES_CENTS.water },
          infection: state.infectedPathogenKey
            ? { pathogenKey: state.infectedPathogenKey, infectedAt: state.infectedAt }
            : null,
          shelter: hasShelter(state),
          environment: {
            biome: inFields ? "river farmland" : "temperate coast",
            districtName: state.districtName,
            cityName: state.cityName,
            canBuyFood: !inFields,
            canBuyWater: true,
            canForageFood: inFields,
            canForageWater: inFields,
            nearFertileSoil: inFields,
            note: inFields
              ? "Fertile soil — forage food/water. Shops are in Harbor Ward."
              : "Harbor shops sell rations. Forage inland at River Fields.",
          },
        });
      });
    }
    if (a === "consume" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const input = body as { itemKey?: string; kind?: string; quantity?: number };
        const key = input.itemKey || input.kind || "food";
        const qty = Math.max(1, Number(input.quantity ?? 1));
        const supply = toSupplyKey(key);
        if (!supply) return err("Not edible/drinkable");
        if (!takeInv(state, supply, qty)) return err(`Not enough ${supply}`);
        if (supply === "food") {
          state.hunger = Math.min(100, state.hunger + 35 * qty);
          state.energy = Math.min(100, state.energy + 5 * qty);
        } else {
          state.thirst = Math.min(100, state.thirst + 40 * qty);
        }
        syncSupplyCounters(state);
        return ok({ ok: true, supplies: { food: state.food, water: state.water } });
      });
    }
    if (a === "buy-supplies" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const input = body as { itemKey?: string; kind?: string; quantity?: number };
        const key = toSupplyKey(input.itemKey || input.kind || "food");
        if (!key) return err("Unknown supply");
        if (key === "food" && state.districtName === "River Fields") {
          return err("No food shops in River Fields — travel to Harbor Ward or forage");
        }
        const qty = Math.max(1, Number(input.quantity ?? 1));
        const cost = SUPPLY_PRICES_CENTS[key] * qty;
        if (state.balanceCents < cost) return err("Not enough money");
        state.balanceCents -= cost;
        pushLedger(state, cost, `Bought ${key} x${qty}`, "debit");
        addInv(state, key, qty);
        return ok({ ok: true });
      });
    }
    if (a === "forage" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const fit = fitnessBlock(state, "forage");
        if (fit) return err(fit);
        if (state.districtName !== "River Fields") {
          return err("Foraging only works near fertile soil (River Fields)");
        }
        const input = body as { itemKey?: string; kind?: string };
        const key = toSupplyKey(input.itemKey || input.kind || "food") ?? "food";
        state.energy = Math.max(0, state.energy - 10);
        addInv(state, key, 1);
        return ok({ ok: true });
      });
    }
    if (a === "treat" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const input = body as { kind?: string };
        if (input.kind === "vaccine") {
          const cost = 8000;
          if (state.balanceCents < cost) return err("Vaccine costs 80.00 ORB");
          state.balanceCents -= cost;
          pushLedger(state, cost, "Vaccine (Harbor Fever)", "debit");
          state.vaccinatedPathogenKey = "harbor_fever";
          return ok({ ok: true, vaccinatedPathogenKey: "harbor_fever" });
        }
        const cost = 5000;
        if (state.balanceCents < cost) return err("Clinic treatment costs 50.00 ORB");
        state.balanceCents -= cost;
        pushLedger(state, cost, "Clinic treatment", "debit");
        state.infectedPathogenKey = null;
        state.infectedAt = null;
        state.hp = 100;
        return ok({ ok: true });
      });
    }
  }

  if (root === "identity" && a === "me" && m === "GET") {
    return readSim((state) => {
      const now = Date.now();
      const days = presenceGameDays(state, now);
      return ok({
        passport: { passportNumber: "WG-GUEST00001" },
        nationalIds: state.nationalIds,
        presence: {
          districtName: state.districtName,
          cityName: state.cityName,
          countryName: state.countryName,
          gameDays: Math.floor(days * 10) / 10,
          residencyRequiredGameDays: CITIZENSHIP_RESIDENCY_GAME_DAYS,
          eligibleForCitizenship: citizenshipEligible(state, now) && !state.nationalIds.length,
        },
      });
    });
  }

  if (root === "identity" && a === "citizenship" && b === "apply" && m === "POST") {
    return mutate((state) => {
      const dead = requireAlive(state);
      if (dead) return dead;
      const now = Date.now();
      if (!citizenshipEligible(state, now)) {
        return err(
          `Need ${CITIZENSHIP_RESIDENCY_GAME_DAYS} game day of presence (you have ${presenceGameDays(state, now).toFixed(2)})`,
        );
      }
      if (state.balanceCents < 1000) return err("Application fee is 10 ORB");
      state.balanceCents -= 1000;
      pushLedger(state, 1000, "Citizenship application", "debit");
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
      return readSim((state) => {
        const quote = state.travel
          ? null
          : travelQuote(
              state,
              state.locationDistrictId === "district-harbor"
                ? "district-fields"
                : "district-harbor",
            );
        return ok({
          hasVehicle: state.hasVehicle,
          position: { lat: 45.4642, lng: 9.19 },
          location: {
            districtId: state.locationDistrictId,
            districtName: state.districtName,
            cityName: state.cityName,
          },
          fitnessNote: fitnessBlock(state, "travel"),
          trip: state.travel
            ? {
                id: "trip-1",
                arrivesAt: state.travel.arrivesAt,
                costCents: state.travel.costCents,
                status: state.travel.status,
                mode: state.travel.mode,
                distanceM: quote?.distanceM ?? 1200,
                destinationLabel: state.travel.destinationLabel,
                durationLabel: `${Math.round(state.travel.durationMs / 60_000)} min`,
                toLat: 45.47,
                toLng: 9.2,
              }
            : null,
        });
      });
    }
    if (a === "destinations" && m === "GET") {
      return readSim((state) => {
        const ids = ["district-fields", "district-harbor"];
        return ok({
          destinations: ids.map((id) => {
            const q = travelQuote(state, id);
            const dest = destMeta(id);
            return {
              districtId: dest.districtId,
              districtName: dest.districtName,
              cityName: dest.cityName,
              cityLat: dest.lat,
              cityLng: dest.lng,
              costCents: q.costCents,
              durationLabel: q.durationLabel,
              label: dest.districtName,
              mode: q.mode,
              distanceM: q.distanceM,
            };
          }),
        });
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
      return readSim((state) => {
        const destId =
          (body as { toDistrictId?: string })?.toDistrictId ||
          (state.locationDistrictId === "district-harbor"
            ? "district-fields"
            : "district-harbor");
        return ok(travelQuote(state, destId));
      });
    }
    if (!a && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const fit = fitnessBlock(state, "travel");
        if (fit) return err(fit);
        if (state.travel?.status === "in_transit") return err("Already traveling");
        const destId =
          (body as { toDistrictId?: string })?.toDistrictId ||
          (state.locationDistrictId === "district-harbor"
            ? "district-fields"
            : "district-harbor");
        const dest = destMeta(destId);
        const quote = travelQuote(state, destId);
        if (state.balanceCents < quote.costCents) return err("Not enough money for fuel");
        if (quote.costCents > 0) {
          state.balanceCents -= quote.costCents;
          pushLedger(state, quote.costCents, "Travel fuel", "debit");
        }
        state.energy = Math.max(0, state.energy - (state.hasVehicle ? 2 : 8));
        const arrivesAt = new Date(Date.now() + quote.durationMs).toISOString();
        state.travel = {
          arrivesAt,
          toDistrictId: dest.districtId,
          toDistrictName: dest.districtName,
          toCityName: dest.cityName,
          status: "in_transit",
          destinationLabel: dest.districtName,
          mode: quote.mode,
          costCents: quote.costCents,
          durationMs: quote.durationMs,
        };
        return ok({
          ok: true,
          arrivesAt,
          note: `In transit to ${dest.districtName}. Location updates when travel time elapses.`,
        });
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
      return readSim((state) =>
        ok({
          parcels: state.properties.map((p) => ({
            parcelId: p.id,
            label: p.label,
            districtName: p.districtName,
            cityName: p.cityName,
            areaM2: p.areaM2,
            buildings: p.buildings,
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
          shelter: hasShelter(state),
          taxNote: "Active property_tax_cents_per_day law is collected as sim time advances.",
        }),
      );
    }
    if (a === "building-types" && m === "GET") {
      return ok({
        types: [
          {
            key: "shed",
            name: "Shed",
            costCents: 1500,
            effect: "Cuts hunger drain 25% and energy drain 50% while owned (shelter).",
          },
        ],
      });
    }
    if (a === "buy" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (state.balanceCents < 5000) return err("Not enough money");
        state.balanceCents -= 5000;
        pushLedger(state, 5000, "Land purchase", "debit");
        state.properties.push({
          id: `parcel-${state.properties.length + 1}`,
          label: "River plot",
          districtName: "River Fields",
          cityName: "Port Orbis",
          areaM2: 400,
          buildings: [],
        });
        return ok({ ok: true });
      });
    }
    if (a === "buy-cell" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const price = 2500;
        if (state.balanceCents < price) return err("Not enough money");
        state.balanceCents -= price;
        pushLedger(state, price, "Land cell claim", "debit");
        const id = `cell-${state.properties.length + 1}`;
        state.properties.push({
          id,
          label: "Claimed cell",
          districtName: state.districtName,
          cityName: state.cityName,
          areaM2: 100,
          buildings: [],
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
        resources: [
          { resourceKey: "soil", resourceName: "Soil", richness: 40, unit: "u", label: null },
        ],
      });
    }
    if (a === "list" && m === "POST") return ok({ ok: true });
    if (a === "build" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (!state.properties.length) return err("Buy land before building");
        if (state.balanceCents < 1500) return err("Not enough money");
        state.balanceCents -= 1500;
        pushLedger(state, 1500, "Build shed", "debit");
        const parcel = state.properties[0]!;
        parcel.buildings.push({ type: "shed", name: "Shed" });
        return ok({
          ok: true,
          note: "Shed provides shelter — lower hunger/energy drain while you own it.",
        });
      });
    }
    if (a === "build-quote" && m === "POST") {
      return ok({
        costCents: 1500,
        durationLabel: "immediate (preview)",
        effect: "Shelter reduces survival drain",
      });
    }
  }

  if (root === "companies") {
    if (!a && m === "GET") {
      return readSim((state) =>
        ok({
          companies: state.companies.map((c) => ({
            id: c.id,
            name: c.name,
            description: "Guest company — treasury pays wages; skill scales production.",
            industry: c.industryKey,
            primarySkillKey: c.industryKey === "workshop" ? "manufacturing" : "agriculture",
            treasuryCents: c.treasuryCents,
            districtName: state.districtName,
            cityName: state.cityName,
            founderCharacterId: state.characterId,
            employeeCount: (c.employees ?? []).filter((e) => !e.endedAt).length,
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
        }),
      );
    }
    if (a === "mine" && m === "GET") {
      return readSim((state) =>
        ok({
          characterId: state.characterId,
          founded: state.companies.map((c) => ({
            id: c.id,
            name: c.name,
            treasuryCents: c.treasuryCents,
            industry: c.industryKey,
            primarySkillKey: c.industryKey === "workshop" ? "manufacturing" : "agriculture",
          })),
          shares: [],
          employment: state.companies.flatMap((c) =>
            (c.employees ?? [])
              .filter((e) => e.characterId === state.characterId && !e.endedAt)
              .map((e) => ({
                companyId: c.id,
                companyName: c.name,
                salaryCentsPerDay: e.salaryCentsPerDay,
              })),
          ),
        }),
      );
    }
    if (!a && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
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
        pushLedger(state, seed, "Company seed capital", "debit");
        const company = {
          id: `co-${state.companies.length + 1}`,
          name: input.name?.trim() || "Guest Co",
          industryKey: input.industryKey || input.industry || "farm",
          treasuryCents: seed,
          inventory: [] as Array<{ itemKey: string; quantity: number }>,
          employees: [
            {
              characterId: state.characterId,
              name: state.name,
              salaryCentsPerDay: 0,
              hiredAt: new Date().toISOString(),
              endedAt: null,
            },
          ],
        };
        state.companies.push(company);
        return ok({ ok: true, company });
      });
    }
    if (a === "produce" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const fit = fitnessBlock(state, "work");
        if (fit) return err(fit);
        const company = state.companies[0];
        if (!company) return err("No company");
        const skillKey =
          company.industryKey === "workshop" ? "manufacturing" : "agriculture";
        const level = state.skills[skillKey]?.level ?? 0;
        const qty = productionQuantity(level);
        const itemKey = company.industryKey === "workshop" ? "tools" : "grain";
        const laborCost = 50 * qty;
        if (company.treasuryCents < laborCost) {
          return err("Company treasury cannot cover production inputs");
        }
        company.treasuryCents -= laborCost;
        const existing = company.inventory.find((i) => i.itemKey === itemKey);
        if (existing) existing.quantity += qty;
        else company.inventory.push({ itemKey, quantity: qty });
        state.energy = Math.max(0, state.energy - 5);
        return ok({
          ok: true,
          produced: { itemKey, quantity: qty },
          note: `Yield scaled by ${skillKey} level ${level}. Withdraw grain/tools to inventory; grain converts to food when used as supply.`,
        });
      });
    }
    if (a === "withdraw" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const input = body as { itemKey?: string; quantity?: number; companyId?: string };
        const company =
          state.companies.find((c) => c.id === input.companyId) ?? state.companies[0];
        if (!company) return err("No company");
        const item = input.itemKey
          ? company.inventory.find((i) => i.itemKey === input.itemKey)
          : company.inventory[0];
        if (!item) return err("Nothing to withdraw");
        const qty = Math.min(item.quantity, Math.max(1, Number(input.quantity ?? item.quantity)));
        item.quantity -= qty;
        company.inventory = company.inventory.filter((i) => i.quantity > 0);
        addInv(state, item.itemKey, qty);
        return ok({ ok: true, itemKey: toSupplyKey(item.itemKey) ?? item.itemKey, quantity: qty });
      });
    }
    if (a === "hire" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const company = state.companies[0];
        if (!company) return err("No company");
        const salary = Number((body as { salaryCentsPerDay?: number })?.salaryCentsPerDay ?? 2000);
        const already = (company.employees ?? []).some(
          (e) => e.characterId === "npc-1" && !e.endedAt,
        );
        if (already) return err("Asha Reed already employed");
        company.employees.push({
          characterId: "npc-1",
          name: "Asha Reed",
          salaryCentsPerDay: salary,
          hiredAt: new Date().toISOString(),
          endedAt: null,
        });
        return ok({
          ok: true,
          note: `Hired Asha Reed at ${(salary / 100).toFixed(2)} ORB/day from company treasury. Insolvent treasury ends employment.`,
        });
      });
    }
    if (a && m === "GET" && b === "talent") {
      return ok({
        primarySkillKey: "agriculture",
        note: "Preview talent pool.",
        candidates: [{ characterId: "npc-1", name: "Asha Reed", skillLevel: 2 }],
      });
    }
    if (a && m === "GET") {
      return readSim((state) => {
        const company = state.companies.find((c) => c.id === a) ?? state.companies[0];
        if (!company) return err("Company not found", 404);
        const skillKey =
          company.industryKey === "workshop" ? "manufacturing" : "agriculture";
        const workers = (company.employees ?? []).filter((e) => !e.endedAt);
        return ok({
          id: company.id,
          name: company.name,
          yieldMultiplier: 1 + (state.skills[skillKey]?.level ?? 0) * 0.2,
          inventory: company.inventory,
          treasuryCents: company.treasuryCents,
          note: "Treasury pays wages on the preview sim clock.",
          workforce: {
            skillKey,
            avgSkillLevel: state.skills[skillKey]?.level ?? 0,
            workerCount: workers.length,
            members: workers.map((w) => ({
              characterName: w.name,
              skillLevel: w.characterId === state.characterId ? state.skills[skillKey]?.level ?? 0 : 2,
              isFounder: w.characterId === state.characterId,
              salaryCentsPerDay: w.salaryCentsPerDay,
            })),
          },
        });
      });
    }
  }

  if (root === "markets") {
    if (a === "listings" && m === "GET") {
      return readSim((state) => ok({ listings: state.marketListings }));
    }
    if (a === "listings" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const input = body as { itemKey?: string; quantity?: number; priceCents?: number };
        const qty = Number(input.quantity ?? 0);
        const price = Number(input.priceCents ?? 0);
        const key = String(input.itemKey ?? "");
        if (!takeInv(state, key, qty)) return err("Not enough inventory");
        state.marketListings.push({
          id: `listing-${Date.now()}`,
          itemKey: key,
          quantity: qty,
          priceCents: price,
          sellerName: state.name,
        });
        return ok({ ok: true });
      });
    }
    if (a === "buy" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const input = body as { listingId?: string; quantity?: number };
        const listing = state.marketListings.find((l) => l.id === input.listingId);
        const qty = Number(input.quantity ?? 1);
        if (!listing) return err("Listing not found", 404);
        const subtotal = listing.priceCents * qty;
        const salesTaxBps = activeLawValue(state, "sales_tax_bps") ?? 0;
        const tax = Math.floor((subtotal * salesTaxBps) / 10_000);
        const cost = subtotal + tax;
        if (state.balanceCents < cost) return err("Not enough money");
        state.balanceCents -= cost;
        pushLedger(
          state,
          cost,
          tax > 0 ? `Market buy + sales tax (${salesTaxBps} bps)` : "Market buy",
          "debit",
        );
        listing.quantity -= qty;
        if (listing.quantity <= 0) {
          state.marketListings = state.marketListings.filter((l) => l.id !== listing.id);
        }
        addInv(state, listing.itemKey, qty);
        return ok({ ok: true, paidCents: cost, taxCents: tax });
      });
    }
    if (a === "loans" && b === "mine" && m === "GET") {
      return readSim((state) => ok({ loans: state.loans }));
    }
    if (a === "loans" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const amount = Number((body as { amountCents?: number })?.amountCents ?? 0);
        if (amount < 1000) return err("Minimum loan is 10 ORB");
        if (state.loans.some((l) => l.status === "active")) {
          return err("Pay or resolve your active loan first");
        }
        state.balanceCents += amount;
        pushLedger(state, amount, "Loan disbursement", "credit");
        state.loans.push({
          id: `loan-${Date.now()}`,
          principalCents: amount,
          balanceCents: amount,
          interestBps: 500,
          status: "active",
        });
        return ok({
          ok: true,
          note: "Interest accrues and payments debit your wallet as sim time advances. Unpaid → default.",
        });
      });
    }
  }

  if (root === "politics") {
    if (a === "parties" && m === "GET") {
      return readSim((state) =>
        ok({
          parties: [
            {
              id: "party-1",
              name: "Harbor League",
              platform: "Trade and open ports (platform text is cosmetic; law effects matter).",
              memberCount: 3,
              joined: state.partyId === "party-1",
            },
            ...(state.partyId === "party-guest"
              ? [
                  {
                    id: "party-guest",
                    name: state.partyName || "Guest Party",
                    platform: "Your party",
                    memberCount: 1,
                    joined: true,
                  },
                ]
              : []),
          ],
        }),
      );
    }
    if (a === "parties" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (!state.nationalIds.length) return err("Citizenship required to found a party");
        const name = (body as { name?: string })?.name?.trim() || "Guest Party";
        state.partyId = "party-guest";
        state.partyName = name;
        return ok({ ok: true });
      });
    }
    if (a === "parties" && b === "join" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (!state.nationalIds.length) return err("Citizenship required to join a party");
        state.partyId = "party-1";
        state.partyName = "Harbor League";
        return ok({ ok: true });
      });
    }
    if (a === "elections" && m === "GET") {
      return readSim((state) =>
        ok({
          franchiseNote: "National ID required to vote or run in this country.",
          elections: [
            {
              id: state.election.id,
              office: state.election.office,
              status: state.election.status,
              closesAt: state.election.closesAt,
              candidates: state.election.candidates,
              voteCount: state.election.votes.length,
              winnerCharacterId: state.election.winnerCharacterId,
            },
          ],
        }),
      );
    }
    if (a === "elections" && b === "open" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (state.office.holderCharacterId !== state.characterId) {
          return err("Only the sitting office-holder can open an election");
        }
        const closesAt = new Date(Date.now() + 86_400_000).toISOString();
        state.election = {
          id: `elect-${Date.now()}`,
          office: state.office.title,
          status: "open",
          closesAt,
          candidates: [
            { characterId: state.characterId, name: state.name },
            { characterId: "npc-cand-1", name: "Mira Sol" },
          ],
          votes: [],
          winnerCharacterId: null,
        };
        return ok({ office: state.office.title, closesAt });
      });
    }
    if (a === "offices" && m === "GET") {
      return readSim((state) =>
        ok({
          offices: [
            {
              id: state.office.id,
              title: state.office.title,
              holderName: state.office.holderName,
              holderCharacterId: state.office.holderCharacterId,
              youHoldOffice: state.office.holderCharacterId === state.characterId,
            },
          ],
        }),
      );
    }
    if (a === "laws" && m === "GET") {
      return readSim((state) =>
        ok({
          laws: state.laws,
          canEnact: state.office.holderCharacterId === state.characterId,
          effectCatalog: [
            {
              key: "property_tax_cents_per_day",
              label: "Property tax (cents/day)",
              description: "Collected from parcel owners as sim time advances.",
            },
            {
              key: "sales_tax_bps",
              label: "Sales tax (basis points)",
              description: "Added to market purchase price (100 bps = 1%).",
            },
          ],
        }),
      );
    }
    if (a === "laws" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (state.office.holderCharacterId !== state.characterId) {
          return err("Only the Harbor Warden (office-holder) may enact laws");
        }
        const input = body as {
          title?: string;
          body?: string;
          effectKey?: string;
          effectValue?: string | number;
        };
        state.laws.unshift({
          id: `law-${Date.now()}`,
          title: input.title || "New law",
          body: input.body || "",
          effectKey: input.effectKey ?? null,
          effectValue:
            input.effectValue === undefined || input.effectValue === null
              ? null
              : String(input.effectValue),
        });
        return ok({ ok: true });
      });
    }
    if (a === "vote" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (!state.nationalIds.length) {
          return err("Citizenship (national ID) required to vote in this country");
        }
        if (state.election.status !== "open") return err("No open election");
        if (state.election.votes.some((v) => v.voterId === state.characterId)) {
          return err("Already voted");
        }
        const candidateId =
          (body as { candidateCharacterId?: string })?.candidateCharacterId ||
          state.election.candidates[0]?.characterId;
        if (!candidateId) return err("No candidate");
        state.election.votes.push({
          voterId: state.characterId,
          candidateCharacterId: candidateId,
        });
        return ok({ ok: true, votesCast: state.election.votes.length });
      });
    }
    if (a === "candidacy" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        if (!state.nationalIds.length) {
          return err("Citizenship (national ID) required to run");
        }
        if (state.election.status !== "open") return err("No open election");
        if (!state.election.candidates.some((c) => c.characterId === state.characterId)) {
          state.election.candidates.push({
            characterId: state.characterId,
            name: state.name,
          });
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
            note: "Passive drift — not player-controlled.",
          },
        ],
      });
    }
    if (a === "crimes" && m === "GET") {
      return readSim((state) => ok({ crimes: state.crimes }));
    }
    if (a === "crimes" && m === "POST") {
      return mutate((state) => {
        const dead = requireAlive(state);
        if (dead) return dead;
        const input = body as { accusedCharacterId?: string; kind?: string };
        const kind = input.kind?.trim() || "theft";
        const fineCents = fineForCrimeKind(kind);
        const selfAccuse =
          !input.accusedCharacterId ||
          input.accusedCharacterId === state.characterId ||
          input.accusedCharacterId === "guest-character";
        const accusedName = selfAccuse ? state.name : "Accused";
        const crime = {
          id: `crime-${Date.now()}`,
          accusedName,
          kind,
          districtName: state.districtName,
          status: "adjudicated",
          createdAt: new Date().toISOString(),
        };
        state.crimes.unshift(crime);
        let paid = 0;
        let verdict = "summary fine unpaid";
        let status = "judgment_unpaid";
        if (selfAccuse) {
          paid = Math.min(state.balanceCents, fineCents);
          state.balanceCents -= paid;
          if (paid > 0) pushLedger(state, paid, `Court fine (${kind})`, "debit");
          if (paid >= fineCents) {
            verdict = "summary fine paid";
            status = "resolved";
          } else {
            verdict = `summary fine partial (${paid}/${fineCents}¢)`;
          }
        }
        state.courts.unshift({
          id: `court-${Date.now()}`,
          crimeKind: kind,
          accusedName,
          status,
          verdict,
          fineCents,
        });
        state.crimes = state.crimes.slice(0, 8);
        state.courts = state.courts.slice(0, 8);
        return ok({
          ok: true,
          crime,
          fineCents,
          paidCents: paid,
          note: "Summary justice: court case opened and fine attempted against the accused wallet.",
        });
      });
    }
    if (a === "courts" && m === "GET") {
      return readSim((state) => ok({ cases: state.courts }));
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
        pathogens: [
          {
            id: "path-1",
            key: "harbor_fever",
            name: "Harbor Fever",
            description: "Coastal flu. Vaccine blocks infection; untreated infection drains HP and can kill.",
            severity: 2,
            transmissibility: 40,
          },
        ],
      });
    }
  }

  if (root === "assets") {
    if (a === "portfolio" && m === "GET") {
      return readSim((state) =>
        ok({
          vehicles: state.hasVehicle
            ? [{ id: "veh-1", name: "Utility cart", category: "vehicle" }]
            : [],
          vessels: [],
          aircraft: [],
          note: "Vehicles unlock drive mode for travel. Vessel/aircraft do not unlock travel modes yet.",
        }),
      );
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
        const dead = requireAlive(state);
        if (dead) return dead;
        if (state.hasVehicle) return err("You already own a vehicle");
        if (state.balanceCents < 8000) return err("Not enough money");
        state.balanceCents -= 8000;
        pushLedger(state, 8000, "Bought utility cart", "debit");
        state.hasVehicle = true;
        return ok({ ok: true, note: "Travel quotes now use drive speed and fuel cost." });
      });
    }
  }

  if (root === "social") {
    if (a === "profile" && m === "GET") {
      return readSim((state) =>
        ok({
          username: state.username,
          displayName: state.name,
          bio: state.profileBio,
        }),
      );
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
      return readSim((state) =>
        ok({
          notifications: [
            {
              id: "n-1",
              body:
                state.status === "dead"
                  ? `You died of ${state.causeOfDeath}. Logout to start a new guest life.`
                  : "Preview guest sim running — wages, tax, hunger, and disease advance while you play.",
              read: false,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      );
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
          {
            id: "org-1",
            name: "Harbor Guild",
            kind: "civic",
            memberCount: 4,
            note: "Social history only — no ACL/power yet.",
          },
        ],
      });
    }
    if (!a && m === "POST") return ok({ ok: true, note: "Membership recorded; no powers yet." });
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
    if (a === "parcels" && m === "GET") return ok([]);
    if (a === "parcels" && b && m === "GET") {
      return ok({
        id: b,
        label: "Parcel",
        districtName: "Harbor Ward",
        cityName: "Port Orbis",
      });
    }
    if (a === "resources" && m === "GET") return ok([]);
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
      // Keep admin as intentional debug — label clearly so it doesn't feel like free money gameplay
      state.balanceCents += 10_000;
      pushLedger(state, 10_000, "Admin grant (debug — not earned)", "credit");
      return ok({
        ok: true,
        balanceCents: state.balanceCents,
        note: "Debug grant only — not a livelihood path.",
      });
    });
  }

  return err(`Preview guest API has no handler for ${m} /${path}`, 404);
}
