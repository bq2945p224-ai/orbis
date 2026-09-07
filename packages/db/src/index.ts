import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export * from "./schema/index.js";
export * from "./presence.js";
export { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

export type OrbisDb = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

export { schema };
