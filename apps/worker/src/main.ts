import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { loadEnv } from "@orbis/config";
import { createDb } from "@orbis/db";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  advanceWorldClock,
  closeDueElections,
  completeTravelArrivals,
  processStudyXp,
  processStudySubscriptions,
  driftEnvironment,
  processInfections,
  processNeeds,
  processPayroll,
  processProduction,
  processPropertyTax,
  processLandResources,
  publishOutbox,
} from "./clock.js";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv();

const WORLD_TICK_JOB = "world-tick";
const OUTBOX_JOB = "outbox-publish";

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    // Upstash / managed Redis over TLS
    tls: env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
  });

  const queue = new Queue("orbis-sim", { connection });
  await queue.add(
    WORLD_TICK_JOB,
    {},
    {
      repeat: { every: env.WORLD_TICK_INTERVAL_MS },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  await queue.add(
    OUTBOX_JOB,
    {},
    {
      repeat: { every: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );

  let lastTickWall = Date.now();

  // eslint-disable-next-line no-new
  new Worker(
    "orbis-sim",
    async (job) => {
      if (job.name === WORLD_TICK_JOB) {
        const now = Date.now();
        const elapsed = now - lastTickWall;
        lastTickWall = now;
        const result = await advanceWorldClock(db, env.SIM_TIME_RATIO, elapsed);
        if (result.applied) {
          const arrivals = await completeTravelArrivals(db);
          const studyXp = await processStudyXp(db, result.deltaMs);
          const studyBilling = await processStudySubscriptions(db);
          const payroll = await processPayroll(db, result.deltaMs, result.tickVersion);
          const production = await processProduction(db);
          const infection = await processInfections(db, result.tickVersion);
          const needs = await processNeeds(db, result.deltaMs);
          const tax = await processPropertyTax(db, result.deltaMs, result.tickVersion);
          const landResources = await processLandResources(db, result.deltaMs);
          const election = await closeDueElections(db);
          const environment = await driftEnvironment(db);
          console.log("world tick", {
            ...result,
            arrivals,
            studyXp,
            studyBilling,
            payroll,
            production,
            infection,
            needs,
            tax,
            landResources,
            election,
            environment,
          });
          return {
            ...result,
            arrivals,
            studyXp,
            studyBilling,
            payroll,
            production,
            infection,
            needs,
            tax,
            landResources,
            election,
            environment,
          };
        }
        console.log("world tick", result);
        return result;
      }
      if (job.name === OUTBOX_JOB) {
        const count = await publishOutbox(db);
        if (count > 0) console.log(`outbox published ${count}`);
        return { count };
      }
    },
    { connection },
  );

  console.log(
    `Orbis worker running (tick every ${env.WORLD_TICK_INTERVAL_MS}ms, sim ratio ${env.SIM_TIME_RATIO}× — 1 game day ≈ ${24 / env.SIM_TIME_RATIO} real hours)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
