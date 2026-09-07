import {
  createDb,
  outbox,
  worldClock,
  worldEvents,
  travelTrips,
  characters,
  employments,
  bankAccounts,
  ledgerEntries,
  jobPostings,
  productionOrders,
  inventories,
  pathogens,
  characterHealth,
  characterSkills,
  characterStudy,
  parcelOwnerships,
  elections,
  votes,
  governmentOffices,
  and,
  eq,
  isNull,
  lte,
  sql,
  syncPresenceOnDistrictMove,
} from "@orbis/db";
import { WorldEventType } from "@orbis/contracts";
import {
  HUNGER_DRAIN_PER_HOUR,
  THIRST_DRAIN_PER_HOUR,
  ENERGY_DRAIN_PER_HOUR,
  FOOD_RESTORE,
  WATER_RESTORE,
  FOOD_ENERGY_BONUS,
  STARVATION_HP_PER_HOUR,
  DEHYDRATION_HP_PER_HOUR,
  CRITICAL_HUNGER,
  CRITICAL_THIRST,
} from "@orbis/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

function xpPerHour(mode: string) {
  if (mode === "tutoring") return 35;
  if (mode === "university") return 100;
  if (mode === "job") return 5; // passive on-the-job sector practice
  return 10; // self_study
}

function xpToNextLevel(level: number) {
  return Math.floor(100 * Math.pow(Math.max(0, level) + 1, 2));
}

/** Unlock skill if needed and bank XP (milli-XP in progress_ms). Returns levels gained. */
async function applySkillXpGain(
  db: ReturnType<typeof createDb>,
  characterId: string,
  skillKey: string,
  xpGain: number,
  now: Date,
) {
  if (xpGain <= 0) return 0;

  await db.execute(sql`
    INSERT INTO character_skills (character_id, skill_key, level, progress_ms, experience, unlocked_at, updated_at)
    VALUES (${characterId}::uuid, ${skillKey}, 0, 0, 0, now(), now())
    ON CONFLICT (character_id, skill_key) DO NOTHING
  `);

  const [skill] = await db
    .select()
    .from(characterSkills)
    .where(
      and(eq(characterSkills.characterId, characterId), eq(characterSkills.skillKey, skillKey)),
    )
    .limit(1);
  if (!skill) return 0;

  let milli = skill.progressMs + Math.floor(xpGain * 1000);
  let experience = skill.experience + Math.floor(milli / 1000);
  milli = milli % 1000;
  let level = skill.level;
  let gainedLevels = 0;
  while (experience >= xpToNextLevel(level) && level < 100) {
    experience -= xpToNextLevel(level);
    level += 1;
    gainedLevels += 1;
  }

  await db
    .update(characterSkills)
    .set({
      experience,
      progressMs: milli,
      level,
      updatedAt: new Date(),
    })
    .where(eq(characterSkills.id, skill.id));

  if (gainedLevels > 0) {
    const [event] = await db
      .insert(worldEvents)
      .values({
        type: WorldEventType.SkillLevelGained,
        payload: {
          skillKey,
          fromLevel: skill.level,
          toLevel: level,
          via: "xp_gain",
        },
        actorCharacterId: characterId,
        subjectType: "character",
        subjectId: characterId,
        simTime: now,
      })
      .returning();
    if (event) await db.insert(outbox).values({ eventId: event.id });
  }

  return gainedLevels;
}

export async function advanceWorldClock(
  db: ReturnType<typeof createDb>,
  ratio: number,
  elapsedMs: number,
) {
  const deltaMs = Math.max(0, Math.floor(elapsedMs * ratio));

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(8421501)`);

    const [clock] = await tx.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
    if (!clock) {
      throw new Error("world_clock row missing — run migrations and seed");
    }

    const now = new Date();
    const nextSim = new Date(clock.simTime.getTime() + deltaMs);
    const nextVersion = clock.tickVersion + 1;

    const [updated] = await tx
      .update(worldClock)
      .set({
        simTime: nextSim,
        lastTickAt: now,
        tickVersion: nextVersion,
      })
      .where(and(eq(worldClock.id, 1), eq(worldClock.tickVersion, clock.tickVersion)))
      .returning();

    if (!updated) {
      return { applied: false as const, tickVersion: clock.tickVersion, deltaMs: 0, simTime: clock.simTime };
    }

    const [event] = await tx
      .insert(worldEvents)
      .values({
        type: WorldEventType.WorldTick,
        payload: { tickVersion: nextVersion, simTime: nextSim.toISOString() },
        simTime: nextSim,
        subjectType: "world",
      })
      .returning();

    if (event) {
      await tx.insert(outbox).values({ eventId: event.id });
    }

    return { applied: true as const, tickVersion: nextVersion, simTime: nextSim, deltaMs };
  });
}

export async function completeTravelArrivals(db: ReturnType<typeof createDb>) {
  const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
  if (!clock) return { completed: 0 };

  const due = await db
    .select()
    .from(travelTrips)
    .where(
      and(eq(travelTrips.status, "in_transit"), lte(travelTrips.arrivesAt, clock.simTime)),
    )
    .limit(50);

  let completed = 0;
  for (const trip of due) {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(travelTrips)
        .set({ status: "arrived", completedAt: clock.simTime })
        .where(and(eq(travelTrips.id, trip.id), eq(travelTrips.status, "in_transit")))
        .returning();
      if (!claimed) return;

      await tx
        .update(characters)
        .set({
          locationDistrictId: trip.toDistrictId,
          ...(trip.toLat != null && trip.toLng != null
            ? { latitude: trip.toLat, longitude: trip.toLng }
            : {}),
        })
        .where(eq(characters.id, trip.characterId));

      await syncPresenceOnDistrictMove(
        tx,
        trip.characterId,
        trip.fromDistrictId,
        trip.toDistrictId,
        clock.simTime,
      );

      const [event] = await tx
        .insert(worldEvents)
        .values({
          type: WorldEventType.TravelArrived,
          payload: {
            tripId: trip.id,
            fromDistrictId: trip.fromDistrictId,
            toDistrictId: trip.toDistrictId,
            mode: trip.mode,
            toLat: trip.toLat,
            toLng: trip.toLng,
            destinationLabel: trip.destinationLabel,
          },
          actorCharacterId: trip.characterId,
          subjectType: "travel_trip",
          subjectId: trip.id,
          simTime: clock.simTime,
        })
        .returning();
      if (event) await tx.insert(outbox).values({ eventId: event.id });

      const [moved] = await tx
        .insert(worldEvents)
        .values({
          type: WorldEventType.PlayerMoved,
          payload: {
            fromDistrictId: trip.fromDistrictId,
            toDistrictId: trip.toDistrictId,
            via: "travel",
            mode: trip.mode,
            latitude: trip.toLat,
            longitude: trip.toLng,
          },
          actorCharacterId: trip.characterId,
          subjectType: "character",
          subjectId: trip.characterId,
          simTime: clock.simTime,
        })
        .returning();
      if (moved) await tx.insert(outbox).values({ eventId: moved.id });
    });
    completed += 1;
  }

  return { completed };
}

export async function processPayroll(
  db: ReturnType<typeof createDb>,
  deltaMs: number,
  tickVersion: number,
) {
  if (deltaMs <= 0) return { paid: 0, totalCents: 0 };

  const active = await db
    .select({
      employmentId: employments.id,
      characterId: employments.characterId,
      salaryCentsPerDay: employments.salaryCentsPerDay,
      jobPostingId: employments.jobPostingId,
      requiredSkillKey: jobPostings.requiredSkillKey,
    })
    .from(employments)
    .leftJoin(jobPostings, eq(employments.jobPostingId, jobPostings.id))
    .where(isNull(employments.endedAt));

  let paid = 0;
  let totalCents = 0;

  for (const job of active) {
    if (job.requiredSkillKey) {
      const jobXp = (xpPerHour("job") * deltaMs) / HOUR_MS;
      await applySkillXpGain(db, job.characterId, job.requiredSkillKey, jobXp, new Date());
    }

    const amount = Math.floor((job.salaryCentsPerDay * deltaMs) / DAY_MS);
    if (amount <= 0) continue;

    const tickKey = `payroll:${job.employmentId}:tick:${tickVersion}`;

    await db.transaction(async (tx) => {
      let [wallet] = await tx
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.characterId, job.characterId))
        .limit(1);
      if (!wallet) {
        [wallet] = await tx
          .insert(bankAccounts)
          .values({ characterId: job.characterId, balanceCents: 0 })
          .returning();
      }
      if (!wallet) return;

      await tx
        .update(bankAccounts)
        .set({
          balanceCents: wallet.balanceCents + amount,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, wallet.id));

      await tx.insert(ledgerEntries).values({
        idempotencyKey: tickKey,
        fromAccountId: null,
        toAccountId: wallet.id,
        amountCents: amount,
        reason: "salary",
        metadata: { employmentId: job.employmentId },
      });
    });

    paid += 1;
    totalCents += amount;
  }

  return { paid, totalCents };
}

/** Grant XP to whoever is studying. deltaMs is sim time (accelerated). */
export async function processStudyXp(db: ReturnType<typeof createDb>, deltaMs: number) {
  if (deltaMs <= 0) return { students: 0, leveled: 0 };

  const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
  const now = clock?.simTime ?? new Date();

  const students = await db
    .select()
    .from(characterStudy)
    .where(sql`${characterStudy.focusSkillKey} IS NOT NULL`);

  let leveled = 0;
  for (const study of students) {
    if (!study.focusSkillKey) continue;

    const mode = study.buffMode || "self_study";
    const gain = (xpPerHour(mode) * deltaMs) / HOUR_MS;
    if (gain <= 0) continue;

    leveled += await applySkillXpGain(db, study.characterId, study.focusSkillKey, gain, now);
  }

  return { students: students.length, leveled: leveled > 0 ? leveled : 0 };
}

function periodMs(period: string | null) {
  switch (period) {
    case "day":
      return DAY_MS;
    case "month":
      return MONTH_MS;
    case "year":
      return YEAR_MS;
    case "week":
    default:
      return WEEK_MS;
  }
}

function buffPeriodCostCents(mode: string, period: string | null, skillLevel: number) {
  const tier = skillLevel + 1;
  const table: Record<string, Record<string, number>> = {
    tutoring: { day: 12_000, week: 75_000, month: 250_000, year: 2_500_000 },
    university: { day: 45_000, week: 300_000, month: 1_000_000, year: 10_000_000 },
  };
  const prices = table[mode] ?? table.tutoring!;
  return (prices[period ?? "week"] ?? prices.week!) * tier;
}

/**
 * Renew tutoring/university subscriptions. First period was paid upfront;
 * each due period charges again. Insufficient funds → drop to self-study.
 */
export async function processStudySubscriptions(db: ReturnType<typeof createDb>) {
  const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
  const now = clock?.simTime ?? new Date();

  const due = await db
    .select()
    .from(characterStudy)
    .where(
      and(
        sql`${characterStudy.buffMode} IN ('tutoring', 'university')`,
        sql`${characterStudy.nextBillingAt} IS NOT NULL`,
        lte(characterStudy.nextBillingAt, now),
      ),
    )
    .limit(100);

  let renewed = 0;
  let cancelled = 0;

  for (const study of due) {
    if (!study.focusSkillKey || !study.nextBillingAt) continue;

    const [skill] = await db
      .select()
      .from(characterSkills)
      .where(
        and(
          eq(characterSkills.characterId, study.characterId),
          eq(characterSkills.skillKey, study.focusSkillKey),
        ),
      )
      .limit(1);
    const level = skill?.level ?? 0;
    const amount = buffPeriodCostCents(study.buffMode, study.buffPeriod, level);
    const idempotencyKey = `skill-sub-renew:${study.characterId}:${study.buffMode}:${study.nextBillingAt.toISOString()}`;

    const paid = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${study.characterId}))`);

      let [wallet] = await tx
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.characterId, study.characterId))
        .limit(1);
      if (!wallet || wallet.balanceCents < amount) {
        await tx
          .update(characterStudy)
          .set({
            buffMode: "self_study",
            buffPeriod: null,
            nextBillingAt: null,
            buffExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(characterStudy.characterId, study.characterId));
        return false;
      }

      const [existing] = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        await tx
          .update(characterStudy)
          .set({
            nextBillingAt: new Date(study.nextBillingAt!.getTime() + periodMs(study.buffPeriod)),
            updatedAt: new Date(),
          })
          .where(eq(characterStudy.characterId, study.characterId));
        return true;
      }

      await tx
        .update(bankAccounts)
        .set({
          balanceCents: wallet.balanceCents - amount,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, wallet.id));

      await tx.insert(ledgerEntries).values({
        idempotencyKey,
        fromAccountId: wallet.id,
        toAccountId: null,
        amountCents: amount,
        reason: `skill_${study.buffMode}_subscription`,
        metadata: {
          skillKey: study.focusSkillKey,
          mode: study.buffMode,
          period: study.buffPeriod,
          billing: "renewal",
        },
      });

      await tx.execute(sql`
        INSERT INTO system_accounts (key, balance_cents)
        VALUES ('world_treasury', ${amount})
        ON CONFLICT (key) DO UPDATE
        SET balance_cents = system_accounts.balance_cents + ${amount}, updated_at = now()
      `);

      await tx
        .update(characterStudy)
        .set({
          nextBillingAt: new Date(study.nextBillingAt!.getTime() + periodMs(study.buffPeriod)),
          updatedAt: new Date(),
        })
        .where(eq(characterStudy.characterId, study.characterId));

      return true;
    });

    if (paid) renewed += 1;
    else cancelled += 1;
  }

  return { due: due.length, renewed, cancelled };
}

export async function processProduction(db: ReturnType<typeof createDb>) {
  const queued = await db
    .select()
    .from(productionOrders)
    .where(eq(productionOrders.status, "queued"))
    .limit(20);

  let completed = 0;
  for (const order of queued) {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(productionOrders)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(eq(productionOrders.id, order.id), eq(productionOrders.status, "queued")))
        .returning();
      if (!claimed) return;

      await tx
        .insert(inventories)
        .values({
          ownerType: "company",
          ownerId: order.companyId,
          itemKey: order.productKey,
          quantity: order.quantity,
        })
        .onConflictDoUpdate({
          target: [inventories.ownerType, inventories.ownerId, inventories.itemKey],
          set: { quantity: sql`${inventories.quantity} + ${order.quantity}` },
        });
    });
    completed += 1;
  }
  return { completed };
}

export async function processInfections(db: ReturnType<typeof createDb>, tickVersion: number) {
  const pathogenRows = await db.select().from(pathogens).limit(10);
  if (pathogenRows.length === 0) return { newlyInfected: 0, damaged: 0 };

  const alive = await db
    .select({
      id: characters.id,
      districtId: characters.locationDistrictId,
      infected: characterHealth.infectedPathogenKey,
      vaccinated: characterHealth.vaccinatedPathogenKey,
      hp: characterHealth.hp,
    })
    .from(characters)
    .leftJoin(characterHealth, eq(characterHealth.characterId, characters.id))
    .where(eq(characters.status, "alive"));

  let newlyInfected = 0;
  let damaged = 0;

  for (const person of alive) {
    if (!person.districtId) continue;
    if (!person.hp && person.hp !== 0) {
      await db.insert(characterHealth).values({ characterId: person.id }).onConflictDoNothing();
    }
  }

  const refreshed = await db
    .select({
      id: characters.id,
      districtId: characters.locationDistrictId,
      infected: characterHealth.infectedPathogenKey,
      vaccinated: characterHealth.vaccinatedPathogenKey,
      hp: characterHealth.hp,
    })
    .from(characters)
    .innerJoin(characterHealth, eq(characterHealth.characterId, characters.id))
    .where(eq(characters.status, "alive"));

  const byDistrict = new Map<string, typeof refreshed>();
  for (const p of refreshed) {
    if (!p.districtId) continue;
    const list = byDistrict.get(p.districtId) ?? [];
    list.push(p);
    byDistrict.set(p.districtId, list);
  }

  for (const [, people] of byDistrict) {
    const infectedPeople = people.filter((p) => p.infected);
    if (infectedPeople.length === 0) {
      // seed chance for outbreak
      if (Math.random() < 0.02 && people.length > 0) {
        const victim = people[Math.floor(Math.random() * people.length)]!;
        const pathogen = pathogenRows[Math.floor(Math.random() * pathogenRows.length)]!;
        if (victim.vaccinated === pathogen.key) continue;
        await db
          .update(characterHealth)
          .set({
            infectedPathogenKey: pathogen.key,
            infectedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(characterHealth.characterId, victim.id));
        newlyInfected += 1;
        const [event] = await db
          .insert(worldEvents)
          .values({
            type: WorldEventType.Infected,
            payload: { characterId: victim.id, pathogenKey: pathogen.key, tickVersion },
            actorCharacterId: victim.id,
            subjectType: "character",
            subjectId: victim.id,
          })
          .returning();
        if (event) await db.insert(outbox).values({ eventId: event.id });
      }
      continue;
    }

    for (const carrier of infectedPeople) {
      const pathogen = pathogenRows.find((p) => p.key === carrier.infected);
      if (!pathogen) continue;
      for (const other of people) {
        if (other.id === carrier.id || other.infected) continue;
        if (other.vaccinated === pathogen.key) continue;
        const chance = pathogen.transmissibility / 1000;
        if (Math.random() < chance) {
          await db
            .update(characterHealth)
            .set({
              infectedPathogenKey: pathogen.key,
              infectedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(characterHealth.characterId, other.id));
          newlyInfected += 1;
        }
      }
      const dmg = Math.max(1, Math.floor(pathogen.severity / 5));
      await db
        .update(characterHealth)
        .set({
          hp: sql`GREATEST(1, ${characterHealth.hp} - ${dmg})`,
          updatedAt: new Date(),
        })
        .where(eq(characterHealth.characterId, carrier.id));
      damaged += 1;
    }
  }

  return { newlyInfected, damaged };
}

function clampStat(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Drain hunger/thirst/energy; auto-eat/drink from inventory; HP damage when critical. */
export async function processNeeds(db: ReturnType<typeof createDb>, deltaMs: number) {
  if (deltaMs <= 0) return { characters: 0, autoAte: 0, autoDrank: 0, damaged: 0, died: 0 };

  const hours = deltaMs / HOUR_MS;
  const living = await db
    .select({
      characterId: characters.id,
      health: characterHealth,
    })
    .from(characters)
    .innerJoin(characterHealth, eq(characterHealth.characterId, characters.id))
    .where(eq(characters.status, "alive"));

  let autoAte = 0;
  let autoDrank = 0;
  let damaged = 0;
  let died = 0;

  for (const row of living) {
    let hunger = row.health.hunger - HUNGER_DRAIN_PER_HOUR * hours;
    let thirst = row.health.thirst - THIRST_DRAIN_PER_HOUR * hours;
    let energy = row.health.energy - ENERGY_DRAIN_PER_HOUR * hours;
    let hp = row.health.hp;

    if (hunger < 55) {
      const [food] = await db
        .select()
        .from(inventories)
        .where(
          and(
            eq(inventories.ownerType, "character"),
            eq(inventories.ownerId, row.characterId),
            eq(inventories.itemKey, "food"),
          ),
        )
        .limit(1);
      if (food && food.quantity > 0) {
        await db
          .update(inventories)
          .set({ quantity: food.quantity - 1 })
          .where(eq(inventories.id, food.id));
        hunger += FOOD_RESTORE;
        energy += FOOD_ENERGY_BONUS;
        autoAte += 1;
      }
    }

    if (thirst < 55) {
      const [water] = await db
        .select()
        .from(inventories)
        .where(
          and(
            eq(inventories.ownerType, "character"),
            eq(inventories.ownerId, row.characterId),
            eq(inventories.itemKey, "water"),
          ),
        )
        .limit(1);
      if (water && water.quantity > 0) {
        await db
          .update(inventories)
          .set({ quantity: water.quantity - 1 })
          .where(eq(inventories.id, water.id));
        thirst += WATER_RESTORE;
        autoDrank += 1;
      }
    }

    hunger = clampStat(hunger, 0, row.health.maxHunger);
    thirst = clampStat(thirst, 0, row.health.maxThirst);
    energy = clampStat(energy, 0, row.health.maxEnergy);

    if (hunger < CRITICAL_HUNGER) {
      hp -= STARVATION_HP_PER_HOUR * hours * (hunger <= 0 ? 1.5 : 1);
    }
    if (thirst < CRITICAL_THIRST) {
      hp -= DEHYDRATION_HP_PER_HOUR * hours * (thirst <= 0 ? 1.5 : 1);
    }
    hp = clampStat(hp, 0, row.health.maxHp);
    if (hp < row.health.hp) damaged += 1;

    await db
      .update(characterHealth)
      .set({
        hunger,
        thirst,
        energy,
        hp,
        updatedAt: new Date(),
      })
      .where(eq(characterHealth.characterId, row.characterId));

    if (hp <= 0) {
      const cause =
        thirst <= 0 ? "dehydration" : hunger <= 0 ? "starvation" : "exposure";
      await db
        .update(characters)
        .set({
          status: "dead",
          diedAt: new Date(),
          causeOfDeath: cause,
        })
        .where(and(eq(characters.id, row.characterId), eq(characters.status, "alive")));

      const [event] = await db
        .insert(worldEvents)
        .values({
          type: WorldEventType.CharacterDied,
          payload: { cause, hunger, thirst, energy },
          actorCharacterId: row.characterId,
          subjectType: "character",
          subjectId: row.characterId,
          simTime: new Date(),
        })
        .returning();
      if (event) await db.insert(outbox).values({ eventId: event.id });
      died += 1;
    }
  }

  return { characters: living.length, autoAte, autoDrank, damaged, died };
}

export async function processPropertyTax(
  db: ReturnType<typeof createDb>,
  deltaMs: number,
  tickVersion: number,
) {
  if (deltaMs < DAY_MS / 24) return { taxed: 0 };
  // Charge a tiny daily property tax once per ~sim-day chunk using tick cadence
  const taxPerDay = 200;
  const amount = Math.floor((taxPerDay * deltaMs) / DAY_MS);
  if (amount <= 0) return { taxed: 0 };

  const owners = await db.select().from(parcelOwnerships);
  let taxed = 0;
  for (const own of owners) {
    if (!own.ownerCharacterId) continue;
    const key = `property-tax:${own.parcelId}:tick:${tickVersion}`;
    try {
      await db.transaction(async (tx) => {
        const [wallet] = await tx
          .select()
          .from(bankAccounts)
          .where(eq(bankAccounts.characterId, own.ownerCharacterId!))
          .limit(1);
        if (!wallet || wallet.balanceCents < amount) return;

        await tx
          .update(bankAccounts)
          .set({ balanceCents: wallet.balanceCents - amount, updatedAt: new Date() })
          .where(eq(bankAccounts.id, wallet.id));
        await tx.insert(ledgerEntries).values({
          idempotencyKey: key,
          fromAccountId: wallet.id,
          toAccountId: null,
          amountCents: amount,
          reason: "property_tax",
          metadata: { parcelId: own.parcelId },
        });
        await tx.execute(sql`
          INSERT INTO system_accounts (key, balance_cents)
          VALUES ('world_treasury', ${amount})
          ON CONFLICT (key) DO UPDATE SET balance_cents = system_accounts.balance_cents + ${amount}, updated_at = now()
        `);
      });
      taxed += 1;
    } catch {
      // idempotency conflict — skip
    }
  }
  return { taxed };
}

/** Passive resource yield from owned land sitting on deposits. */
export async function processLandResources(
  db: ReturnType<typeof createDb>,
  deltaMs: number,
) {
  if (deltaMs <= 0) return { parcels: 0, units: 0 };

  const owned = await db.execute(sql`
    SELECT
      po.owner_character_id as "characterId",
      lp.id as "parcelId",
      ST_Y(ST_Centroid(lp.geom))::float8 as lat,
      ST_X(ST_Centroid(lp.geom))::float8 as lng
    FROM parcel_ownerships po
    INNER JOIN land_parcels lp ON lp.id = po.parcel_id
    WHERE po.owner_character_id IS NOT NULL
  `);
  const parcels = Array.isArray(owned)
    ? owned
    : ((owned as { rows?: Array<Record<string, unknown>> }).rows ?? []);

  let touched = 0;
  let units = 0;
  const hours = deltaMs / HOUR_MS;

  for (const parcel of parcels as Array<{
    characterId: string;
    parcelId: string;
    lat: number;
    lng: number;
  }>) {
    const deps = await db.execute(sql`
      SELECT
        rd.id as id,
        rd.resource_key as "resourceKey",
        rd.richness::float8 as richness,
        rd.remaining_units as remaining
      FROM resource_deposits rd
      WHERE rd.remaining_units > 0
        AND ST_DWithin(
          rd.geom::geography,
          ST_SetSRID(ST_MakePoint(${parcel.lng}, ${parcel.lat}), 4326)::geography,
          rd.radius_m
        )
      LIMIT 8
    `);
    const depRows = Array.isArray(deps)
      ? deps
      : ((deps as { rows?: Array<Record<string, unknown>> }).rows ?? []);
    if (depRows.length === 0) continue;

    for (const dep of depRows as Array<{
      id: string;
      resourceKey: string;
      richness: number;
      remaining: number;
    }>) {
      // ~richness/10 units per hour at peak; floors for short ticks
      const gain = Math.floor((dep.richness / 10) * hours);
      if (gain <= 0) continue;
      const take = Math.min(gain, dep.remaining);
      if (take <= 0) continue;

      await db.execute(sql`
        UPDATE resource_deposits
        SET remaining_units = remaining_units - ${take}
        WHERE id = ${dep.id}::uuid AND remaining_units >= ${take}
      `);

      await db
        .insert(inventories)
        .values({
          ownerType: "character",
          ownerId: parcel.characterId,
          itemKey: dep.resourceKey,
          quantity: take,
        })
        .onConflictDoUpdate({
          target: [inventories.ownerType, inventories.ownerId, inventories.itemKey],
          set: { quantity: sql`${inventories.quantity} + ${take}` },
        });

      units += take;
    }
    touched += 1;
  }

  return { parcels: touched, units };
}

export async function closeDueElections(db: ReturnType<typeof createDb>) {
  const [clock] = await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1);
  if (!clock) return { closed: 0 };

  const due = await db
    .select()
    .from(elections)
    .where(and(eq(elections.status, "open"), lte(elections.closesAt, clock.simTime)))
    .limit(10);

  let closed = 0;
  for (const election of due) {
    const tallies = await db.execute(sql`
      SELECT candidate_character_id as id, count(*)::int as votes
      FROM votes WHERE election_id = ${election.id}::uuid
      GROUP BY candidate_character_id
      ORDER BY votes DESC
      LIMIT 1
    `);
    const rows = Array.isArray(tallies)
      ? tallies
      : ((tallies as { rows?: { id: string; votes: number }[] }).rows ?? []);
    const winner = rows[0] as { id?: string } | undefined;

    await db.update(elections).set({ status: "closed" }).where(eq(elections.id, election.id));
    if (winner?.id) {
      await db
        .insert(governmentOffices)
        .values({
          countryId: election.countryId,
          office: election.office,
          holderCharacterId: winner.id,
        })
        .onConflictDoUpdate({
          target: [governmentOffices.countryId, governmentOffices.office],
          set: { holderCharacterId: winner.id, sinceAt: new Date() },
        });
    }
    const [event] = await db
      .insert(worldEvents)
      .values({
        type: WorldEventType.ElectionClosed,
        payload: { electionId: election.id, winnerCharacterId: winner?.id ?? null },
        subjectType: "election",
        subjectId: election.id,
        simTime: clock.simTime,
      })
      .returning();
    if (event) await db.insert(outbox).values({ eventId: event.id });
    closed += 1;
  }
  return { closed };
}

export async function driftEnvironment(db: ReturnType<typeof createDb>) {
  await db.execute(sql`
    UPDATE environment_metrics
    SET pollution = LEAST(100, GREATEST(0, pollution + (CASE WHEN random() < 0.5 THEN 1 ELSE -1 END))),
        measured_at = now()
    WHERE id IN (SELECT id FROM environment_metrics ORDER BY measured_at ASC LIMIT 20)
  `);
  return { ok: true };
}

export async function publishOutbox(db: ReturnType<typeof createDb>) {
  const unpublished = await db
    .select()
    .from(outbox)
    .where(isNull(outbox.publishedAt))
    .limit(100);

  let published = 0;
  for (const row of unpublished) {
    await db
      .update(outbox)
      .set({ publishedAt: new Date() })
      .where(and(eq(outbox.id, row.id), isNull(outbox.publishedAt)));
    published += 1;
  }
  return published;
}
