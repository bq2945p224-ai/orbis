import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  inet,
  doublePrecision,
  real,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** PostGIS geometry(Polygon, 4326) stored as EWKT/WKT via text round-trip helpers */
export const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Polygon, 4326)";
  },
  toDriver(value: string) {
    return value;
  },
  fromDriver(value: string) {
    return value;
  },
});

export const geometryPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
  toDriver(value: string) {
    return value;
  },
  fromDriver(value: string) {
    return value;
  },
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    username: varchar("username", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_email_lower_uidx").on(sql`lower(${t.email})`),
    uniqueIndex("accounts_username_lower_uidx").on(sql`lower(${t.username})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uidx").on(t.tokenHash),
    index("sessions_account_id_idx").on(t.accountId),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    email: varchar("email", { length: 320 }).notNull(),
    ip: inet("ip"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_created_idx").on(t.email, t.createdAt),
    index("login_attempts_ip_created_idx").on(t.ip, t.createdAt),
  ],
);

export const accountSecurityEvents = pgTable(
  "account_security_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    type: varchar("type", { length: 64 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_security_events_account_idx").on(t.accountId, t.createdAt)],
);

export const ipObservations = pgTable(
  "ip_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    ip: inet("ip").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    count: integer("count").notNull().default(1),
  },
  (t) => [
    uniqueIndex("ip_observations_account_ip_uidx").on(t.accountId, t.ip),
    index("ip_observations_ip_idx").on(t.ip),
    index("ip_observations_account_idx").on(t.accountId),
  ],
);

export const sharedIpLinks = pgTable(
  "shared_ip_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountAId: uuid("account_a_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    accountBId: uuid("account_b_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    evidenceStrength: integer("evidence_strength").notNull().default(1),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shared_ip_links_pair_uidx").on(t.accountAId, t.accountBId),
    index("shared_ip_links_a_idx").on(t.accountAId),
    index("shared_ip_links_b_idx").on(t.accountBId),
  ],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_verification_tokens_hash_uidx").on(t.tokenHash)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_tokens_hash_uidx").on(t.tokenHash)],
);

export const countries = pgTable("countries", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  /** Real-time days of physical presence required before national ID / citizenship. */
  citizenshipResidencyDays: integer("citizenship_residency_days").notNull().default(0),
  /** Must currently be inside the country to apply. */
  citizenshipRequiresPresence: boolean("citizenship_requires_presence").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const regions = pgTable("regions", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cities = pgTable("cities", {
  id: uuid("id").defaultRandom().primaryKey(),
  regionId: uuid("region_id")
    .notNull()
    .references(() => regions.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  /** temperate | mediterranean | desert | tropical | arctic */
  biome: varchar("biome", { length: 32 }).notNull().default("temperate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const districts = pgTable("districts", {
  id: uuid("id").defaultRandom().primaryKey(),
  cityId: uuid("city_id")
    .notNull()
    .references(() => cities.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  /** Local shops that sell food/water. False in deserts / remote outposts. */
  hasMarket: boolean("has_market").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const landParcels = pgTable(
  "land_parcels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id").references(() => countries.id),
    regionId: uuid("region_id").references(() => regions.id),
    cityId: uuid("city_id").references(() => cities.id),
    districtId: uuid("district_id").references(() => districts.id),
    geom: geometry("geom").notNull(),
    areaM2: integer("area_m2").notNull(),
    landType: varchar("land_type", { length: 64 }).notNull().default("urban"),
    zoning: varchar("zoning", { length: 64 }),
    label: varchar("label", { length: 128 }),
    /** Web Mercator 100m grid index (nullable for legacy urban lots). */
    gridIx: integer("grid_ix"),
    gridIy: integer("grid_iy"),
    /** Claim block size in meters (1, 10, 100, 1000). Indices are 1m-origin SW corner. */
    gridSizeM: integer("grid_size_m").notNull().default(100),
    elevationM: real("elevation_m"),
    terrain: varchar("terrain", { length: 32 }).notNull().default("unknown"),
    origin: varchar("origin", { length: 32 }).notNull().default("urban"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("land_parcels_district_idx").on(t.districtId),
    index("land_parcels_city_idx").on(t.cityId),
    uniqueIndex("land_parcels_grid_block_uidx")
      .on(t.gridIx, t.gridIy, t.gridSizeM)
      .where(sql`${t.gridIx} IS NOT NULL AND ${t.gridIy} IS NOT NULL`),
  ],
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("alive"),
    locationDistrictId: uuid("location_district_id").references(() => districts.id),
    /** Precise ground position (WGS84). Falls back to city center when null. */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    diedAt: timestamp("died_at", { withTimezone: true }),
    causeOfDeath: text("cause_of_death"),
  },
  (t) => [
    uniqueIndex("characters_one_alive_per_account_uidx")
      .on(t.accountId)
      .where(sql`${t.status} = 'alive'`),
    index("characters_account_idx").on(t.accountId),
    index("characters_location_idx").on(t.locationDistrictId),
  ],
);

export const worldClock = pgTable("world_clock", {
  id: integer("id").primaryKey().default(1),
  simTime: timestamp("sim_time", { withTimezone: true }).notNull().defaultNow(),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }).notNull().defaultNow(),
  tickVersion: bigint("tick_version", { mode: "number" }).notNull().default(0),
});

export const worldEvents = pgTable(
  "world_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    actorCharacterId: uuid("actor_character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    subjectType: varchar("subject_type", { length: 64 }),
    subjectId: uuid("subject_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    simTime: timestamp("sim_time", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("world_events_type_created_idx").on(t.type, t.createdAt),
    index("world_events_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action: varchar("action", { length: 64 }).notNull(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    ip: inet("ip"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_action_created_idx").on(t.action, t.createdAt),
    index("audit_log_account_idx").on(t.accountId),
  ],
);

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => worldEvents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [index("outbox_unpublished_idx").on(t.publishedAt, t.createdAt)],
);

/** Cash held by a character — balances are integer minor units (cents). */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    currency: varchar("currency", { length: 8 }).notNull().default("ORB"),
    balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bank_accounts_character_uidx").on(t.characterId)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    fromAccountId: uuid("from_account_id").references(() => bankAccounts.id),
    toAccountId: uuid("to_account_id").references(() => bankAccounts.id),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("ORB"),
    reason: varchar("reason", { length: 64 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_entries_idempotency_uidx").on(t.idempotencyKey),
    index("ledger_entries_from_idx").on(t.fromAccountId),
    index("ledger_entries_to_idx").on(t.toAccountId),
  ],
);

export const skillDefinitions = pgTable("skill_definitions", {
  key: varchar("key", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description").notNull().default(""),
  category: varchar("category", { length: 64 }).notNull().default("general"),
});

/** Continuous background study — XP accrues with sim time (default: 1 game day = 4 real hours). */
export const characterStudy = pgTable("character_study", {
  characterId: uuid("character_id")
    .primaryKey()
    .references(() => characters.id, { onDelete: "cascade" }),
  focusSkillKey: varchar("focus_skill_key", { length: 64 }).references(() => skillDefinitions.key),
  buffMode: varchar("buff_mode", { length: 32 }).notNull().default("self_study"),
  /** Recurring billing period while tutoring/university is active. */
  buffPeriod: varchar("buff_period", { length: 16 }),
  nextBillingAt: timestamp("next_billing_at", { withTimezone: true }),
  /** @deprecated Prefer nextBillingAt subscriptions; kept for migration compatibility. */
  buffExpiresAt: timestamp("buff_expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characterSkills = pgTable(
  "character_skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    skillKey: varchar("skill_key", { length: 64 })
      .notNull()
      .references(() => skillDefinitions.key),
    level: integer("level").notNull().default(0),
    /** Accumulated practice toward the next level (milliseconds of effective study). */
    progressMs: bigint("progress_ms", { mode: "number" }).notNull().default(0),
    experience: integer("experience").notNull().default(0),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("character_skills_unique_uidx").on(t.characterId, t.skillKey),
    index("character_skills_character_idx").on(t.characterId),
  ],
);

/** Deliberate study sessions — levels advance when sim time reaches completes_at. */
export const skillTrainingSessions = pgTable(
  "skill_training_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    skillKey: varchar("skill_key", { length: 64 })
      .notNull()
      .references(() => skillDefinitions.key),
    mode: varchar("mode", { length: 32 }).notNull(),
    fromLevel: integer("from_level").notNull(),
    toLevel: integer("to_level").notNull(),
    costCents: integer("cost_cents").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completesAt: timestamp("completes_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("in_progress"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("skill_training_sessions_character_idx").on(t.characterId),
    index("skill_training_sessions_status_completes_idx").on(t.status, t.completesAt),
    uniqueIndex("skill_training_one_active_uidx")
      .on(t.characterId)
      .where(sql`${t.status} = 'in_progress'`),
  ],
);

/** Phase 2 employers — later linked/migrated into full companies. */
export const employers = pgTable("employers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  districtId: uuid("district_id")
    .notNull()
    .references(() => districts.id),
  description: text("description").notNull().default(""),
  /** Stable key for system employers, e.g. world_government */
  systemKey: varchar("system_key", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 128 }).notNull(),
    description: text("description").notNull().default(""),
    requiredSkillKey: varchar("required_skill_key", { length: 64 }).references(
      () => skillDefinitions.key,
    ),
    requiredSkillLevel: integer("required_skill_level").notNull().default(0),
    salaryCentsPerDay: integer("salary_cents_per_day").notNull(),
    open: boolean("open").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_postings_employer_idx").on(t.employerId)],
);

export const employments = pgTable(
  "employments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => employers.id),
    jobPostingId: uuid("job_posting_id").references(() => jobPostings.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 128 }).notNull(),
    salaryCentsPerDay: integer("salary_cents_per_day").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: varchar("end_reason", { length: 64 }),
  },
  (t) => [
    index("employments_character_idx").on(t.characterId),
    uniqueIndex("employments_one_active_uidx")
      .on(t.characterId)
      .where(sql`${t.endedAt} IS NULL`),
  ],
);

export const travelTrips = pgTable(
  "travel_trips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    fromDistrictId: uuid("from_district_id")
      .notNull()
      .references(() => districts.id),
    toDistrictId: uuid("to_district_id")
      .notNull()
      .references(() => districts.id),
    costCents: integer("cost_cents").notNull(),
    departedAt: timestamp("departed_at", { withTimezone: true }).notNull(),
    arrivesAt: timestamp("arrives_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("in_transit"),
    mode: varchar("mode", { length: 16 }).notNull().default("walk"),
    fromLat: doublePrecision("from_lat"),
    fromLng: doublePrecision("from_lng"),
    toLat: doublePrecision("to_lat"),
    toLng: doublePrecision("to_lng"),
    distanceM: integer("distance_m"),
    destinationLabel: varchar("destination_label", { length: 256 }),
    toBuildingId: uuid("to_building_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("travel_trips_character_idx").on(t.characterId),
    index("travel_trips_status_arrives_idx").on(t.status, t.arrivesAt),
  ],
);

/** World treasury / system wallets (no character). */
export const systemAccounts = pgTable("system_accounts", {
  key: varchar("key", { length: 64 }).primaryKey(),
  balanceCents: bigint("balance_cents", { mode: "number" }).notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull().default("ORB"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// —— Phase 3: Property ——
export const parcelListings = pgTable(
  "parcel_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => landParcels.id, { onDelete: "cascade" }),
    sellerCharacterId: uuid("seller_character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    priceCents: integer("price_cents").notNull(),
    open: boolean("open").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parcel_listings_parcel_idx").on(t.parcelId)],
);

export const parcelOwnerships = pgTable(
  "parcel_ownerships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => landParcels.id, { onDelete: "cascade" }),
    ownerCharacterId: uuid("owner_character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    ownerCompanyId: uuid("owner_company_id"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    acquisition: varchar("acquisition", { length: 32 }).notNull().default("purchase"),
  },
  (t) => [
    uniqueIndex("parcel_ownerships_parcel_uidx").on(t.parcelId),
    index("parcel_ownerships_owner_char_idx").on(t.ownerCharacterId),
  ],
);

export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => landParcels.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    buildingType: varchar("building_type", { length: 64 }).notNull().default("structure"),
    condition: integer("condition").notNull().default(100),
    /** Human-readable address for travel / search. */
    address: varchar("address", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("buildings_parcel_idx").on(t.parcelId)],
);

export const propertyTransfers = pgTable(
  "property_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => landParcels.id),
    fromCharacterId: uuid("from_character_id").references(() => characters.id),
    toCharacterId: uuid("to_character_id").references(() => characters.id),
    priceCents: integer("price_cents").notNull().default(0),
    reason: varchar("reason", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("property_transfers_parcel_idx").on(t.parcelId)],
);

// —— Phase 4: Companies ——
export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  districtId: uuid("district_id")
    .notNull()
    .references(() => districts.id),
  founderCharacterId: uuid("founder_character_id")
    .notNull()
    .references(() => characters.id),
  treasuryCents: bigint("treasury_cents", { mode: "number" }).notNull().default(0),
  description: text("description").notNull().default(""),
  industry: varchar("industry", { length: 64 }).notNull().default("general"),
  primarySkillKey: varchar("primary_skill_key", { length: 64 }).references(
    () => skillDefinitions.key,
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyShares = pgTable(
  "company_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    shares: integer("shares").notNull().default(0),
  },
  (t) => [
    uniqueIndex("company_shares_unique_uidx").on(t.companyId, t.characterId),
    index("company_shares_character_idx").on(t.characterId),
  ],
);

export const companyEmployees = pgTable(
  "company_employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 128 }).notNull().default("Employee"),
    salaryCentsPerDay: integer("salary_cents_per_day").notNull().default(3000),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("company_employees_company_idx").on(t.companyId),
    uniqueIndex("company_employees_one_active_uidx")
      .on(t.characterId)
      .where(sql`${t.endedAt} IS NULL`),
  ],
);

export const productionOrders = pgTable(
  "production_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    productKey: varchar("product_key", { length: 64 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("production_orders_company_idx").on(t.companyId)],
);

export const inventories = pgTable(
  "inventories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerType: varchar("owner_type", { length: 32 }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    itemKey: varchar("item_key", { length: 64 }).notNull(),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [
    uniqueIndex("inventories_owner_item_uidx").on(t.ownerType, t.ownerId, t.itemKey),
  ],
);

// —— Phase 5: Social / communication ——
export const characterProfiles = pgTable("character_profiles", {
  characterId: uuid("character_id")
    .primaryKey()
    .references(() => characters.id, { onDelete: "cascade" }),
  bio: text("bio").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: varchar("kind", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  entityType: varchar("entity_type", { length: 64 }),
  entityId: uuid("entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channelMembers = pgTable(
  "channel_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("channel_members_unique_uidx").on(t.channelId, t.characterId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    senderCharacterId: uuid("sender_character_id")
      .notNull()
      .references(() => characters.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_channel_created_idx").on(t.channelId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_character_idx").on(t.characterId, t.createdAt)],
);

export const characterBlocks = pgTable(
  "character_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerCharacterId: uuid("blocker_character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    blockedCharacterId: uuid("blocked_character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("character_blocks_unique_uidx").on(t.blockerCharacterId, t.blockedCharacterId),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterAId: uuid("character_a_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    characterBId: uuid("character_b_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull().default("acquaintance"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("relationships_pair_uidx").on(t.characterAId, t.characterBId),
  ],
);

// —— Phase 6: Organizations ——
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  orgType: varchar("org_type", { length: 64 }).notNull().default("association"),
  districtId: uuid("district_id").references(() => districts.id),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 64 }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    index("org_memberships_org_idx").on(t.organizationId),
    uniqueIndex("org_memberships_active_uidx")
      .on(t.organizationId, t.characterId)
      .where(sql`${t.leftAt} IS NULL`),
  ],
);

// —— Phase 7: Politics ——
export const politicalParties = pgTable("political_parties", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id),
  platform: text("platform").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partyMembers = pgTable(
  "party_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => politicalParties.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("party_members_character_uidx").on(t.characterId)],
);

export const elections = pgTable("elections", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id),
  office: varchar("office", { length: 64 }).notNull().default("mayor"),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull().defaultNow(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const candidacies = pgTable(
  "candidacies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id),
    partyId: uuid("party_id").references(() => politicalParties.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("candidacies_unique_uidx").on(t.electionId, t.characterId)],
);

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    voterCharacterId: uuid("voter_character_id")
      .notNull()
      .references(() => characters.id),
    candidateCharacterId: uuid("candidate_character_id")
      .notNull()
      .references(() => characters.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("votes_one_per_voter_uidx").on(t.electionId, t.voterCharacterId)],
);

export const governmentOffices = pgTable(
  "government_offices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id),
    office: varchar("office", { length: 64 }).notNull(),
    holderCharacterId: uuid("holder_character_id").references(() => characters.id),
    sinceAt: timestamp("since_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("government_offices_country_office_uidx").on(t.countryId, t.office)],
);

export const laws = pgTable("laws", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id),
  title: varchar("title", { length: 128 }).notNull(),
  body: text("body").notNull(),
  enactedByCharacterId: uuid("enacted_by_character_id").references(() => characters.id),
  enactedAt: timestamp("enacted_at", { withTimezone: true }).notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
});

// —— Phase 8: Markets / loans / contracts ——
export const marketListings = pgTable(
  "market_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sellerCharacterId: uuid("seller_character_id").references(() => characters.id),
    sellerCompanyId: uuid("seller_company_id").references(() => companies.id),
    itemKey: varchar("item_key", { length: 64 }).notNull(),
    quantity: integer("quantity").notNull(),
    priceCentsEach: integer("price_cents_each").notNull(),
    open: boolean("open").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("market_listings_item_idx").on(t.itemKey)],
);

export const loans = pgTable("loans", {
  id: uuid("id").defaultRandom().primaryKey(),
  borrowerCharacterId: uuid("borrower_character_id")
    .notNull()
    .references(() => characters.id),
  principalCents: integer("principal_cents").notNull(),
  interestBps: integer("interest_bps").notNull().default(500),
  remainingCents: integer("remaining_cents").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const legalContracts = pgTable("legal_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 128 }).notNull(),
  body: text("body").notNull(),
  partyACharacterId: uuid("party_a_character_id")
    .notNull()
    .references(() => characters.id),
  partyBCharacterId: uuid("party_b_character_id")
    .notNull()
    .references(() => characters.id),
  status: varchar("status", { length: 16 }).notNull().default("proposed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// —— Phase 9–10: Health / disease ——
export const characterHealth = pgTable("character_health", {
  characterId: uuid("character_id")
    .primaryKey()
    .references(() => characters.id, { onDelete: "cascade" }),
  hp: integer("hp").notNull().default(100),
  maxHp: integer("max_hp").notNull().default(100),
  /** 100 = full, 0 = starving */
  hunger: integer("hunger").notNull().default(100),
  maxHunger: integer("max_hunger").notNull().default(100),
  /** 100 = hydrated, 0 = dehydrated */
  thirst: integer("thirst").notNull().default(100),
  maxThirst: integer("max_thirst").notNull().default(100),
  /** 100 = rested, 0 = exhausted */
  energy: integer("energy").notNull().default(100),
  maxEnergy: integer("max_energy").notNull().default(100),
  infectedPathogenKey: varchar("infected_pathogen_key", { length: 64 }),
  infectedAt: timestamp("infected_at", { withTimezone: true }),
  vaccinatedPathogenKey: varchar("vaccinated_pathogen_key", { length: 64 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pathogens = pgTable("pathogens", {
  key: varchar("key", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  transmissibility: integer("transmissibility").notNull().default(20),
  severity: integer("severity").notNull().default(10),
  description: text("description").notNull().default(""),
});

export const treatments = pgTable("treatments", {
  id: uuid("id").defaultRandom().primaryKey(),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id),
  kind: varchar("kind", { length: 64 }).notNull(),
  costCents: integer("cost_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// —— Phase 11: International ——
export const treaties = pgTable("treaties", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  countryAId: uuid("country_a_id")
    .notNull()
    .references(() => countries.id),
  countryBId: uuid("country_b_id")
    .notNull()
    .references(() => countries.id),
  kind: varchar("kind", { length: 32 }).notNull().default("peace"),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sanctions = pgTable("sanctions", {
  id: uuid("id").defaultRandom().primaryKey(),
  fromCountryId: uuid("from_country_id")
    .notNull()
    .references(() => countries.id),
  toCountryId: uuid("to_country_id")
    .notNull()
    .references(() => countries.id),
  reason: text("reason").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// —— Phase 12: Military ——
export const militaryUnits = pgTable("military_units", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id),
  name: varchar("name", { length: 128 }).notNull(),
  districtId: uuid("district_id").references(() => districts.id),
  strength: integer("strength").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wars = pgTable("wars", {
  id: uuid("id").defaultRandom().primaryKey(),
  aggressorCountryId: uuid("aggressor_country_id")
    .notNull()
    .references(() => countries.id),
  defenderCountryId: uuid("defender_country_id")
    .notNull()
    .references(() => countries.id),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const militaryOperations = pgTable("military_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  warId: uuid("war_id").references(() => wars.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => militaryUnits.id),
  targetDistrictId: uuid("target_district_id").references(() => districts.id),
  status: varchar("status", { length: 16 }).notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// —— Phase 13: Crime / courts / environment / NPCs ——
export const crimes = pgTable("crimes", {
  id: uuid("id").defaultRandom().primaryKey(),
  accusedCharacterId: uuid("accused_character_id")
    .notNull()
    .references(() => characters.id),
  kind: varchar("kind", { length: 64 }).notNull(),
  districtId: uuid("district_id").references(() => districts.id),
  status: varchar("status", { length: 16 }).notNull().default("reported"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courtCases = pgTable("court_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  crimeId: uuid("crime_id")
    .notNull()
    .references(() => crimes.id),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  verdict: varchar("verdict", { length: 32 }),
  fineCents: integer("fine_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const environmentMetrics = pgTable(
  "environment_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    districtId: uuid("district_id")
      .notNull()
      .references(() => districts.id),
    pollution: integer("pollution").notNull().default(10),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("environment_metrics_district_idx").on(t.districtId)],
);

export const npcs = pgTable("npcs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  role: varchar("role", { length: 64 }).notNull().default("civilian"),
  districtId: uuid("district_id").references(() => districts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Geological / natural resource catalog (iron, crude oil, …). */
export const resourceDefinitions = pgTable("resource_definitions", {
  key: varchar("key", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  unit: varchar("unit", { length: 32 }).notNull().default("tonne"),
  description: text("description").notNull().default(""),
  heatmapColor: varchar("heatmap_color", { length: 16 }).notNull().default("#c45c26"),
});

/** Real-world-ish deposit points; ownership of intersecting cells grants access. */
export const resourceDeposits = pgTable(
  "resource_deposits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceKey: varchar("resource_key", { length: 64 })
      .notNull()
      .references(() => resourceDefinitions.key),
    geom: geometryPoint("geom").notNull(),
    richness: real("richness").notNull().default(50),
    radiusM: integer("radius_m").notNull().default(25_000),
    remainingUnits: bigint("remaining_units", { mode: "number" }).notNull().default(1_000_000),
    label: varchar("label", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resource_deposits_resource_idx").on(t.resourceKey)],
);

/** Catalog of significant assets (cars, art, jewelry) — not petty inventory. */
export const assetDefinitions = pgTable("asset_definitions", {
  key: varchar("key", { length: 64 }).primaryKey(),
  category: varchar("category", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description").notNull().default(""),
  baseValueCents: integer("base_value_cents").notNull().default(0),
  tradable: boolean("tradable").notNull().default(true),
});

export const characterAssets = pgTable(
  "character_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    assetKey: varchar("asset_key", { length: 64 })
      .notNull()
      .references(() => assetDefinitions.key),
    title: varchar("title", { length: 128 }).notNull(),
    estimatedValueCents: integer("estimated_value_cents").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    condition: integer("condition").notNull().default(100),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    acquiredHow: varchar("acquired_how", { length: 32 }).notNull().default("purchase"),
  },
  (t) => [index("character_assets_character_idx").on(t.characterId)],
);

/** World Government / player listings for significant assets. */
export const assetListings = pgTable(
  "asset_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetKey: varchar("asset_key", { length: 64 })
      .notNull()
      .references(() => assetDefinitions.key),
    sellerCharacterId: uuid("seller_character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 128 }).notNull(),
    priceCents: integer("price_cents").notNull(),
    open: boolean("open").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("asset_listings_open_idx").on(t.open)],
);

/** World Government passport — universal character identity. */
export const characterPassports = pgTable(
  "character_passports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" })
      .unique(),
    passportNumber: varchar("passport_number", { length: 32 }).notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
  },
  (t) => [index("character_passports_character_idx").on(t.characterId)],
);

/** National identity card issued by a sovereign country. */
export const characterNationalIds = pgTable(
  "character_national_ids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "cascade" }),
    documentNumber: varchar("document_number", { length: 32 }).notNull().unique(),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("character_national_ids_one_per_country_uidx").on(t.characterId, t.countryId),
    index("character_national_ids_character_idx").on(t.characterId),
  ],
);

/** Track physical presence time in each country for citizenship residency. */
export const characterCountryPresence = pgTable(
  "character_country_presence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "cascade" }),
    firstEnteredAt: timestamp("first_entered_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the current continuous stay began (null if not currently present). */
    presenceStartedAt: timestamp("presence_started_at", { withTimezone: true }),
    lastLeftAt: timestamp("last_left_at", { withTimezone: true }),
    accumulatedMs: bigint("accumulated_ms", { mode: "number" }).notNull().default(0),
    currentlyPresent: boolean("currently_present").notNull().default(false),
  },
  (t) => [
    uniqueIndex("character_country_presence_uidx").on(t.characterId, t.countryId),
    index("character_country_presence_character_idx").on(t.characterId),
  ],
);
