import { Global, Module } from "@nestjs/common";
import { ConfigService } from "./config.service.js";
import { DbService } from "./db.service.js";
import { RedisService } from "./redis.service.js";
import { EmailService } from "./email.service.js";
import { AuditService } from "./audit.service.js";
import { EventsService } from "./events.service.js";
import { RateLimitService } from "./rate-limit.service.js";

@Global()
@Module({
  providers: [
    ConfigService,
    DbService,
    RedisService,
    EmailService,
    AuditService,
    EventsService,
    RateLimitService,
  ],
  exports: [
    ConfigService,
    DbService,
    RedisService,
    EmailService,
    AuditService,
    EventsService,
    RateLimitService,
  ],
})
export class CoreModule {}
