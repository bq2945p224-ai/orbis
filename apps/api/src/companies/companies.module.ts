import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EconomyModule } from "../economy/economy.module.js";
import { CompaniesController } from "./companies.controller.js";
import { CompaniesService } from "./companies.service.js";

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
