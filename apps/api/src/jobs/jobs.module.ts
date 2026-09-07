import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { SkillsModule } from "../skills/skills.module.js";
import { JobsController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";

@Module({
  imports: [AuthModule, SkillsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
