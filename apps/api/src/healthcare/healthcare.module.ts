import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EconomyModule } from "../economy/economy.module.js";
import { HealthcareController } from "./healthcare.controller.js";
import { HealthcareService } from "./healthcare.service.js";

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [HealthcareController],
  providers: [HealthcareService],
  exports: [HealthcareService],
})
export class HealthcareModule {}
