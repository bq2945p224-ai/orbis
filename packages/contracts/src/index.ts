import { z } from "zod";

export const WorldEventType = {
  AccountRegistered: "AccountRegistered",
  EmailVerified: "EmailVerified",
  CharacterCreated: "CharacterCreated",
  PlayerMoved: "PlayerMoved",
  TravelStarted: "TravelStarted",
  TravelArrived: "TravelArrived",
  EmployeeHired: "EmployeeHired",
  EmployeeResigned: "EmployeeResigned",
  WorldTick: "WorldTick",
  LedgerTransfer: "LedgerTransfer",
  SkillUnlocked: "SkillUnlocked",
  SkillTrainingStarted: "SkillTrainingStarted",
  SkillLevelGained: "SkillLevelGained",
  ParcelPurchased: "ParcelPurchased",
  LandCellPurchased: "LandCellPurchased",
  ResourcesExtracted: "ResourcesExtracted",
  AssetPurchased: "AssetPurchased",
  BuildingConstructed: "BuildingConstructed",
  CompanyFounded: "CompanyFounded",
  MessageSent: "MessageSent",
  OrgJoined: "OrgJoined",
  VoteCast: "VoteCast",
  ElectionClosed: "ElectionClosed",
  LawEnacted: "LawEnacted",
  MarketTrade: "MarketTrade",
  LoanIssued: "LoanIssued",
  Treated: "Treated",
  Infected: "Infected",
  ConsumedSupply: "ConsumedSupply",
  Foraged: "Foraged",
  CharacterDied: "CharacterDied",
  TreatySigned: "TreatySigned",
  WarDeclared: "WarDeclared",
  CrimeReported: "CrimeReported",
  CourtResolved: "CourtResolved",
  PassportIssued: "PassportIssued",
  NationalIdIssued: "NationalIdIssued",
} as const;

export type WorldEventType = (typeof WorldEventType)[keyof typeof WorldEventType];

const personName = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-zA-Z][a-zA-Z '\-]*$/, "Name may only contain letters, spaces, apostrophes, and hyphens");

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(128),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
  firstName: personName,
  lastName: personName,
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10).max(200),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email().max(320),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(10).max(128),
});

export const createCharacterSchema = z.object({
  firstName: personName,
  lastName: personName,
  districtId: z.string().uuid().optional(),
});

export const mapBboxSchema = z.object({
  minLng: z.coerce.number().min(-180).max(180),
  minLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const transferSchema = z.object({
  toCharacterId: z.string().uuid(),
  amountCents: z.number().int().positive().max(1_000_000_000),
  idempotencyKey: z.string().min(8).max(128),
  note: z.string().max(200).optional(),
});

export const travelSchema = z
  .object({
    /** Legacy district hop (still supported). */
    toDistrictId: z.string().uuid().optional(),
    /** Click a map point. */
    toLat: z.number().min(-90).max(90).optional(),
    toLng: z.number().min(-180).max(180).optional(),
    /** Travel to an existing building / house address. */
    toBuildingId: z.string().uuid().optional(),
    destinationLabel: z.string().min(1).max(256).optional(),
  })
  .refine(
    (v) =>
      Boolean(v.toDistrictId) ||
      Boolean(v.toBuildingId) ||
      (typeof v.toLat === "number" && typeof v.toLng === "number"),
    { message: "Provide toLat+toLng, toBuildingId, or toDistrictId" },
  );

export const travelQuoteSchema = z
  .object({
    toLat: z.number().min(-90).max(90).optional(),
    toLng: z.number().min(-180).max(180).optional(),
    toBuildingId: z.string().uuid().optional(),
    toDistrictId: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      Boolean(v.toDistrictId) ||
      Boolean(v.toBuildingId) ||
      (typeof v.toLat === "number" && typeof v.toLng === "number"),
    { message: "Provide a destination" },
  );

export const applyJobSchema = z.object({
  jobPostingId: z.string().uuid(),
});

export const focusSkillSchema = z.object({
  skillKey: z.string().min(2).max(64),
});

export const studyBuffSchema = z.object({
  mode: z.enum(["tutoring", "university"]),
  /** Recurring charge period — continues until cancelled or funds run out. */
  period: z.enum(["day", "week", "month", "year"]),
});

export const adminGrantMoneySchema = z.object({
  username: z.string().min(1).max(32),
  amountCents: z.number().int().positive().max(1_000_000_000_000),
  note: z.string().max(200).optional(),
});

export const buyParcelSchema = z.object({
  listingId: z.string().uuid(),
});

/** Buy a World Government land cell (1–1000 m side) by grid index or lng/lat. */
export const buyLandCellSchema = z
  .object({
    ix: z.number().int().optional(),
    iy: z.number().int().optional(),
    lng: z.number().min(-180).max(180).optional(),
    lat: z.number().min(-90).max(90).optional(),
    cellSizeM: z.union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)]).default(100),
  })
  .refine(
    (v) =>
      (typeof v.ix === "number" && typeof v.iy === "number") ||
      (typeof v.lng === "number" && typeof v.lat === "number"),
    { message: "Provide ix+iy or lng+lat" },
  );

export const mapGridSchema = z.object({
  minLng: z.coerce.number().min(-180).max(180),
  minLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  cellSizeM: z.coerce.number().int().refine((n) => [1, 10, 100, 1000].includes(n), {
    message: "cellSizeM must be 1, 10, 100, or 1000",
  }),
  limit: z.coerce.number().int().min(1).max(800).default(400),
});

export const mapResourcesSchema = z.object({
  minLng: z.coerce.number().min(-180).max(180),
  minLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  resource: z.string().min(2).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(800),
});

export const buyAssetListingSchema = z.object({
  listingId: z.string().uuid(),
});

export const listParcelSchema = z.object({
  parcelId: z.string().uuid(),
  priceCents: z.number().int().positive().max(1_000_000_000),
});

export const buildSchema = z.object({
  parcelId: z.string().uuid(),
  name: z.string().min(2).max(128),
  buildingType: z.enum(["shed", "house", "mansion", "skyscraper"]).default("house"),
});

export const buildQuoteSchema = z.object({
  parcelId: z.string().uuid(),
  buildingType: z.enum(["shed", "house", "mansion", "skyscraper"]),
});

export const createCompanySchema = z.object({
  name: z.string().min(2).max(128),
  description: z.string().max(500).optional(),
  districtId: z.string().uuid().optional(),
  seedCapitalCents: z.number().int().min(10_000).max(500_000).default(50_000),
  /** Industry sets primary skill — e.g. farm → agriculture (higher skill = more harvest). */
  industry: z.string().min(2).max(64).default("general"),
});

export const hireCompanySchema = z.object({
  companyId: z.string().uuid(),
  characterId: z.string().uuid(),
  title: z.string().min(1).max(128).default("Employee"),
  salaryCentsPerDay: z.number().int().positive().max(100_000).default(3500),
  /** Soft preference: hiring below this level still works but is called out. */
  minPreferredSkillLevel: z.number().int().min(0).max(100).optional(),
});

export const produceSchema = z.object({
  companyId: z.string().uuid(),
  productKey: z.enum(["food", "goods", "medicine", "materials"]),
  quantity: z.number().int().positive().max(100).default(1),
});

export const updateProfileSchema = z.object({
  bio: z.string().max(1000),
});

export const dmSchema = z.object({
  toCharacterId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export const createOrgSchema = z.object({
  name: z.string().min(2).max(128),
  orgType: z.string().min(2).max(64).default("association"),
  description: z.string().max(500).optional(),
});

export const joinOrgSchema = z.object({
  organizationId: z.string().uuid(),
});

export const createPartySchema = z.object({
  name: z.string().min(2).max(128),
  platform: z.string().max(1000).optional(),
});

export const voteSchema = z.object({
  electionId: z.string().uuid(),
  candidateCharacterId: z.string().uuid(),
});

export const enactLawSchema = z.object({
  title: z.string().min(2).max(128),
  body: z.string().min(2).max(5000),
});

export const marketListSchema = z.object({
  itemKey: z.string().min(2).max(64),
  quantity: z.number().int().positive().max(10_000),
  priceCentsEach: z.number().int().positive().max(1_000_000),
});

export const marketBuySchema = z.object({
  listingId: z.string().uuid(),
  quantity: z.number().int().positive().max(10_000),
});

export const loanRequestSchema = z.object({
  principalCents: z.number().int().min(1000).max(500_000),
});

export const treatSchema = z.object({
  kind: z.enum(["clinic", "vaccine"]),
});

export const consumeSupplySchema = z.object({
  itemKey: z.enum(["food", "water"]),
  quantity: z.number().int().min(1).max(20).default(1),
});

export const buySupplySchema = z.object({
  itemKey: z.enum(["food", "water"]),
  quantity: z.number().int().min(1).max(50).default(1),
});

export const forageSchema = z.object({
  kind: z.enum(["food", "water"]),
});

export const reportCrimeSchema = z.object({
  accusedCharacterId: z.string().uuid(),
  kind: z.string().min(2).max(64),
});

export const applyCitizenshipSchema = z.object({
  countryId: z.string().uuid(),
});

export const STARTING_BALANCE_CENTS = 100_000;

export * from "./land-grid.js";
export * from "./travel-ground.js";
export * from "./survival.js";
export * from "./skills-catalog.js";
export * from "./time-scale.js";

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type MapBboxInput = z.infer<typeof mapBboxSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type TravelInput = z.infer<typeof travelSchema>;
export type BuyLandCellInput = z.infer<typeof buyLandCellSchema>;
export type MapResourcesInput = z.infer<typeof mapResourcesSchema>;
export type MapGridInput = z.infer<typeof mapGridSchema>;
