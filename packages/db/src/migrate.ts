import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL ?? "postgresql://orbis:orbis@localhost:5432/orbis";
  const sql = postgres(url, { max: 1 });

  await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const migrationsDir = join(__dirname, "..", "drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const applied = await sql`SELECT 1 FROM schema_migrations WHERE id = ${file}`;
    if (applied.length > 0) {
      console.log(`skip ${file}`);
      continue;
    }
    const body = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (id) VALUES (${file})`;
    });
  }

  await sql.end();
  console.log("migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
