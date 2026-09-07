import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  districts,
  orgMemberships,
  organizations,
  and,
  desc,
  eq,
  isNull,
} from "@orbis/db";
import { createOrgSchema, joinOrgSchema, WorldEventType } from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EventsService } from "../core/events.service.js";
import type { AuthedAccount } from "../auth/auth.guard.js";
import { requireLivingCharacter } from "../life/life.helpers.js";

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  async create(account: AuthedAccount, body: unknown) {
    const input = createOrgSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const districtId = character.locationDistrictId;

    const [org] = await db
      .insert(organizations)
      .values({
        name: input.name,
        orgType: input.orgType,
        description: input.description ?? "",
        districtId,
      })
      .returning();

    if (!org) throw new BadRequestException("Could not create organization");

    const [membership] = await db
      .insert(orgMemberships)
      .values({
        organizationId: org.id,
        characterId: character.id,
        role: "founder",
      })
      .returning();

    await this.events.emit({
      type: WorldEventType.OrgJoined,
      payload: { organizationId: org.id, role: "founder" },
      actorCharacterId: character.id,
      subjectType: "organization",
      subjectId: org.id,
    });

    return {
      organizationId: org.id,
      name: org.name,
      membershipId: membership!.id,
      role: "founder",
    };
  }

  async list(_account: AuthedAccount) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        orgType: organizations.orgType,
        description: organizations.description,
        districtId: organizations.districtId,
        districtName: districts.name,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .leftJoin(districts, eq(organizations.districtId, districts.id))
      .orderBy(desc(organizations.createdAt));

    return { organizations: rows };
  }

  async join(account: AuthedAccount, body: unknown) {
    const input = joinOrgSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    if (!org) throw new NotFoundException("Organization not found");

    const [existing] = await db
      .select()
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.organizationId, input.organizationId),
          eq(orgMemberships.characterId, character.id),
          isNull(orgMemberships.leftAt),
        ),
      )
      .limit(1);
    if (existing) throw new BadRequestException("Already a member");

    const [membership] = await db
      .insert(orgMemberships)
      .values({
        organizationId: input.organizationId,
        characterId: character.id,
        role: "member",
      })
      .returning();

    await this.events.emit({
      type: WorldEventType.OrgJoined,
      payload: { organizationId: input.organizationId, role: "member" },
      actorCharacterId: character.id,
      subjectType: "organization",
      subjectId: input.organizationId,
    });

    return {
      membershipId: membership!.id,
      organizationId: input.organizationId,
      role: "member",
    };
  }

  async leave(account: AuthedAccount, body: unknown) {
    const input = joinOrgSchema.parse(body);
    const db = this.dbService.db;
    const character = await requireLivingCharacter(db, account);

    const [membership] = await db
      .select()
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.organizationId, input.organizationId),
          eq(orgMemberships.characterId, character.id),
          isNull(orgMemberships.leftAt),
        ),
      )
      .limit(1);
    if (!membership) throw new BadRequestException("Not a member of this organization");
    if (membership.role === "founder") {
      throw new BadRequestException("Founders cannot leave their organization");
    }

    const [updated] = await db
      .update(orgMemberships)
      .set({ leftAt: new Date() })
      .where(eq(orgMemberships.id, membership.id))
      .returning();

    return {
      membershipId: updated!.id,
      organizationId: input.organizationId,
      leftAt: updated!.leftAt,
    };
  }
}
