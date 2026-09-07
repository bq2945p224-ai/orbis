import { Inject, Injectable } from "@nestjs/common";
import { auditLog } from "@orbis/db";
import { DbService } from "./db.service.js";

@Injectable()
export class AuditService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async record(
    action: string,
    opts: {
      accountId?: string | null;
      ip?: string | null;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    await this.dbService.db.insert(auditLog).values({
      action,
      accountId: opts.accountId ?? null,
      ip: opts.ip ?? null,
      metadata: opts.metadata ?? {},
    });
  }
}
