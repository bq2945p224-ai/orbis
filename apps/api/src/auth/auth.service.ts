import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import {
  accounts,
  emailVerificationTokens,
  ipObservations,
  loginAttempts,
  passwordResetTokens,
  sessions,
  sharedIpLinks,
  accountSecurityEvents,
  bankAccounts,
  characterHealth,
  characters,
  cities,
  characterPassports,
  districts,
  employers,
  employments,
  inventories,
  jobPostings,
  ledgerEntries,
  worldClock,
  and,
  eq,
  gt,
  isNull,
  ne,
  sql,
  syncPresenceOnDistrictMove,
} from "@orbis/db";
import { WorldEventType } from "@orbis/contracts";
import { DbService } from "../core/db.service.js";
import { EmailService } from "../core/email.service.js";
import { AuditService } from "../core/audit.service.js";
import { EventsService } from "../core/events.service.js";
import { ConfigService } from "../core/config.service.js";
import { createHash, randomBytes } from "node:crypto";

const SESSION_DAYS = 14;
const SESSION_COOKIE = "orbis_session";

function wgPassportNumber(characterId: string) {
  return `WG-${characterId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
export { SESSION_COOKIE };

@Injectable()
export class AuthService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private rawToken() {
    return randomBytes(32).toString("base64url");
  }

  async register(
    input: {
      email: string;
      password: string;
      username: string;
      firstName: string;
      lastName: string;
    },
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    const db = this.dbService.db;
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const characterName = `${firstName} ${lastName}`;
    const requireVerification = Boolean(this.config.env.REQUIRE_EMAIL_VERIFICATION);

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    let account;
    try {
      [account] = await db
        .insert(accounts)
        .values({
          email,
          username,
          passwordHash,
          emailVerifiedAt: requireVerification ? null : new Date(),
        })
        .returning();
    } catch {
      throw new BadRequestException("Email or username already in use");
    }
    if (!account) throw new BadRequestException("Could not create account");

    if (requireVerification) {
      const token = this.rawToken();
      await db.insert(emailVerificationTokens).values({
        accountId: account.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      });

      const verifyUrl = `${this.config.env.WEB_ORIGIN}/verify-email?token=${token}`;
      await this.email.send(
        email,
        "Verify your Orbis account",
        `Welcome to Orbis.\n\nVerify your email: ${verifyUrl}\n\nIf you did not register, ignore this message.`,
      );
    }

    const [wg] = await db
      .select()
      .from(employers)
      .where(eq(employers.systemKey, "world_government"))
      .limit(1);
    const spawnDistrictId = wg?.districtId ?? (await db.select().from(districts).limit(1))[0]?.id;
    if (!spawnDistrictId) throw new BadRequestException("World geography not seeded");

    const [spawn] = await db
      .select({
        districtId: districts.id,
        lat: cities.latitude,
        lng: cities.longitude,
      })
      .from(districts)
      .innerJoin(cities, eq(districts.cityId, cities.id))
      .where(eq(districts.id, spawnDistrictId))
      .limit(1);

    const [character] = await db
      .insert(characters)
      .values({
        accountId: account.id,
        name: characterName,
        locationDistrictId: spawnDistrictId,
        latitude: spawn?.lat ?? null,
        longitude: spawn?.lng ?? null,
        status: "alive",
      })
      .returning();

    if (!character) throw new BadRequestException("Could not create character");

    const [passport] = await db
      .insert(characterPassports)
      .values({
        characterId: character.id,
        passportNumber: wgPassportNumber(character.id),
        status: "active",
      })
      .returning();
    if (passport) {
      await this.events.emit({
        type: WorldEventType.PassportIssued,
        payload: { passportNumber: passport.passportNumber, issuer: "world_government" },
        actorCharacterId: character.id,
        subjectType: "character_passport",
        subjectId: passport.id,
      });
    }

    await syncPresenceOnDistrictMove(
      db,
      character.id,
      null,
      spawnDistrictId,
      (await db.select().from(worldClock).where(eq(worldClock.id, 1)).limit(1))[0]?.simTime ??
        new Date(),
    );

    const startingBalance = this.config.env.STARTING_BALANCE_CENTS;
    const [wallet] = await db
      .insert(bankAccounts)
      .values({
        characterId: character.id,
        balanceCents: startingBalance,
      })
      .returning();
    if (wallet && startingBalance > 0) {
      await db.insert(ledgerEntries).values({
        idempotencyKey: `signup-grant:${character.id}`,
        fromAccountId: null,
        toAccountId: wallet.id,
        amountCents: startingBalance,
        reason: "signup_grant",
        metadata: {},
      });
    }

    await db
      .insert(characterHealth)
      .values({ characterId: character.id })
      .onConflictDoNothing();

    // Starter rations so new settlers aren't stranded hungry.
    await db.insert(inventories).values([
      {
        ownerType: "character",
        ownerId: character.id,
        itemKey: "food",
        quantity: 5,
      },
      {
        ownerType: "character",
        ownerId: character.id,
        itemKey: "water",
        quantity: 5,
      },
    ]);

    // Auto-hire into World Government Settler job
    if (wg) {
      const [settlerJob] = await db
        .select()
        .from(jobPostings)
        .where(
          and(
            eq(jobPostings.employerId, wg.id),
            eq(jobPostings.title, "Settler"),
            eq(jobPostings.open, true),
          ),
        )
        .limit(1);
      if (settlerJob) {
        await db.insert(employments).values({
          characterId: character.id,
          employerId: wg.id,
          jobPostingId: settlerJob.id,
          title: settlerJob.title,
          salaryCentsPerDay: settlerJob.salaryCentsPerDay,
        });
        await this.events.emit({
          type: WorldEventType.EmployeeHired,
          payload: {
            employmentTitle: settlerJob.title,
            employer: "World Government",
            via: "signup",
          },
          actorCharacterId: character.id,
          subjectType: "character",
          subjectId: character.id,
        });
      }
    }

    await this.audit.record("account.register", {
      accountId: account.id,
      ip: meta.ip,
      metadata: { username, characterName, startingBalance },
    });
    await this.events.emit({
      type: WorldEventType.AccountRegistered,
      payload: { accountId: account.id, username },
      subjectType: "account",
      subjectId: account.id,
    });
    await this.events.emit({
      type: WorldEventType.CharacterCreated,
      payload: { characterId: character.id, name: character.name },
      actorCharacterId: character.id,
      subjectType: "character",
      subjectId: character.id,
    });

    const session = await this.createSession(account.id, meta);

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      account: {
        id: account.id,
        email: account.email,
        username: account.username,
        emailVerified: Boolean(account.emailVerifiedAt),
      },
      character: {
        id: character.id,
        name: character.name,
      },
    };
  }

  private async createSession(
    accountId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const db = this.dbService.db;
    const raw = this.rawToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({
      accountId,
      tokenHash: this.hashToken(raw),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt,
    });
    if (meta.ip) {
      await this.recordIpObservation(accountId, meta.ip);
    }
    return { token: raw, expiresAt };
  }

  async verifyEmail(token: string, ip?: string) {
    const db = this.dbService.db;
    const tokenHash = this.hashToken(token);
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) throw new BadRequestException("Invalid or expired verification token");

    await db
      .update(accounts)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(accounts.id, row.accountId));
    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id));

    await this.audit.record("account.verify_email", { accountId: row.accountId, ip });
    await this.events.emit({
      type: WorldEventType.EmailVerified,
      payload: { accountId: row.accountId },
      subjectType: "account",
      subjectId: row.accountId,
    });

    return { ok: true };
  }

  async login(
    input: { email: string; password: string },
    meta: { ip?: string; userAgent?: string },
  ) {
    const db = this.dbService.db;
    const email = input.email.trim().toLowerCase();
    const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);

    const fail = async () => {
      await db.insert(loginAttempts).values({
        accountId: account?.id ?? null,
        email,
        ip: meta.ip ?? null,
        success: false,
      });
      throw new UnauthorizedException("Invalid email or password");
    };

    if (!account) await fail();

    const ok = await argon2.verify(account!.passwordHash, input.password);
    if (!ok) await fail();

    await db.insert(loginAttempts).values({
      accountId: account!.id,
      email,
      ip: meta.ip ?? null,
      success: true,
    });

    const session = await this.createSession(account!.id, meta);

    await this.audit.record("account.login", {
      accountId: account!.id,
      ip: meta.ip,
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      account: {
        id: account!.id,
        email: account!.email,
        username: account!.username,
        emailVerified: Boolean(account!.emailVerifiedAt),
      },
    };
  }

  async logout(token: string | undefined, ip?: string) {
    if (!token) return { ok: true };
    const db = this.dbService.db;
    const tokenHash = this.hashToken(token);
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    if (session && !session.revokedAt) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, session.id));
      await this.audit.record("account.logout", { accountId: session.accountId, ip });
    }
    return { ok: true };
  }

  async revokeAllSessions(accountId: string, ip?: string) {
    const db = this.dbService.db;
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)));
    await this.audit.record("account.revoke_sessions", { accountId, ip });
    return { ok: true };
  }

  async requestPasswordReset(emailRaw: string, ip?: string) {
    const db = this.dbService.db;
    const email = emailRaw.trim().toLowerCase();
    const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
    // Always succeed to avoid account enumeration
    if (!account) return { ok: true };

    const token = this.rawToken();
    await db.insert(passwordResetTokens).values({
      accountId: account.id,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    const url = `${this.config.env.WEB_ORIGIN}/reset-password?token=${token}`;
    await this.email.send(
      email,
      "Reset your Orbis password",
      `Reset your password: ${url}\n\nIf you did not request this, ignore this message.`,
    );
    await db.insert(accountSecurityEvents).values({
      accountId: account.id,
      type: "password_reset_requested",
      metadata: {},
    });
    await this.audit.record("account.password_reset_request", { accountId: account.id, ip });
    return { ok: true };
  }

  async confirmPasswordReset(token: string, password: string, ip?: string) {
    const db = this.dbService.db;
    const tokenHash = this.hashToken(token);
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row) throw new BadRequestException("Invalid or expired reset token");

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await db
      .update(accounts)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(accounts.id, row.accountId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
    await this.revokeAllSessions(row.accountId, ip);
    await db.insert(accountSecurityEvents).values({
      accountId: row.accountId,
      type: "password_reset_completed",
      metadata: {},
    });
    await this.audit.record("account.password_reset", { accountId: row.accountId, ip });
    return { ok: true };
  }

  async resolveSession(token: string | undefined) {
    if (!token) throw new UnauthorizedException("Not authenticated");
    const db = this.dbService.db;
    const tokenHash = this.hashToken(token);
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!session) throw new UnauthorizedException("Session expired or revoked");

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, session.accountId))
      .limit(1);
    if (!account || account.status !== "active") {
      throw new UnauthorizedException("Account inactive");
    }

    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, session.id));

    return { session, account };
  }

  requireVerified(account: { emailVerifiedAt: Date | null }) {
    if (this.config.env.REQUIRE_EMAIL_VERIFICATION && !account.emailVerifiedAt) {
      throw new ForbiddenException("Email verification required");
    }
  }

  async recordIpObservation(accountId: string, ip: string) {
    const db = this.dbService.db;
    await db
      .insert(ipObservations)
      .values({ accountId, ip, count: 1 })
      .onConflictDoUpdate({
        target: [ipObservations.accountId, ipObservations.ip],
        set: {
          lastSeenAt: new Date(),
          count: sql`${ipObservations.count} + 1`,
        },
      });

    const others = await db
      .select({ accountId: ipObservations.accountId })
      .from(ipObservations)
      .where(and(eq(ipObservations.ip, ip), ne(ipObservations.accountId, accountId)));

    for (const other of others) {
      const [a, b] =
        accountId < other.accountId ? [accountId, other.accountId] : [other.accountId, accountId];
      await db
        .insert(sharedIpLinks)
        .values({
          accountAId: a,
          accountBId: b,
          evidenceStrength: 1,
        })
        .onConflictDoUpdate({
          target: [sharedIpLinks.accountAId, sharedIpLinks.accountBId],
          set: {
            lastDetectedAt: new Date(),
            evidenceStrength: sql`${sharedIpLinks.evidenceStrength} + 1`,
          },
        });
      await db.insert(accountSecurityEvents).values({
        accountId,
        type: "shared_ip_signal",
        metadata: { linkedAccountId: other.accountId },
      });
    }
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.env.COOKIE_SECURE,
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    };
  }
}
