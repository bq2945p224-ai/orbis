import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { accounts, characters, and, eq, sql } from "@orbis/db";
import { adminGrantMoneySchema } from "@orbis/contracts";
import { randomUUID } from "node:crypto";
import { DbService } from "../core/db.service.js";
import { ConfigService } from "../core/config.service.js";
import { AuditService } from "../core/audit.service.js";
import { EconomyService } from "../economy/economy.service.js";

@Injectable()
export class AdminService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EconomyService) private readonly economy: EconomyService,
  ) {}

  assertAdminSecret(provided: string | undefined) {
    const expected = this.config.env.ADMIN_SECRET?.trim() ?? "";
    if (!expected) {
      throw new ServiceUnavailableException(
        "Admin tools are disabled (set ADMIN_SECRET in the environment)",
      );
    }
    if (!provided || provided !== expected) {
      throw new ForbiddenException("Invalid admin secret");
    }
  }

  async grantMoney(body: unknown, adminSecret: string | undefined, ip?: string) {
    this.assertAdminSecret(adminSecret);
    const input = adminGrantMoneySchema.parse(body);
    const db = this.dbService.db;
    const username = input.username.trim();

    const [account] = await db
      .select()
      .from(accounts)
      .where(sql`lower(${accounts.username}) = lower(${username})`)
      .limit(1);
    if (!account) throw new NotFoundException(`No account with username "${username}"`);

    const [character] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.accountId, account.id), eq(characters.status, "alive")))
      .limit(1);
    if (!character) {
      throw new NotFoundException(`Account "${username}" has no living character`);
    }

    await this.economy.ensureWallet(character.id, 0);
    const entry = await this.economy.creditCharacter(
      character.id,
      input.amountCents,
      "admin_grant",
      `admin-grant:${character.id}:${randomUUID()}`,
      {
        username: account.username,
        note: input.note ?? null,
      },
    );

    const wallet = await this.economy.ensureWallet(character.id, 0);

    await this.audit.record("admin.grant_money", {
      accountId: account.id,
      ip,
      metadata: {
        username: account.username,
        characterId: character.id,
        amountCents: input.amountCents,
        note: input.note ?? null,
        ledgerEntryId: entry?.id ?? null,
      },
    });

    return {
      ok: true,
      username: account.username,
      characterId: character.id,
      characterName: character.name,
      amountCents: input.amountCents,
      balanceCents: wallet.balanceCents,
    };
  }
}
