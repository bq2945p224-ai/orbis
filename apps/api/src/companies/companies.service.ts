import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  characters,
  characterSkills,
  cities,
  companies,
  companyEmployees,
  companyShares,
  districts,
  productionOrders,
  and,
  desc,
  eq,
  inArray,
  isNull,
} from "@orbis/db";
import {
  createCompanySchema,
  effectiveProductionQuantity,
  hireCompanySchema,
  INDUSTRY_CATALOG,
  industryByKey,
  PRODUCT_SKILL,
  produceSchema,
  WorldEventType,
} from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import { EconomyService } from "../economy/economy.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(EconomyService) private readonly economy: EconomyService,
  ) {}

  private resolveSkillKey(
    company: {
      industry: string;
      primarySkillKey: string | null;
    },
    productKey?: string,
  ): string {
    if (company.primarySkillKey) return company.primarySkillKey;
    const industry = industryByKey(company.industry);
    if (company.industry !== "general" || !productKey) return industry.primarySkillKey;
    return PRODUCT_SKILL[productKey] ?? industry.primarySkillKey;
  }

  private async workforceForSkill(
    companyId: string,
    founderCharacterId: string,
    skillKey: string,
  ) {
    const db = this.dbService.db;
    const employees = await db
      .select({
        characterId: companyEmployees.characterId,
        characterName: characters.name,
      })
      .from(companyEmployees)
      .innerJoin(characters, eq(companyEmployees.characterId, characters.id))
      .where(and(eq(companyEmployees.companyId, companyId), isNull(companyEmployees.endedAt)));

    const ids = new Set<string>([founderCharacterId, ...employees.map((e) => e.characterId)]);
    const workerIds = [...ids];

    const skillRows =
      workerIds.length === 0
        ? []
        : await db
            .select({
              characterId: characterSkills.characterId,
              level: characterSkills.level,
            })
            .from(characterSkills)
            .where(
              and(eq(characterSkills.skillKey, skillKey), inArray(characterSkills.characterId, workerIds)),
            );

    const levelById = new Map(skillRows.map((r) => [r.characterId, r.level]));
    const nameById = new Map(employees.map((e) => [e.characterId, e.characterName]));
    const [founder] = await db
      .select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(eq(characters.id, founderCharacterId))
      .limit(1);
    if (founder) nameById.set(founder.id, founder.name);

    const members = workerIds.map((id) => ({
      characterId: id,
      characterName: nameById.get(id) ?? "Unknown",
      skillLevel: levelById.get(id) ?? 0,
      isFounder: id === founderCharacterId,
    }));

    const avgSkillLevel =
      members.length === 0
        ? 0
        : members.reduce((sum, m) => sum + m.skillLevel, 0) / members.length;

    return {
      skillKey,
      workerCount: members.length,
      avgSkillLevel: Math.round(avgSkillLevel * 10) / 10,
      members: members.sort((a, b) => b.skillLevel - a.skillLevel),
    };
  }

  async create(account: AuthedAccount, body: unknown) {
    const input = createCompanySchema.parse(body);
    const db = this.dbService.db;
    const founder = await requireLivingCharacter(db, account);

    if (!INDUSTRY_CATALOG.some((i) => i.key === input.industry)) {
      throw new BadRequestException("Unknown industry");
    }
    const industry = industryByKey(input.industry);

    let districtId = input.districtId ?? founder.locationDistrictId;
    if (!districtId) throw new BadRequestException("District required to found a company");

    const [district] = await db.select().from(districts).where(eq(districts.id, districtId)).limit(1);
    if (!district) throw new NotFoundException("District not found");

    const idempotencyKey = `company-seed:${founder.id}:${input.name}`;
    await this.economy.debitCharacter(
      founder.id,
      input.seedCapitalCents,
      "company_seed_capital",
      idempotencyKey,
      { name: input.name },
    );

    const [company] = await db
      .insert(companies)
      .values({
        name: input.name,
        description: input.description ?? "",
        districtId,
        founderCharacterId: founder.id,
        treasuryCents: input.seedCapitalCents,
        industry: industry.key,
        primarySkillKey: industry.primarySkillKey,
      })
      .returning();

    if (!company) throw new BadRequestException("Could not create company");

    await db.insert(companyShares).values({
      companyId: company.id,
      characterId: founder.id,
      shares: 100,
    });

    await this.events.emit({
      type: WorldEventType.CompanyFounded,
      payload: {
        companyId: company.id,
        name: company.name,
        seedCapitalCents: input.seedCapitalCents,
        industry: company.industry,
        primarySkillKey: company.primarySkillKey,
      },
      actorCharacterId: founder.id,
      subjectType: "company",
      subjectId: company.id,
    });

    return {
      companyId: company.id,
      name: company.name,
      treasuryCents: company.treasuryCents,
      industry: company.industry,
      primarySkillKey: company.primarySkillKey,
      shares: 100,
    };
  }

  async list(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        description: companies.description,
        treasuryCents: companies.treasuryCents,
        founderCharacterId: companies.founderCharacterId,
        districtId: companies.districtId,
        industry: companies.industry,
        primarySkillKey: companies.primarySkillKey,
        districtName: districts.name,
        cityName: cities.name,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .innerJoin(districts, eq(companies.districtId, districts.id))
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .orderBy(desc(companies.createdAt));

    return {
      companies: rows,
      industries: INDUSTRY_CATALOG,
    };
  }

  async mine(account: AuthedAccount) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const founded = await db
      .select()
      .from(companies)
      .where(eq(companies.founderCharacterId, character.id));

    const shareRows = await db
      .select({
        companyId: companyShares.companyId,
        shares: companyShares.shares,
        name: companies.name,
      })
      .from(companyShares)
      .innerJoin(companies, eq(companyShares.companyId, companies.id))
      .where(eq(companyShares.characterId, character.id));

    const employeeRows = await db
      .select({
        id: companyEmployees.id,
        companyId: companyEmployees.companyId,
        title: companyEmployees.title,
        salaryCentsPerDay: companyEmployees.salaryCentsPerDay,
        startedAt: companyEmployees.startedAt,
        name: companies.name,
      })
      .from(companyEmployees)
      .innerJoin(companies, eq(companyEmployees.companyId, companies.id))
      .where(
        and(eq(companyEmployees.characterId, character.id), isNull(companyEmployees.endedAt)),
      );

    return {
      characterId: character.id,
      founded,
      shares: shareRows,
      employment: employeeRows,
    };
  }

  async getById(id: string) {
    const db = this.dbService.db;
    const [company] = await db
      .select({
        id: companies.id,
        name: companies.name,
        description: companies.description,
        treasuryCents: companies.treasuryCents,
        founderCharacterId: companies.founderCharacterId,
        districtId: companies.districtId,
        industry: companies.industry,
        primarySkillKey: companies.primarySkillKey,
        districtName: districts.name,
        cityName: cities.name,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .innerJoin(districts, eq(companies.districtId, districts.id))
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .where(eq(companies.id, id))
      .limit(1);

    if (!company) throw new NotFoundException("Company not found");

    const skillKey = this.resolveSkillKey(company);
    const workforce = await this.workforceForSkill(
      company.id,
      company.founderCharacterId,
      skillKey,
    );
    const yieldPreview = effectiveProductionQuantity(1, workforce.avgSkillLevel, workforce.workerCount);

    const employees = await db
      .select({
        id: companyEmployees.id,
        characterId: companyEmployees.characterId,
        characterName: characters.name,
        title: companyEmployees.title,
        salaryCentsPerDay: companyEmployees.salaryCentsPerDay,
        startedAt: companyEmployees.startedAt,
      })
      .from(companyEmployees)
      .innerJoin(characters, eq(companyEmployees.characterId, characters.id))
      .where(and(eq(companyEmployees.companyId, id), isNull(companyEmployees.endedAt)));

    const employeesWithSkill = employees.map((e) => {
      const member = workforce.members.find((m) => m.characterId === e.characterId);
      return { ...e, skillKey, skillLevel: member?.skillLevel ?? 0 };
    });

    const shareholders = await db
      .select({
        characterId: companyShares.characterId,
        characterName: characters.name,
        shares: companyShares.shares,
      })
      .from(companyShares)
      .innerJoin(characters, eq(companyShares.characterId, characters.id))
      .where(eq(companyShares.companyId, id));

    return {
      ...company,
      employees: employeesWithSkill,
      shareholders,
      workforce,
      yieldMultiplier: yieldPreview.multiplier,
    };
  }

  /** Local talent ranked by the company's primary skill — hire high levels for better yield. */
  async listTalent(account: AuthedAccount, companyId: string) {
    const db = this.dbService.db;
    await requireLivingCharacter(db, account);

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) throw new NotFoundException("Company not found");

    const skillKey = this.resolveSkillKey(company);

    const employed = await db
      .select({ characterId: companyEmployees.characterId })
      .from(companyEmployees)
      .where(isNull(companyEmployees.endedAt));
    const employedIds = new Set(employed.map((e) => e.characterId));

    const locals = await db
      .select({
        id: characters.id,
        name: characters.name,
        districtId: characters.locationDistrictId,
      })
      .from(characters)
      .where(and(eq(characters.status, "alive"), eq(characters.locationDistrictId, company.districtId)));

    const skillRows = await db
      .select({
        characterId: characterSkills.characterId,
        level: characterSkills.level,
      })
      .from(characterSkills)
      .where(eq(characterSkills.skillKey, skillKey));
    const levelById = new Map(skillRows.map((r) => [r.characterId, r.level]));

    const candidates = locals
      .filter((c) => c.id !== company.founderCharacterId && !employedIds.has(c.id))
      .map((c) => ({
        characterId: c.id,
        name: c.name,
        skillKey,
        skillLevel: levelById.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.skillLevel - a.skillLevel || a.name.localeCompare(b.name));

    return {
      companyId,
      industry: company.industry,
      primarySkillKey: skillKey,
      note: `Higher ${skillKey} levels produce more when this company runs production.`,
      candidates,
    };
  }

  async hire(account: AuthedAccount, body: unknown) {
    const input = hireCompanySchema.parse(body);
    const db = this.dbService.db;
    const founder = await requireLivingCharacter(db, account);

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    if (!company) throw new NotFoundException("Company not found");
    if (company.founderCharacterId !== founder.id) {
      throw new ForbiddenException("Only the founder can hire");
    }

    const [target] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, input.characterId), eq(characters.status, "alive")))
      .limit(1);
    if (!target) throw new NotFoundException("Character not found");

    const [active] = await db
      .select()
      .from(companyEmployees)
      .where(
        and(eq(companyEmployees.characterId, input.characterId), isNull(companyEmployees.endedAt)),
      )
      .limit(1);
    if (active) throw new BadRequestException("Character already employed at a company");

    const skillKey = this.resolveSkillKey(company);
    const [skillRow] = await db
      .select()
      .from(characterSkills)
      .where(
        and(
          eq(characterSkills.characterId, input.characterId),
          eq(characterSkills.skillKey, skillKey),
        ),
      )
      .limit(1);
    const skillLevel = skillRow?.level ?? 0;

    if (
      input.minPreferredSkillLevel !== undefined &&
      skillLevel < input.minPreferredSkillLevel
    ) {
      throw new BadRequestException(
        `Candidate has ${skillKey} L${skillLevel}; you required at least L${input.minPreferredSkillLevel}`,
      );
    }

    const [employment] = await db
      .insert(companyEmployees)
      .values({
        companyId: input.companyId,
        characterId: input.characterId,
        title: input.title,
        salaryCentsPerDay: input.salaryCentsPerDay,
      })
      .returning();

    if (!employment) throw new BadRequestException("Could not hire employee");

    await this.events.emit({
      type: WorldEventType.EmployeeHired,
      payload: {
        companyId: input.companyId,
        employmentId: employment.id,
        characterId: input.characterId,
        title: input.title,
        skillKey,
        skillLevel,
      },
      actorCharacterId: founder.id,
      subjectType: "company_employee",
      subjectId: employment.id,
    });

    return {
      employmentId: employment.id,
      characterId: input.characterId,
      title: employment.title,
      salaryCentsPerDay: employment.salaryCentsPerDay,
      skillKey,
      skillLevel,
      note:
        skillLevel >= 10
          ? `Strong hire — L${skillLevel} ${skillKey} will boost production yield.`
          : `Hired at L${skillLevel} ${skillKey}. Higher levels harvest/produce more.`,
    };
  }

  async produce(account: AuthedAccount, body: unknown) {
    const input = produceSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    if (!company) throw new NotFoundException("Company not found");

    const isFounder = company.founderCharacterId === character.id;
    const [employee] = await db
      .select()
      .from(companyEmployees)
      .where(
        and(
          eq(companyEmployees.companyId, input.companyId),
          eq(companyEmployees.characterId, character.id),
          isNull(companyEmployees.endedAt),
        ),
      )
      .limit(1);

    if (!isFounder && !employee) {
      throw new ForbiddenException("Must be founder or employee to queue production");
    }

    const skillKey = this.resolveSkillKey(company, input.productKey);
    const workforce = await this.workforceForSkill(
      company.id,
      company.founderCharacterId,
      skillKey,
    );
    const { quantity, multiplier } = effectiveProductionQuantity(
      input.quantity,
      workforce.avgSkillLevel,
      workforce.workerCount,
    );

    const [order] = await db
      .insert(productionOrders)
      .values({
        companyId: input.companyId,
        productKey: input.productKey,
        quantity,
        status: "queued",
      })
      .returning();

    if (!order) throw new BadRequestException("Could not queue production");

    return {
      orderId: order.id,
      companyId: order.companyId,
      productKey: order.productKey,
      baseQuantity: input.quantity,
      quantity: order.quantity,
      skillMultiplier: multiplier,
      skillKey,
      avgSkillLevel: workforce.avgSkillLevel,
      workerCount: workforce.workerCount,
      status: order.status,
    };
  }

  async resignEmployee(account: AuthedAccount, companyId: string) {
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [employment] = await db
      .select()
      .from(companyEmployees)
      .where(
        and(
          eq(companyEmployees.companyId, companyId),
          eq(companyEmployees.characterId, character.id),
          isNull(companyEmployees.endedAt),
        ),
      )
      .limit(1);
    if (!employment) throw new BadRequestException("You are not employed at this company");

    const [updated] = await db
      .update(companyEmployees)
      .set({ endedAt: new Date() })
      .where(eq(companyEmployees.id, employment.id))
      .returning();

    await this.events.emit({
      type: WorldEventType.EmployeeResigned,
      payload: { companyId, employmentId: employment.id },
      actorCharacterId: character.id,
      subjectType: "company_employee",
      subjectId: employment.id,
    });

    return {
      employmentId: updated!.id,
      companyId,
      endedAt: updated!.endedAt,
    };
  }
}
