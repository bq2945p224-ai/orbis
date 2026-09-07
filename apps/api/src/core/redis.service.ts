import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { loadEnv } from "@orbis/config";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    const env = loadEnv();
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  async connect() {
    if (this.client.status === "wait") {
      await this.client.connect();
    }
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
