import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EconomyModule } from "../economy/economy.module.js";
import { SkillsController } from "./skills.controller.js";
import { SkillsService } from "./skills.service.js";

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
