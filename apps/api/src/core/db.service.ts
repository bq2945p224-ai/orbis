import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createDb, type OrbisDb } from "@orbis/db";
import { loadEnv } from "@orbis/config";

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly db: OrbisDb;

  constructor() {
    const env = loadEnv();
    this.db = createDb(env.DATABASE_URL);
  }

  async onModuleDestroy() {
    // postgres-js clients close with process exit
  }
}
