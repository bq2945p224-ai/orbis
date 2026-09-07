import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createDb } from "./index.js";
import {
  cities,
  countries,
  districts,
  elections,
  employers,
  environmentMetrics,
  jobPostings,
  militaryUnits,
  npcs,
  parcelListings,
  pathogens,
  politicalParties,
  regions,
  skillDefinitions,
  systemAccounts,
  worldClock,
  resourceDefinitions,
  assetDefinitions,
  assetListings,
  characterPassports,
  characters,
} from "./schema/index.js";
import { eq, sql, and } from "drizzle-orm";
import { SEED_SKILLS } from "./seed-skills.js";
import { countryIdForDistrict, syncPresenceOnDistrictMove } from "./presence.js";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv();

const RESOURCES = [
  {
    key: "crude_oil",
    name: "Crude oil",
    unit: "barrel",
    description: "Liquid petroleum.",
    heatmapColor: "#1a1a1a",
  },
  {
    key: "iron",
    name: "Iron ore",
    unit: "tonne",
    description: "Iron-bearing rock.",
    heatmapColor: "#8b4513",
  },
  {
    key: "copper",
    name: "Copper",
    unit: "tonne",
    description: "Copper ore.",
    heatmapColor: "#b87333",
  },
  {
    key: "coal",
    name: "Coal",
    unit: "tonne",
    description: "Carbon fuel deposits.",
    heatmapColor: "#2f2f2f",
  },
  {
    key: "natural_gas",
    name: "Natural gas",
    unit: "mcm",
    description: "Methane and associated gases.",
    heatmapColor: "#4a90a4",
  },
  {
    key: "gold",
    name: "Gold",
    unit: "kg",
    description: "Precious metal deposits.",
    heatmapColor: "#d4af37",
  },
  {
    key: "timber",
    name: "Timber",
    unit: "m3",
    description: "Harvestable forest biomass.",
    heatmapColor: "#2d6a4f",
  },
  {
    key: "fertile_soil",
    name: "Fertile soil",
    unit: "ha-eq",
    description: "High-yield agricultural land.",
    heatmapColor: "#6b8e23",
  },
] as const;

/** Simplified real-world deposit centroids (lng, lat, richness, radius_m). */
const DEPOSITS: Array<{
  resourceKey: (typeof RESOURCES)[number]["key"];
  lng: number;
  lat: number;
  richness: number;
  radiusM: number;
  label: string;
  remaining: number;
}> = [
  { resourceKey: "crude_oil", lng: 49.5, lat: 26.2, richness: 95, radiusM: 120_000, label: "Persian Gulf", remaining: 50_000_000 },
  { resourceKey: "crude_oil", lng: -93.2, lat: 28.5, richness: 80, radiusM: 90_000, label: "Gulf of Mexico", remaining: 20_000_000 },
  { resourceKey: "crude_oil", lng: 52.0, lat: 58.5, richness: 75, radiusM: 100_000, label: "West Siberia", remaining: 30_000_000 },
  { resourceKey: "crude_oil", lng: 6.5, lat: 60.5, richness: 70, radiusM: 80_000, label: "North Sea", remaining: 8_000_000 },
  { resourceKey: "crude_oil", lng: 9.2, lat: 45.5, richness: 35, radiusM: 40_000, label: "Po Basin", remaining: 500_000 },
  { resourceKey: "natural_gas", lng: 52.0, lat: 25.3, richness: 90, radiusM: 100_000, label: "Qatar North Field", remaining: 40_000_000 },
  { resourceKey: "natural_gas", lng: -103.5, lat: 31.5, richness: 85, radiusM: 90_000, label: "Permian Basin gas", remaining: 15_000_000 },
  { resourceKey: "iron", lng: -50.5, lat: -6.0, richness: 92, radiusM: 150_000, label: "Carajás", remaining: 25_000_000 },
  { resourceKey: "iron", lng: 118.5, lat: -22.5, richness: 90, radiusM: 140_000, label: "Pilbara", remaining: 30_000_000 },
  { resourceKey: "iron", lng: 33.5, lat: 68.0, richness: 78, radiusM: 80_000, label: "Kiruna", remaining: 5_000_000 },
  { resourceKey: "iron", lng: 8.7, lat: 45.7, richness: 40, radiusM: 35_000, label: "Lombardy foothills", remaining: 200_000 },
  { resourceKey: "copper", lng: -69.0, lat: -24.0, richness: 95, radiusM: 100_000, label: "Atacama copper belt", remaining: 12_000_000 },
  { resourceKey: "copper", lng: 27.5, lat: -12.5, richness: 88, radiusM: 90_000, label: "Copperbelt", remaining: 8_000_000 },
  { resourceKey: "copper", lng: -110.0, lat: 33.0, richness: 70, radiusM: 70_000, label: "Arizona copper", remaining: 4_000_000 },
  { resourceKey: "coal", lng: 116.4, lat: 39.9, richness: 85, radiusM: 120_000, label: "North China coal", remaining: 40_000_000 },
  { resourceKey: "coal", lng: 19.0, lat: 50.3, richness: 75, radiusM: 80_000, label: "Upper Silesia", remaining: 6_000_000 },
  { resourceKey: "coal", lng: -81.0, lat: 38.0, richness: 80, radiusM: 100_000, label: "Appalachian coal", remaining: 15_000_000 },
  { resourceKey: "gold", lng: 28.0, lat: -26.2, richness: 90, radiusM: 60_000, label: "Witwatersrand", remaining: 500_000 },
  { resourceKey: "gold", lng: 121.5, lat: -30.7, richness: 75, radiusM: 50_000, label: "Kalgoorlie", remaining: 200_000 },
  { resourceKey: "gold", lng: -120.5, lat: 38.5, richness: 55, radiusM: 40_000, label: "Sierra Nevada gold", remaining: 80_000 },
  { resourceKey: "timber", lng: -122.5, lat: 50.0, richness: 85, radiusM: 200_000, label: "Pacific Northwest", remaining: 10_000_000 },
  { resourceKey: "timber", lng: 105.0, lat: 60.0, richness: 90, radiusM: 300_000, label: "Siberian taiga", remaining: 50_000_000 },
  { resourceKey: "timber", lng: 14.5, lat: 46.0, richness: 50, radiusM: 50_000, label: "Alpine forests", remaining: 800_000 },
  { resourceKey: "fertile_soil", lng: -95.0, lat: 41.0, richness: 92, radiusM: 250_000, label: "US Midwest", remaining: 20_000_000 },
  { resourceKey: "fertile_soil", lng: 32.0, lat: 49.0, richness: 90, radiusM: 200_000, label: "Ukrainian chernozem", remaining: 18_000_000 },
  { resourceKey: "fertile_soil", lng: 10.5, lat: 45.0, richness: 70, radiusM: 60_000, label: "Po Valley farmland", remaining: 2_000_000 },
];

const ASSET_DEFS = [
  {
    key: "sedan",
    category: "vehicle",
    name: "Sedan",
    description: "Everyday four-door car.",
    baseValueCents: 1_500_000,
  },
  {
    key: "sports_car",
    category: "vehicle",
    name: "Sports car",
    description: "High-performance automobile.",
    baseValueCents: 8_000_000,
  },
  {
    key: "suv",
    category: "vehicle",
    name: "SUV",
    description: "Utility vehicle for travel and cargo.",
    baseValueCents: 3_200_000,
  },
  {
    key: "oil_painting",
    category: "art",
    name: "Oil painting",
    description: "Gallery-grade canvas work.",
    baseValueCents: 2_500_000,
  },
  {
    key: "sculpture",
    category: "art",
    name: "Sculpture",
    description: "Sculpted fine art piece.",
    baseValueCents: 4_000_000,
  },
  {
    key: "gold_watch",
    category: "jewelry",
    name: "Gold watch",
    description: "Luxury timepiece.",
    baseValueCents: 1_200_000,
  },
  {
    key: "diamond_necklace",
    category: "jewelry",
    name: "Diamond necklace",
    description: "High-value jewelry.",
    baseValueCents: 6_500_000,
  },
  {
    key: "vintage_wine",
    category: "collectible",
    name: "Vintage wine case",
    description: "Aged collectible bottles.",
    baseValueCents: 450_000,
  },
  {
    key: "antique_furniture",
    category: "collectible",
    name: "Antique furniture set",
    description: "Period furniture of lasting value.",
    baseValueCents: 900_000,
  },
  {
    key: "sailing_yacht",
    category: "vessel",
    name: "Sailing yacht",
    description: "Private sailing vessel.",
    baseValueCents: 25_000_000,
  },
  {
    key: "light_aircraft",
    category: "aircraft",
    name: "Light aircraft",
    description: "Private propeller plane.",
    baseValueCents: 40_000_000,
  },
] as const;

const WG_ASSET_LISTINGS: Array<{
  assetKey: (typeof ASSET_DEFS)[number]["key"];
  title: string;
  priceCents: number;
  metadata?: Record<string, unknown>;
}> = [
  { assetKey: "sedan", title: "Used city sedan", priceCents: 1_200_000, metadata: { year: 2019, color: "slate" } },
  { assetKey: "suv", title: "Field SUV", priceCents: 2_800_000, metadata: { year: 2021 } },
  { assetKey: "sports_car", title: "Milan sports coupe", priceCents: 7_500_000, metadata: { year: 2022 } },
  { assetKey: "oil_painting", title: "Landscape of the Navigli", priceCents: 2_200_000, metadata: { medium: "oil" } },
  { assetKey: "sculpture", title: "Bronze figure", priceCents: 3_800_000 },
  { assetKey: "gold_watch", title: "Heritage gold watch", priceCents: 1_100_000 },
  { assetKey: "diamond_necklace", title: "Estate diamond necklace", priceCents: 6_000_000 },
  { assetKey: "vintage_wine", title: "Barolo case (12)", priceCents: 420_000 },
  { assetKey: "antique_furniture", title: "Lombard dining set", priceCents: 850_000 },
  { assetKey: "sailing_yacht", title: "12m coastal yacht", priceCents: 22_000_000 },
  { assetKey: "light_aircraft", title: "Four-seat light aircraft", priceCents: 36_000_000 },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgresql://orbis:orbis@localhost:5432/orbis";
  const db = createDb(url);

  await db.execute(sql`DELETE FROM parcel_listings`);
  await db.execute(sql`DELETE FROM parcel_ownerships`);
  await db.execute(sql`DELETE FROM property_transfers`);
  await db.execute(sql`DELETE FROM buildings`);
  await db.execute(sql`DELETE FROM land_parcels`);
  await db.execute(sql`DELETE FROM resource_deposits`);

  for (const skill of SEED_SKILLS) {
    await db
      .insert(skillDefinitions)
      .values({
        key: skill.key,
        name: skill.name,
        description: skill.description,
        category: skill.category,
      })
      .onConflictDoUpdate({
        target: skillDefinitions.key,
        set: {
          name: skill.name,
          description: skill.description,
          category: skill.category,
        },
      });
  }

  for (const resource of RESOURCES) {
    await db
      .insert(resourceDefinitions)
      .values(resource)
      .onConflictDoNothing({ target: resourceDefinitions.key });
  }

  for (const dep of DEPOSITS) {
    await db.execute(sql`
      INSERT INTO resource_deposits (
        resource_key, geom, richness, radius_m, remaining_units, label
      ) VALUES (
        ${dep.resourceKey},
        ST_SetSRID(ST_MakePoint(${dep.lng}, ${dep.lat}), 4326),
        ${dep.richness},
        ${dep.radiusM},
        ${dep.remaining},
        ${dep.label}
      )
    `);
  }

  await db
    .insert(systemAccounts)
    .values({ key: "world_treasury", balanceCents: 50_000_000 })
    .onConflictDoNothing();

  await db
    .insert(pathogens)
    .values([
      {
        key: "orbis_flu",
        name: "Orbis Flu",
        transmissibility: 25,
        severity: 8,
        description: "Mild seasonal illness that spreads in dense districts.",
      },
      {
        key: "canal_fever",
        name: "Canal Fever",
        transmissibility: 15,
        severity: 18,
        description: "Waterborne fever along canal districts.",
      },
    ])
    .onConflictDoNothing();

  const existing = await db.select().from(countries).limit(1);
  let districtRows = await db.select().from(districts);
  let countryId: string;

  if (existing.length === 0) {
    const [country] = await db
      .insert(countries)
      .values({ code: "IT", name: "Italy" })
      .returning();
    if (!country) throw new Error("failed to insert country");
    countryId = country.id;

    const [region] = await db
      .insert(regions)
      .values({ countryId: country.id, code: "LOM", name: "Lombardy" })
      .returning();
    if (!region) throw new Error("failed to insert region");

    const [city] = await db
      .insert(cities)
      .values({
        regionId: region.id,
        name: "Milan",
        latitude: 45.4642,
        longitude: 9.19,
        biome: "mediterranean",
      })
      .returning();
    if (!city) throw new Error("failed to insert city");

    districtRows = await db
      .insert(districts)
      .values([
        { cityId: city.id, name: "Centro Storico", hasMarket: true },
        { cityId: city.id, name: "Porta Nuova", hasMarket: true },
        { cityId: city.id, name: "Navigli", hasMarket: true },
      ])
      .returning();

    await db.insert(worldClock).values({
      id: 1,
      simTime: new Date(),
      lastTickAt: new Date(),
      tickVersion: 0,
    });
  } else {
    countryId = existing[0]!.id;
    const [clock] = await db.select().from(worldClock).limit(1);
    if (!clock) {
      await db.insert(worldClock).values({
        id: 1,
        simTime: new Date(),
        lastTickAt: new Date(),
        tickVersion: 0,
      });
    }
  }

  if (districtRows.length === 0) {
    throw new Error("no districts available for employer seed");
  }

  const centro = districtRows.find((d) => d.name === "Centro Storico") ?? districtRows[0]!;
  const porta = districtRows.find((d) => d.name === "Porta Nuova") ?? districtRows[0]!;
  const navigli = districtRows.find((d) => d.name === "Navigli") ?? districtRows[0]!;

  // Seed a few sellable parcels (empty lots) as world stock
  const parcelSpecs = [
    { districtId: centro.id, label: "Centro Lot A", lng: 9.188, lat: 45.464, price: 75_000 },
    { districtId: centro.id, label: "Centro Lot B", lng: 9.19, lat: 45.465, price: 82_000 },
    { districtId: porta.id, label: "Porta Nuova Lot A", lng: 9.192, lat: 45.484, price: 95_000 },
    { districtId: porta.id, label: "Porta Nuova Lot B", lng: 9.194, lat: 45.485, price: 88_000 },
    { districtId: navigli.id, label: "Navigli Lot A", lng: 9.175, lat: 45.45, price: 60_000 },
    { districtId: navigli.id, label: "Navigli Lot B", lng: 9.177, lat: 45.451, price: 58_000 },
  ];

  for (const spec of parcelSpecs) {
    const half = 0.0004;
    const wkt = `POLYGON((${spec.lng - half} ${spec.lat - half},${spec.lng + half} ${spec.lat - half},${spec.lng + half} ${spec.lat + half},${spec.lng - half} ${spec.lat + half},${spec.lng - half} ${spec.lat - half}))`;
    const inserted = await db.execute(sql`
      INSERT INTO land_parcels (country_id, region_id, city_id, district_id, geom, area_m2, land_type, zoning, label)
      SELECT r.country_id, r.id, d.city_id, ${spec.districtId}::uuid,
             ST_GeomFromText(${wkt}, 4326), 2500, 'urban', 'mixed', ${spec.label}
      FROM districts d
      JOIN cities cty ON cty.id = d.city_id
      JOIN regions r ON r.id = cty.region_id
      WHERE d.id = ${spec.districtId}::uuid
      RETURNING id
    `);
    const rows = Array.isArray(inserted)
      ? inserted
      : ((inserted as { rows?: { id: string }[] }).rows ?? []);
    const parcelId = (rows[0] as { id?: string } | undefined)?.id;
    if (parcelId) {
      await db.insert(parcelListings).values({
        parcelId,
        sellerCharacterId: null,
        priceCents: spec.price,
        open: true,
      });
    }
  }

  // World Government — default employer / land office for new settlers
  let [worldGov] = await db
    .select()
    .from(employers)
    .where(eq(employers.systemKey, "world_government"))
    .limit(1);
  if (!worldGov) {
    [worldGov] = await db
      .insert(employers)
      .values({
        name: "World Government",
        districtId: centro.id,
        systemKey: "world_government",
        description:
          "The default civic authority. Hires new settlers, sells unclaimed land, and provides starter public work.",
      })
      .returning();
    if (worldGov) {
      await db.insert(jobPostings).values([
        {
          employerId: worldGov.id,
          title: "Settler",
          description: "Entry civic work for new arrivals. Assigned automatically at signup.",
          requiredSkillKey: "management",
          requiredSkillLevel: 0,
          salaryCentsPerDay: 2500,
        },
        {
          employerId: worldGov.id,
          title: "Records Clerk",
          description: "File land deeds and citizen paperwork.",
          requiredSkillKey: "law",
          requiredSkillLevel: 0,
          salaryCentsPerDay: 3200,
        },
        {
          employerId: worldGov.id,
          title: "Courier",
          description: "Carry notices between districts.",
          requiredSkillKey: "logistics",
          requiredSkillLevel: 0,
          salaryCentsPerDay: 3000,
        },
      ]);
    }
  }

  // Ensure every posting has a sector skill so payroll grants passive XP.
  await db.execute(sql`
    UPDATE job_postings SET required_skill_key = 'management', required_skill_level = 0
    WHERE title = 'Settler' AND required_skill_key IS NULL
  `);
  await db.execute(sql`
    UPDATE job_postings SET required_skill_key = 'law', required_skill_level = 0
    WHERE title = 'Records Clerk' AND required_skill_key IS NULL
  `);
  await db.execute(sql`
    UPDATE job_postings SET required_skill_key = 'construction', required_skill_level = 0
    WHERE title = 'General Laborer' AND required_skill_key IS NULL
  `);

  const existingEmployers = await db
    .select()
    .from(employers)
    .where(sql`${employers.systemKey} IS NULL OR ${employers.systemKey} <> 'world_government'`)
    .limit(1);
  if (existingEmployers.length === 0) {
    const [hospital] = await db
      .insert(employers)
      .values({
        name: "Milan Field Infirmary",
        districtId: centro.id,
        description: "Basic medical care for settlers.",
      })
      .returning();
    const [works] = await db
      .insert(employers)
      .values({
        name: "Porta Nuova Works",
        districtId: porta.id,
        description: "Construction and engineering labor.",
      })
      .returning();
    const [farms] = await db
      .insert(employers)
      .values({
        name: "Navigli Growers",
        districtId: navigli.id,
        description: "Agricultural work along the canals.",
      })
      .returning();

    if (hospital && works && farms) {
      await db.insert(jobPostings).values([
        {
          employerId: hospital.id,
          title: "Nurse Aide",
          description: "Assist with patient care.",
          requiredSkillKey: "medicine",
          requiredSkillLevel: 5,
          salaryCentsPerDay: 4500,
        },
        {
          employerId: hospital.id,
          title: "General Laborer",
          description: "Cleaning and supply runs.",
          requiredSkillKey: "construction",
          requiredSkillLevel: 0,
          salaryCentsPerDay: 2800,
        },
        {
          employerId: works.id,
          title: "Junior Engineer",
          description: "Help plan and build structures.",
          requiredSkillKey: "engineering",
          requiredSkillLevel: 10,
          salaryCentsPerDay: 6200,
        },
        {
          employerId: works.id,
          title: "Construction Worker",
          description: "Physical building work.",
          requiredSkillKey: "construction",
          requiredSkillLevel: 5,
          salaryCentsPerDay: 4000,
        },
        {
          employerId: farms.id,
          title: "Farm Hand",
          description: "Plant, harvest, and tend fields. Entry farming XP.",
          requiredSkillKey: "agriculture",
          requiredSkillLevel: 0,
          salaryCentsPerDay: 3200,
        },
        {
          employerId: farms.id,
          title: "Senior Farmer",
          description:
            "Lead harvest crews. Farms and farm companies prefer high agriculture — output scales with worker skill.",
          requiredSkillKey: "agriculture",
          requiredSkillLevel: 15,
          salaryCentsPerDay: 5800,
        },
        {
          employerId: farms.id,
          title: "Livestock Hand",
          description: "Tend cattle and dairy along the canals.",
          requiredSkillKey: "animal_husbandry",
          requiredSkillLevel: 5,
          salaryCentsPerDay: 4000,
        },
        {
          employerId: farms.id,
          title: "Orchard Keeper",
          description: "Prune and harvest specialty plantings.",
          requiredSkillKey: "horticulture",
          requiredSkillLevel: 8,
          salaryCentsPerDay: 4500,
        },
      ]);
    }
  }

  // Idempotent skilled farm roles (for worlds that already had Navigli Growers)
  const [growers] = await db
    .select()
    .from(employers)
    .where(eq(employers.name, "Navigli Growers"))
    .limit(1);
  if (growers) {
    const farmJobs: Array<{
      title: string;
      description: string;
      requiredSkillKey: string;
      requiredSkillLevel: number;
      salaryCentsPerDay: number;
    }> = [
      {
        title: "Senior Farmer",
        description:
          "Lead harvest crews. Farms and farm companies prefer high agriculture — output scales with worker skill.",
        requiredSkillKey: "agriculture",
        requiredSkillLevel: 15,
        salaryCentsPerDay: 5800,
      },
      {
        title: "Livestock Hand",
        description: "Tend cattle and dairy along the canals.",
        requiredSkillKey: "animal_husbandry",
        requiredSkillLevel: 5,
        salaryCentsPerDay: 4000,
      },
      {
        title: "Orchard Keeper",
        description: "Prune and harvest specialty plantings.",
        requiredSkillKey: "horticulture",
        requiredSkillLevel: 8,
        salaryCentsPerDay: 4500,
      },
    ];
    for (const job of farmJobs) {
      const existing = await db
        .select({ id: jobPostings.id })
        .from(jobPostings)
        .where(and(eq(jobPostings.employerId, growers.id), eq(jobPostings.title, job.title)))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(jobPostings).values({
          employerId: growers.id,
          ...job,
        });
      }
    }
  }

  const parties = await db.select().from(politicalParties).limit(1);
  if (parties.length === 0) {
    await db.insert(politicalParties).values([
      {
        name: "Civic Renewal",
        countryId,
        platform: "Build housing, fund clinics, keep canals clean.",
      },
      {
        name: "Trade League",
        countryId,
        platform: "Open markets, lower tariffs, expand logistics.",
      },
    ]);
  }

  const openElections = await db.select().from(elections).limit(1);
  if (openElections.length === 0) {
    await db.insert(elections).values({
      countryId,
      office: "mayor",
      status: "open",
      opensAt: new Date(),
      closesAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    });
  }

  const units = await db.select().from(militaryUnits).limit(1);
  if (units.length === 0) {
    await db.insert(militaryUnits).values({
      countryId,
      name: "1st Lombardy Guard",
      districtId: centro.id,
      strength: 120,
    });
  }

  for (const d of districtRows) {
    await db.insert(environmentMetrics).values({
      districtId: d.id,
      pollution: d.name === "Navigli" ? 22 : 12,
    });
  }

  const npcRows = await db.select().from(npcs).limit(1);
  if (npcRows.length === 0) {
    await db.insert(npcs).values([
      { name: "Clerk Bianchi", role: "civil_servant", districtId: centro.id },
      { name: "Dockhand Rossi", role: "laborer", districtId: navigli.id },
      { name: "Medic Conti", role: "medic", districtId: porta.id },
    ]);
  }

  for (const def of ASSET_DEFS) {
    await db
      .insert(assetDefinitions)
      .values({ ...def, tradable: true })
      .onConflictDoNothing({ target: assetDefinitions.key });
  }

  await db.execute(sql`UPDATE cities SET biome = 'mediterranean' WHERE name = 'Milan'`);
  await db.execute(sql`UPDATE districts SET has_market = true WHERE name IN ('Centro Storico', 'Porta Nuova', 'Navigli')`);

  // Desert travel test: Siwa Oasis region + remote outpost with no market
  const [egypt] = await db.select().from(countries).where(eq(countries.code, "EG")).limit(1);
  let egyptId = egypt?.id;
  if (!egyptId) {
    const [created] = await db
      .insert(countries)
      .values({ code: "EG", name: "Egypt" })
      .returning();
    egyptId = created?.id;
  }
  if (egyptId) {
    let [matruh] = await db.select().from(regions).where(eq(regions.code, "MT")).limit(1);
    if (!matruh) {
      [matruh] = await db
        .insert(regions)
        .values({ countryId: egyptId, code: "MT", name: "Matruh" })
        .returning();
    }
    if (matruh) {
      let [siwa] = await db.select().from(cities).where(eq(cities.name, "Siwa")).limit(1);
      if (!siwa) {
        [siwa] = await db
          .insert(cities)
          .values({
            regionId: matruh.id,
            name: "Siwa",
            latitude: 29.2032,
            longitude: 25.5195,
            biome: "desert",
          })
          .returning();
      } else {
        await db.execute(sql`UPDATE cities SET biome = 'desert' WHERE id = ${siwa.id}::uuid`);
      }
      if (siwa) {
        const [outpost] = await db
          .select()
          .from(districts)
          .where(eq(districts.name, "Western Desert Outpost"))
          .limit(1);
        if (!outpost) {
          await db.insert(districts).values({
            cityId: siwa.id,
            name: "Western Desert Outpost",
            hasMarket: false,
          });
        } else {
          await db.execute(
            sql`UPDATE districts SET has_market = false WHERE id = ${outpost.id}::uuid`,
          );
        }
      }
    }
  }

  await db.execute(sql`DELETE FROM asset_listings WHERE seller_character_id IS NULL`);
  for (const listing of WG_ASSET_LISTINGS) {
    await db.insert(assetListings).values({
      assetKey: listing.assetKey,
      sellerCharacterId: null,
      title: listing.title,
      priceCents: listing.priceCents,
      open: true,
      metadata: listing.metadata ?? {},
    });
  }

  await db.execute(sql`
    INSERT INTO inventories (owner_type, owner_id, item_key, quantity)
    SELECT 'character', c.id, 'food', 5
    FROM characters c
    WHERE c.status = 'alive'
      AND NOT EXISTS (
        SELECT 1 FROM inventories i
        WHERE i.owner_type = 'character' AND i.owner_id = c.id AND i.item_key = 'food'
      )
  `);
  await db.execute(sql`
    INSERT INTO inventories (owner_type, owner_id, item_key, quantity)
    SELECT 'character', c.id, 'water', 5
    FROM characters c
    WHERE c.status = 'alive'
      AND NOT EXISTS (
        SELECT 1 FROM inventories i
        WHERE i.owner_type = 'character' AND i.owner_id = c.id AND i.item_key = 'water'
      )
  `);

  // Citizenship policy: Italy is settler-friendly; Egypt requires sustained presence.
  await db.execute(sql`
    UPDATE countries SET citizenship_residency_days = 0, citizenship_requires_presence = true
    WHERE code = 'IT'
  `);
  await db.execute(sql`
    UPDATE countries SET citizenship_residency_days = 14, citizenship_requires_presence = true
    WHERE code = 'EG'
  `);

  // Backfill World Government passports + presence for existing characters
  const aliveChars = await db
    .select({
      id: characters.id,
      locationDistrictId: characters.locationDistrictId,
      createdAt: characters.createdAt,
    })
    .from(characters)
    .where(eq(characters.status, "alive"));
  for (const ch of aliveChars) {
    const [hasPassport] = await db
      .select({ id: characterPassports.id })
      .from(characterPassports)
      .where(eq(characterPassports.characterId, ch.id))
      .limit(1);
    if (!hasPassport) {
      const num = `WG-${ch.id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
      await db.insert(characterPassports).values({
        characterId: ch.id,
        passportNumber: num,
        issuedAt: ch.createdAt,
        status: "active",
      });
    }
    if (ch.locationDistrictId) {
      const countryId = await countryIdForDistrict(db, ch.locationDistrictId);
      if (countryId) {
        await syncPresenceOnDistrictMove(db, ch.id, null, ch.locationDistrictId, ch.createdAt);
        // Credit time since character creation for people already living there
        const createdIso = ch.createdAt.toISOString();
        await db.execute(sql`
          UPDATE character_country_presence
          SET accumulated_ms = GREATEST(
            accumulated_ms,
            (EXTRACT(EPOCH FROM (now() - ${createdIso}::timestamptz)) * 1000)::bigint
          ),
          presence_started_at = now(),
          currently_present = true
          WHERE character_id = ${ch.id}::uuid AND country_id = ${countryId}::uuid
        `);
      }
    }
  }

  console.log(
    "seed complete: geography, parcels, jobs, politics, pathogens, military, environment, resources, assets, survival, identity",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
